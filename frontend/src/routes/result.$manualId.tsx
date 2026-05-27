import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Check,
  Flag,
  RefreshCw,
  ScanText,
  Send,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { OcrTextSheet } from '@/features/ocr/OcrTextSheet';
import { storage, type ManualResult, type OcrLine } from '@/shared/lib/storage';

export const Route = createFileRoute('/result/$manualId')({
  component: ResultScreen,
});

const SUGGESTED_QUESTIONS = [
  '¿Cómo se gana?',
  '¿Cómo es un turno?',
  '¿Y si empatamos?',
  'Reglas opcionales',
];

function ResultScreen() {
  const { manualId } = Route.useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<ManualResult | null>(null);
  const [question, setQuestion] = useState('');
  // Estado del sheet "Ver texto original".  Se abre cuando el usuario
  // pulsa el icono ScanText del header.
  const [ocrOpen, setOcrOpen] = useState(false);
  // Líneas OCR — leídas del localStorage en el primer render (lazy
  // initializer evita el flash de "sin líneas" mientras un useEffect
  // las cargaba más tarde, catálogo bug #33).  El backend ya las
  // devolvió en POST /api/manuals (Fase L) y NameManualForm las
  // guardó con storage.setOcrLines: aquí solo leemos.  Cero peticiones
  // OCR extra → el viewer es gratis a nivel de red.
  const [ocrLines] = useState<OcrLine[]>(() => storage.getOcrLines(manualId));

  useEffect(() => {
    setResult(storage.getResult(manualId));
    storage.touchManual(manualId);
  }, [manualId]);

  if (!result) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
        <div>
          <p className="font-display text-xl font-bold">Manual no disponible</p>
          <p className="mt-2 text-fg-2">
            No tenemos resultados guardados para este manual.  Vuelve a procesarlo.
          </p>
          <Button asChild className="mt-6">
            <Link to="/home">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  function submitQuestion(e?: React.FormEvent): void {
    e?.preventDefault();
    const q = question.trim();
    if (q.length === 0) return;
    void navigate({
      to: '/chat/$manualId',
      params: { manualId },
      search: { q },
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-2xl">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-bg px-2 py-2">
        <Link
          to="/home"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg hover:bg-surface"
          aria-label="Volver al inicio"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </Link>
        {/* `min-w-0` permite que `truncate` funcione dentro de un flex
            container (sin esto, el h1 nunca se acorta y desborda el
            header con nombres largos como "Catan: Ciudades y Caballeros"). */}
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-lg font-bold tracking-tight">
          {result.name}
        </h1>
        <div className="flex shrink-0 items-center gap-1">
          {/*
            "Ver texto original" — solo se muestra si tenemos líneas
            persistidas (manuales creados a partir de la Fase L del
            backend).  Manuales más antiguos no tienen ocr_lines en
            localStorage, así que el botón quedaría sin sentido.
          */}
          {ocrLines.length > 0 ? (
            <button
              type="button"
              onClick={() => setOcrOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
              aria-label="Ver texto original del manual"
              title="Ver texto original"
            >
              <ScanText size={20} strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
            aria-label="Guardar manual"
          >
            <Bookmark size={20} strokeWidth={2} />
          </button>
        </div>
      </header>

      <OcrTextSheet
        open={ocrOpen}
        onOpenChange={setOcrOpen}
        lines={ocrLines}
      />

      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        <Badge tone="success" size="sm" icon={<Check strokeWidth={2} />}>
          Listo
        </Badge>
        <Badge tone="neutral" size="sm">
          Generado con IA
        </Badge>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-32">
        {result.summary ? (
          <Card className="bg-surface p-4">
            <p className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
              Resumen rápido
            </p>
            <p className="text-base leading-relaxed text-fg">{result.summary}</p>
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
                <span>El turno</span>
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
                <span>Cómo se gana</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <BodyText text={result.win} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* Sticky composer — mismas reglas de safe-area que /chat para
          coherencia táctil (catálogo polish Fase N). */}
      <div
        className="sticky bottom-0 border-t border-border bg-bg/95 p-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {/* scroll-snap-x: en móvil estrecho, los chips de preguntas
            sugeridas se "agarran" al borde izquierdo al hacer scroll
            horizontal, evitando que la última quede cortada a medias. */}
        <div
          className="mb-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
          aria-label="Preguntas sugeridas"
        >
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() =>
                void navigate({
                  to: '/chat/$manualId',
                  params: { manualId },
                  search: { q },
                })
              }
              className="h-9 shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-2"
            >
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={submitQuestion} className="flex items-center gap-2">
          <Input
            preset="chat-message"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pregunta sobre el manual…"
            aria-label="Escribe tu pregunta"
            className="flex-1 rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={question.trim().length === 0}
            aria-label="Enviar pregunta"
          >
            <Send size={17} strokeWidth={2} />
          </Button>
        </form>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-fg-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/capture/source">
              <Camera size={14} />
              Otro manual
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function BodyText({ text }: { text: string }) {
  if (!text || text.trim().length === 0) {
    return (
      <p className="text-sm text-fg-3">
        No hemos podido generar esta sección.  Puedes preguntar al manual directamente.
      </p>
    );
  }
  // Preserva saltos de línea simples — el LLM puede devolver listas con \n.
  return (
    <div className="space-y-2 text-base leading-relaxed text-fg">
      {text
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((para, i) => (
          <p key={i}>{para}</p>
        ))}
    </div>
  );
}
