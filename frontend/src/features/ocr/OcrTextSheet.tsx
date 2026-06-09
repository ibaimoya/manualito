import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Info, X } from 'lucide-react';
import { OcrTextViewer } from './OcrTextViewer';
import type { OcrLine } from '@/shared/lib/storage';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: OcrLine[];
  meta?: { ocrDurationMs?: number };
}>;

const TITLE = 'Texto original del manual';
const SUBTITLE = 'Lo que leyó el OCR de las páginas que subiste';

/**
 * Visor del texto OCR en un modal centrado, igual en móvil y escritorio.
 *
 * Centrado con `inset-0 + margin:auto` (no con `left:50% + translate`): el
 * margen automático reparte el espacio sobrante, así que el panel queda
 * centrado pase lo que pase con el contenedor o el scrollbar. La animación
 * es solo de opacidad para no interferir con ese centrado.
 */
export function OcrTextSheet({ open, onOpenChange, lines, meta }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-[mn-fade-in_180ms_ease-out] data-[state=closed]:animate-[mn-fade-out_140ms_ease-in_forwards]" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 m-auto flex h-[88vh] w-[94vw] max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-lg focus:outline-none data-[state=open]:animate-[mn-fade-in_180ms_ease-out] data-[state=closed]:animate-[mn-fade-out_140ms_ease-in_forwards] md:h-[84vh]">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-xl font-bold tracking-tight text-fg">
                {TITLE}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-fg-2">
                {SUBTITLE}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-surface"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </DialogPrimitive.Close>
          </header>

          <InfoNote />

          <OcrTextViewer
            lines={lines}
            meta={meta}
            variant="embedded"
            defaultView="plain"
            onClose={() => onOpenChange(false)}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function InfoNote() {
  return (
    <div
      role="note"
      className="mx-4 mb-3 mt-3 flex shrink-0 items-start gap-2 rounded-xl border border-info/30 bg-info-bg/60 px-3 py-2.5 text-[13px] leading-snug text-fg-2"
    >
      <Info size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
      <span>
        El LLM usó este texto para generar las explicaciones. Si una respuesta te chirría,
        contrasta con la fuente.
      </span>
    </div>
  );
}
