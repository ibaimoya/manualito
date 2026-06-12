import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, isAbortApiError, type ManualProcessingResponse } from '@/shared/api/client';
import { manualDetailQueryOptions } from '@/features/manual/use-manuals';
import { storage, type ManualResult } from '@/shared/lib/storage';

type StepId = 'processing' | 'summary' | 'setup' | 'turn' | 'win';
type StepState = 'pending' | 'running' | 'done' | 'failed';

interface StepRecord {
  id: StepId;
  label: string;
  state: StepState;
  text?: string;
  error?: string;
}

const POLL_INTERVAL_MS = 1500;
const QUESTIONS: ReadonlyArray<{ id: Exclude<StepId, 'processing'>; label: string; question: string }> = [
  {
    id: 'summary',
    label: 'Resumen',
    question:
      'Resume en 2-3 frases de qué va este juego, indicando número de jugadores y duración aproximada si lo dice el manual.',
  },
  {
    id: 'setup',
    label: 'Preparación',
    question:
      'Explica la preparación inicial del juego, paso a paso, en una lista numerada clara y concisa.',
  },
  {
    id: 'turn',
    label: '¿Cómo van los turnos?',
    question:
      'Explica cómo es un turno de un jugador: en qué fases se divide y qué acciones puede o debe hacer.',
  },
  {
    id: 'win',
    label: '¿Cómo se gana?',
    question:
      'Explica cómo se gana la partida y cualquier condición de empate o final alternativo.',
  },
];

type QuestionStep = (typeof QUESTIONS)[number];
type PatchStep = (id: StepId, patch: Partial<StepRecord>) => void;

function initialSteps(): StepRecord[] {
  return [
    { id: 'processing', label: 'Procesando páginas', state: 'running' },
    ...QUESTIONS.map((step) => ({ id: step.id, label: step.label, state: 'pending' as const })),
  ];
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.view.message : 'Error inesperado';
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function processingText(status: ManualProcessingResponse): string {
  return `${status.completed_pages}/${status.page_count} páginas`;
}

async function waitUntilManualReady(
  manualId: string,
  signal: AbortSignal,
  patchStep: PatchStep,
): Promise<boolean> {
  while (true) {
    const status = await api.getManualProcessing(manualId, signal);
    if (status.status === 'failed') {
      patchStep('processing', {
        state: 'failed',
        error: 'No se ha podido leer texto útil del manual.',
      });
      return false;
    }
    if (status.status !== 'indexing') {
      patchStep('processing', { state: 'done', text: processingText(status) });
      return true;
    }
    patchStep('processing', { state: 'running', text: processingText(status) });
    await sleep(POLL_INTERVAL_MS, signal);
  }
}

async function runBootstrapStep(
  gameId: string,
  step: QuestionStep,
  signal: AbortSignal,
  patchStep: PatchStep,
): Promise<string | null> {
  patchStep(step.id, { state: 'running' });
  try {
    const res = await api.askGame(gameId, step.question, undefined, signal);
    patchStep(step.id, { state: 'done', text: res.answer });
    return res.answer;
  } catch (err) {
    if (isAbortApiError(err)) return null;
    patchStep(step.id, { state: 'failed', error: errorMessage(err) });
    return null;
  }
}

function failPendingQuestions(patchStep: PatchStep, error: string): void {
  for (const step of QUESTIONS) {
    patchStep(step.id, { state: 'failed', error });
  }
}

function buildManualResult(
  manualId: string,
  manualName: string,
  settledAnswers: PromiseSettledResult<string | null>[],
): ManualResult {
  const [summary = '', setup = '', turn = '', win = ''] = settledAnswers.map((result) =>
    result.status === 'fulfilled' && typeof result.value === 'string'
      ? result.value
      : '',
  );

  return {
    manual_id: manualId,
    name: manualName,
    summary,
    setup,
    turn,
    win,
    created_at: new Date().toISOString(),
  };
}

export interface BootstrapState {
  steps: StepRecord[];
  progress: number;
  done: boolean;
  hasAnyAnswer: boolean;
  result: ManualResult | null;
}

export function useManualBootstrap(manualId: string, manualName: string): BootstrapState {
  const queryClient = useQueryClient();
  const [steps, setSteps] = useState<StepRecord[]>(initialSteps);
  const [result, setResult] = useState<ManualResult | null>(null);
  const manualNameRef = useRef(manualName);
  const mountedRef = useRef(true);

  useEffect(() => {
    manualNameRef.current = manualName;
  }, [manualName]);

  useEffect(() => {
    mountedRef.current = true;

    const controller = new AbortController();
    const patchStep: PatchStep = (id, patch) => {
      if (!mountedRef.current) return;
      setSteps((previous) => patchSteps(previous, id, patch));
    };

    async function run(): Promise<void> {
      try {
        const ready = await waitUntilManualReady(manualId, controller.signal, patchStep);
        if (!ready) {
          failPendingQuestions(patchStep, 'El manual no se ha podido indexar.');
          return;
        }
        // fetchQuery calienta la cache para /result; retry como el fetch directo.
        const manual = await queryClient.fetchQuery({
          ...manualDetailQueryOptions(manualId),
          retry: false,
        });
        const results = await Promise.allSettled(
          QUESTIONS.map((step) =>
            runBootstrapStep(manual.game_id, step, controller.signal, patchStep),
          ),
        );
        if (!mountedRef.current) return;
        const built = buildManualResult(manualId, manualNameRef.current, results);
        storage.setResult(built);
        setResult(built);
      } catch (err) {
        if (isAbortApiError(err)) return;
        patchStep('processing', { state: 'failed', error: errorMessage(err) });
        failPendingQuestions(patchStep, 'No se ha podido consultar el estado.');
      }
    }

    run().catch(() => undefined);

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [manualId, queryClient]);

  const doneCount = steps.filter((step) => step.state === 'done').length;
  const failedCount = steps.filter((step) => step.state === 'failed').length;
  const progress = Math.round(((doneCount + failedCount) / steps.length) * 100);
  const done = doneCount + failedCount === steps.length;
  const hasAnyAnswer = steps.some((step) => step.id !== 'processing' && step.state === 'done');
  const currentResult = result?.manual_id === manualId ? result : null;

  return { steps, progress, done, hasAnyAnswer, result: currentResult };
}

function patchSteps(
  steps: StepRecord[],
  id: StepId,
  patch: Partial<StepRecord>,
): StepRecord[] {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}
