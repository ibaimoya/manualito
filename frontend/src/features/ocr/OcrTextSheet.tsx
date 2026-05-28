import { Info } from 'lucide-react';
import { Dialog, DialogHeader } from '@/components/ui/dialog';
import { Sheet, SheetHeader } from '@/components/ui/sheet';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';
import { OcrTextViewer } from './OcrTextViewer';
import type { OcrLine } from '@/shared/lib/storage';

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: OcrLine[];
  meta?: { ocrDurationMs?: number };
}>;

const TITLE = 'Texto original del manual';
const SUBTITLE = 'Lo que ha leído el OCR de las páginas que subiste';

/**
 * Wrapper responsive del `<OcrTextViewer>`:
 *
 *  - **Móvil (< md):** `<Sheet>` anclado abajo ocupando ~86 % del
 *    viewport — espacio suficiente para mostrar muchas líneas con
 *    scroll interno + action bar siempre visible.
 *  - **Desktop (md+):** `<Dialog>` centrado de ~720 px × 80 vh.
 *
 * Sigue el mismo patrón canónico que `NameManualSheet`: el contenido
 * (OcrTextViewer) es idéntico en ambos viewports, solo cambia el
 * contenedor — única forma de cumplir la regla "JS solo cuando hay
 * que CAMBIAR de componente, no solo de estilo" (ver decisión #28).
 *
 * NO realiza ninguna petición HTTP — recibe `lines` ya extraídas.
 * El consumidor (`/result`) lee `storage.getOcrLines(manualId)` y se
 * las pasa.  El backend devolvió ese mismo array al crear el manual
 * (Fase L) → cero peticiones OCR duplicadas.
 */
export function OcrTextSheet({ open, onOpenChange, lines, meta }: Props) {
  const isDesktop = useNamedMediaQuery('desktop');

  // El viewer va sin padding del wrapper para que su propia franja
  // superior (SegmentedControl + meta) y action bar queden sticky a
  // los bordes del Sheet/Dialog.
  const viewer = (
    <>
      <InfoNote />
      <OcrTextViewer
        lines={lines}
        meta={meta}
        variant="embedded"
        defaultView="lines"
        onClose={() => onOpenChange(false)}
      />
    </>
  );

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        // Dialog ancho y alto para que la lectura de texto OCR (a veces
        // 100+ líneas) sea cómoda en desktop sin scroll inmediato.
        //   - `w-[92vw]` sobreescribe el `w-[95vw]` default y permite
        //     que el dialog ocupe casi el viewport completo en pantallas
        //     pequeñas (laptop 13").
        //   - `max-w-4xl` (~896px) en pantallas wide para evitar que
        //     se estire demasiado.
        //   - `h-[88vh]` casi llena el viewport — al ser un viewer
        //     dedicado, el usuario ya está enfocado en este contenido.
        contentClassName="w-[92vw] max-w-4xl h-[88vh] flex flex-col overflow-hidden"
      >
        <DialogHeader
          title={TITLE}
          description={SUBTITLE}
          onClose={() => onOpenChange(false)}
        />
        <div className="flex min-h-0 flex-1 flex-col">{viewer}</div>
      </Dialog>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      // Móvil: el sheet llega casi al top (86 vh) para que entre el
      // visor y aún se vea un poco del Result detrás (contexto).
      // En tablets (md+) sin sidebar visible (rutas inmersivas) el
      // sheet también se beneficia de un max-w más amplio.
      contentClassName="h-[86vh] flex flex-col overflow-hidden md:max-w-3xl"
    >
      <SheetHeader
        title={TITLE}
        description={SUBTITLE}
        onClose={() => onOpenChange(false)}
      />
      <div className="flex min-h-0 flex-1 flex-col">{viewer}</div>
    </Sheet>
  );
}

/**
 * Alert informativa: el LLM ha usado este texto para generar las
 * explicaciones del manual.  Mejor reforzar esto que dar la sensación
 * de que el OCR y el chat son cosas independientes.
 */
function InfoNote() {
  return (
    <div
      role="note"
      className="mx-4 mt-2 mb-3 flex items-start gap-2 rounded-xl border border-info/30 bg-info-bg/60 px-3 py-2.5 text-[13px] leading-snug text-fg-2"
    >
      <Info
        size={16}
        strokeWidth={2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-info"
      />
      <span>
        El LLM ha usado este texto para generar las explicaciones del manual.
        Si notas un error en una respuesta, contrasta con la fuente.
      </span>
    </div>
  );
}
