import { Sheet, SheetBody, SheetHeader } from '@/components/ui/sheet';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import {
  NameManualForm,
  subtitleForSource,
  type UploadSource,
} from './NameManualForm';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  source: UploadSource;
}

/**
 * Wrapper responsive del formulario "Ponle nombre al manual":
 *
 *  - **Móvil (< md):** renderiza un `<Sheet>` anclado abajo con
 *    animación slide-up (gesture nativa móvil).
 *  - **Desktop (md+):** renderiza un `<Dialog>` centrado con animación
 *    zoom-in (patrón modal estándar de escritorio).
 *
 * El formulario interno es el mismo (`<NameManualForm>`) — solo cambia
 * el contenedor.  Esta separación es la regla canónica:
 *
 *   "JS (useMediaQuery) solo cuando hay que CAMBIAR de componente,
 *    no solo de estilo." — MDN / web.dev guidelines (ver decisión #28).
 */
export function NameManualSheet({ open, onOpenChange, file, source }: Props) {
  const isDesktop = useIsDesktop();
  const subtitle = subtitleForSource(source);
  const title = 'Ponle nombre al manual';

  const form = (
    <NameManualForm file={file} source={source} onClose={() => onOpenChange(false)} />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogHeader
          title={title}
          description={subtitle}
          onClose={() => onOpenChange(false)}
        />
        <DialogBody>{form}</DialogBody>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader
        title={title}
        description={subtitle}
        onClose={() => onOpenChange(false)}
      />
      <SheetBody>{form}</SheetBody>
    </Sheet>
  );
}
