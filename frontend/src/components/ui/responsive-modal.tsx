import type { ReactNode } from 'react';
import {
  DIALOG_CONTENT_CLASS,
  DIALOG_HEADER_CLASS,
  ModalBody,
  ModalFrame,
  ModalHeader,
} from './dialog';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';

// Variante móvil: panel anclado abajo con asa táctil.
const SHEET_CONTENT_CLASS =
  'fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-lg';
const SHEET_HEADER_CLASS = 'flex items-start justify-between gap-3 px-5 pb-2 pt-4';

/**
 * Modal responsive: panel centrado en desktop, anclado abajo en móvil.
 * Las dos variantes comparten un único ModalFrame (solo cambian clases y
 * atributos): cruzar el breakpoint con el modal abierto no desmonta el
 * contenido, así que el borrador del formulario sobrevive.
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

  return (
    <ModalFrame
      open={open}
      onOpenChange={onOpenChange}
      contentBaseClassName={isDesktop ? DIALOG_CONTENT_CLASS : SHEET_CONTENT_CLASS}
      contentClassName={contentClassName}
      dataKind={isDesktop ? 'dialog' : 'sheet'}
      handle={
        isDesktop ? undefined : (
          <div className="flex justify-center pt-3" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-border-strong" />
          </div>
        )
      }
      onOpenAutoFocus={onOpenAutoFocus}
    >
      <ModalHeader
        title={title}
        description={description}
        onClose={() => onOpenChange(false)}
        className={isDesktop ? DIALOG_HEADER_CLASS : SHEET_HEADER_CLASS}
      />
      <ModalBody className={bodyClassName}>{children}</ModalBody>
    </ModalFrame>
  );
}
