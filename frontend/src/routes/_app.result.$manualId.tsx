import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Camera,
  Check,
  Flag,
  RefreshCw,
  ScanText,
  Send,
  Sparkles,
} from 'lucide-react';
import { ScreenTopBar } from '@/app/Topbar';
import { useEffect, useMemo, useState } from 'react';
import { OcrTextSheet } from '@/features/ocr/OcrTextSheet';
import { Markdown } from '@/shared/components/Markdown';
import { ConversationsSection } from '@/features/conversations/ConversationsSection';
import { manualDetailQueryOptions, manualsQueryOptions } from '@/features/manual/use-manuals';
import type { ManualSummary } from '@/shared/api/client';
import { storage, type ManualResult, type OcrLine } from '@/shared/lib/storage';

export const Route = createFileRoute('/_app/result/$manualId')({
  component: ResultScreen,
});

const SUGGESTED_QUESTIONS = [
  '¿Cuántos jugadores?',
  '¿Cuánto dura una partida?',
  '¿Y si empatamos?',
  'Reglas opcionales',
];

function ResultScreen() {
  const { manualId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const result = useMemo<ManualResult | null>(() => storage.getResult(manualId), [manualId]);
  const { data: manualDetail } = useQuery({
    ...manualDetailQueryOptions(manualId),
    enabled: result !== null,
  });
  const [question, setQuestion] = useState('');
  const [ocrOpen, setOcrOpen] = useState(false);
  const cachedOcrLines = useMemo<OcrLine[]>(() => storage.getOcrLines(manualId), [manualId]);
  const backendOcrLines = useMemo<OcrLine[]>(() => {
    const pages = manualDetail?.pages ?? [];
    return pages
      .toSorted((left, right) => left.page_number - right.page_number)
      .flatMap((page) => page.ocr_lines);
  }, [manualDetail]);
  const ocrLines = manualDetail ? backendOcrLines : cachedOcrLines;

  useEffect(() => {
    storage.touchManual(manualId);
  }, [manualId]);

  // Sin resultado cacheado (manual creado en otra sesión/dispositivo): lo
  // regeneramos en /processing, que ya muestra el pipeline y vuelve aquí.
  useEffect(() => {
    if (result) return;
    const list = qc.getQueryData<ManualSummary[]>(manualsQueryOptions().queryKey);
    const found = list?.find((m) => m.id === manualId);
    const name = found?.title ?? found?.game_name;
    navigate({
      to: '/processing/$manualId',
      params: { manualId },
      search: name ? { name } : {},
      replace: true,
    }).catch(() => undefined);
  }, [result, manualId, navigate, qc]);

  if (!result) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-fg-2">
        <p className="text-sm">Cargando manual…</p>
      </div>
    );
  }

  function submitQuestion(e?: { preventDefault: () => void }): void {
    e?.preventDefault();
    askChat(question.trim());
  }

  function askChat(q: string): void {
    if (q.length === 0) return;
    navigate({ to: '/chat/$manualId', params: { manualId }, search: { q } }).catch(() => undefined);
  }

  const ask = (
    <AskPanel value={question} onChange={setQuestion} onSubmit={submitQuestion} onAsk={askChat} />
  );

  const scanAction =
    ocrLines.length > 0 ? (
      <button
        type="button"
        onClick={() => setOcrOpen(true)}
        className="grid size-10 place-items-center rounded-xl text-fg-2 hover:bg-surface"
        aria-label="Ver texto original del manual"
        title="Ver texto original"
      >
        <ScanText size={20} strokeWidth={1.75} />
      </button>
    ) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={result.name}
        back={
          <Link
            to="/home"
            className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </Link>
        }
        actions={scanAction}
      />

      <OcrTextSheet open={ocrOpen} onOpenChange={setOcrOpen} lines={ocrLines} />

      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 pb-1 pt-4 lg:px-6">
        <Badge tone="success" size="sm" icon={<Check strokeWidth={2} />}>
          Listo
        </Badge>
        <Tooltip content="Generado por IA: puede equivocarse. Si algo no cuadra, contrástalo con el manual original.">
          <Badge tone="neutral" size="sm" tabIndex={0} className="cursor-help">
            Generado con IA
          </Badge>
        </Tooltip>
      </div>

      <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:px-6 lg:pb-6">
        <div className="min-w-0 space-y-3">
          <ResultReading result={result} />
          {manualDetail ? (
            <ConversationsSection manualId={manualId} gameId={manualDetail.game_id} />
          ) : null}
        </div>
        <aside
          className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/95 p-3 backdrop-blur lg:mx-0 lg:bottom-auto lg:top-6 lg:self-start lg:rounded-2xl lg:border lg:bg-surface lg:p-4 lg:backdrop-blur-0"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          {ask}
        </aside>
      </div>
    </div>
  );
}

function ResultReading({ result }: Readonly<{ result: ManualResult }>) {
  return (
    <>
      {result.summary ? (
        <Card className="bg-surface p-4">
          <p className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            Resumen rápido
          </p>
          <Markdown className="text-base leading-relaxed text-fg">{result.summary}</Markdown>
        </Card>
      ) : null}

      <Accordion type="multiple" defaultValue={['setup']} className="space-y-3">
        <AccordionItem value="setup">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-100 text-primary-700">
                <Flag size={16} strokeWidth={2} />
              </span>
              <span>Preparación</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <BodyText text={result.setup} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="turn">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-100 text-accent">
                <RefreshCw size={16} strokeWidth={2} />
              </span>
              <span>¿Cómo van los turnos?</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <BodyText text={result.turn} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="win">
          <AccordionTrigger>
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-warning-bg text-warning">
                <Sparkles size={16} strokeWidth={2} />
              </span>
              <span>¿Cómo se gana?</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <BodyText text={result.win} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
}

function AskPanel({
  value,
  onChange,
  onSubmit,
  onAsk,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e?: { preventDefault: () => void }) => void;
  onAsk: (question: string) => void;
}>) {
  return (
    <>
      <p className="mono mb-2 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700 lg:block">
        Pregunta sobre el manual
      </p>
      <div
        className="mb-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible"
        aria-label="Preguntas sugeridas"
      >
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            className="h-9 shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-2 lg:bg-bg"
          >
            {q}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <Input
          preset="chat-message"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Pregunta sobre el manual…"
          aria-label="Escribe tu pregunta"
          className="flex-1 rounded-full"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          disabled={value.trim().length === 0}
          aria-label="Enviar pregunta"
        >
          {/* Centrado óptico: la masa del avión cae arriba-derecha (centroide medido). */}
          <Send size={17} strokeWidth={2} style={{ transform: 'translate(-1.3px, 1.3px)' }} />
        </Button>
      </form>
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-fg-3 lg:justify-start">
        <Button asChild variant="ghost" size="sm">
          <Link to="/capture/source">
            <Camera size={14} />
            Otro manual
          </Link>
        </Button>
      </div>
    </>
  );
}

function BodyText({ text }: Readonly<{ text: string }>) {
  if (!text || text.trim().length === 0) {
    return (
      <p className="text-sm text-fg-3">
        No hemos podido generar esta sección. Puedes preguntar al manual directamente.
      </p>
    );
  }
  return <Markdown className="text-base leading-relaxed text-fg">{text}</Markdown>;
}
