import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { storage, type ManualResult } from '@/shared/lib/storage';

/**
 * Hook que orquesta las 4 preguntas iniciales al backend para llenar el Result.
 *
 * Por qué 4 mutations paralelas (decisión §25):
 * El endpoint POST /api/manuals solo devuelve { manual_id, chunks_indexed, status }
 * — no genera explicación.  Para tener algo útil en el Result Screen, lanzamos
 * 4 POST /api/manuals/{id}/questions con preguntas pre-fabricadas y mostramos
 * cada resultado en su acordeón conforme va llegando.
 *
 * Promise.allSettled (no Promise.all): si una pregunta falla, las demás siguen.
 * Coste: ~4× LLM (~30-60s en GPU local).
 */

type StepId = 'summary' | 'setup' | 'turn' | 'win';

type StepState = 'pending' | 'running' | 'done' | 'failed';

interface StepRecord {
  id: StepId;
  label: string;
  state: StepState;
  text?: string;
  error?: string;
}

const STEPS: ReadonlyArray<{ id: StepId; label: string; question: string }> = [
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
    label: 'El turno',
    question:
      'Explica cómo es un turno de un jugador: en qué fases se divide y qué acciones puede o debe hacer.',
  },
  {
    id: 'win',
    label: 'Cómo se gana',
    question:
      'Explica cómo se gana la partida y cualquier condición de empate o final alternativo.',
  },
];

type StepDefinition = (typeof STEPS)[number];
type PatchStep = (id: StepId, patch: Partial<StepRecord>) => void;
type SetSteps = (updater: (previous: StepRecord[]) => StepRecord[]) => void;
type MountedStateRef = { current: boolean };

function updateStepRecords(
  records: StepRecord[],
  id: StepId,
  patch: Partial<StepRecord>,
): StepRecord[] {
  return records.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

function createPatchStep(
  mountedRef: MountedStateRef,
  setSteps: SetSteps,
): PatchStep {
  return (id, patch) => {
    if (mountedRef.current) {
      setSteps((previous) => updateStepRecords(previous, id, patch));
    }
  };
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  return (
    err instanceof ApiError &&
    err.raw instanceof DOMException &&
    err.raw.name === 'AbortError'
  );
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.view.message : 'Error inesperado';
}

async function runBootstrapStep(
  manualId: string,
  step: StepDefinition,
  signal: AbortSignal,
  patchStep: PatchStep,
): Promise<string | null> {
  patchStep(step.id, { state: 'running' });
  try {
    const res = await api.askManual(manualId, step.question, signal);
    patchStep(step.id, { state: 'done', text: res.answer });
    return res.answer;
  } catch (err) {
    if (isAbortError(err)) return null;
    patchStep(step.id, { state: 'failed', error: errorMessage(err) });
    return null;
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
  const [steps, setSteps] = useState<StepRecord[]>(() =>
    STEPS.map((s) => ({ id: s.id, label: s.label, state: 'pending' })),
  );
  const [result, setResult] = useState<ManualResult | null>(null);
  const launchedRef = useRef(false);

  // `mountedRef` evita state updates fantasma tras unmount: si el usuario
  // navega fuera de `/processing` mientras las mutations están en vuelo,
  // los `setSteps`/`setResult` que ya estaban en cola dispararían warnings
  // y escritura inútil de memoria.  Catálogo bug #9.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (launchedRef.current) return;
    launchedRef.current = true;

    const controller = new AbortController();
    const patchStep = createPatchStep(mountedRef, setSteps);

    Promise.allSettled(
      STEPS.map((step) => runBootstrapStep(manualId, step, controller.signal, patchStep)),
    ).then((results) => {
      if (!mountedRef.current) return;
      const built = buildManualResult(manualId, manualName, results);
      storage.setResult(built);
      setResult(built);
    });

    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [manualId, manualName]);

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const failedCount = steps.filter((s) => s.state === 'failed').length;
  const progress = Math.round(((doneCount + failedCount) / steps.length) * 100);
  const done = doneCount + failedCount === steps.length;
  const hasAnyAnswer = doneCount > 0;

  return { steps, progress, done, hasAnyAnswer, result };
}
