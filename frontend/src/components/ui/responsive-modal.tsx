import type { ReactNode } from 'react';
import { Dialog, DialogBody, DialogHeader } from './dialog';
import { Sheet, SheetBody, SheetHeader } from './sheet';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';

/**
 * Modal responsive: Dialog centrado en desktop, Sheet anclado abajo en móvil,
 * con la misma cabecera (título + descripción + cierre) en ambas variantes.
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
  bodyClassName,
  onOpenAutoFocus,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Clases extra para el panel (anchura/altura); sobrescriben las default. */
  contentClassName?: string;
  bodyClassName?: string;
  onOpenAutoFocus?: (event: Event) => void;
}>) {
  const isDesktop = useNamedMediaQuery('desktop');
  const close = () => onOpenChange(false);

  if (isDesktop) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        contentClassName={contentClassName}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <DialogHeader title={title} description={description} onClose={close} />
        <DialogBody className={bodyClassName}>{children}</DialogBody>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} onOpenAutoFocus={onOpenAutoFocus}>
      <SheetHeader title={title} description={description} onClose={close} />
      <SheetBody className={bodyClassName}>{children}</SheetBody>
    </Sheet>
  );
}
