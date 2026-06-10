import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

type DialogDataKind = 'dialog' | 'sheet';

type ModalFrameProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  contentBaseClassName: string;
  contentClassName?: string;
  dataKind: DialogDataKind;
  handle?: ReactNode;
}>;

export type ModalHeaderProps = Readonly<{
  title: string;
  description?: string;
  onClose?: () => void;
  className: string;
}>;

type ModalBodyProps = Readonly<{
  children: ReactNode;
  className?: string;
}>;

function dataAttributes(kind: DialogDataKind): Record<string, string> {
  return kind === 'dialog'
    ? { 'data-mn-dialog': '' }
    : { 'data-mn-sheet': '' };
}

function overlayAttributes(kind: DialogDataKind): Record<string, string> {
  return kind === 'dialog'
    ? { 'data-mn-dialog-overlay': '' }
    : { 'data-mn-overlay': '' };
}

export function ModalFrame({
  open,
  onOpenChange,
  children,
  contentBaseClassName,
  contentClassName,
  dataKind,
  handle,
}: ModalFrameProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          {...overlayAttributes(dataKind)}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        />
        <DialogPrimitive.Content
          {...dataAttributes(dataKind)}
          className={cn(contentBaseClassName, 'focus:outline-none', contentClassName)}
        >
          {handle}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const ModalHeader = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  ModalHeaderProps
>(function ModalHeader({ title, description, onClose, className }, ref) {
  return (
    <header className={className}>
      <div className="flex-1">
        <DialogPrimitive.Title
          ref={ref}
          className="font-display text-xl font-bold tracking-tight text-fg"
        >
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-fg-2">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      {onClose ? (
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </DialogPrimitive.Close>
      ) : null}
    </header>
  );
});

export const ModalBody = ({ children, className }: ModalBodyProps) => (
  <div className={cn('px-5 pb-5 pt-2', className)}>{children}</div>
);

/**
 * Dialog centrado para desktop (`md+`).
 *
 * Diferencias respecto a `<Sheet>` (móvil):
 *  - Posición: centro de pantalla, no anclado abajo.
 *  - Animación: fade + zoom-in suave (no slide-up).
 *  - Ancho fijo (max-w-md por defecto), no full-width.
 *  - Sin "handle" decorativo (en desktop no aplica gesture táctil).
 */

export const Dialog = ({
  open,
  onOpenChange,
  children,
  contentClassName,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Clases extra para el panel (anchura/altura); sobrescriben las default. */
  contentClassName?: string;
}>) => (
  <ModalFrame
    open={open}
    onOpenChange={onOpenChange}
    contentBaseClassName={cn(
      'fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-md',
      '-translate-x-1/2 -translate-y-1/2',
      'rounded-2xl border border-border bg-bg shadow-lg',
    )}
    contentClassName={contentClassName}
    dataKind="dialog"
  >
    {children}
  </ModalFrame>
);

export const DialogHeader = forwardRef<
  ComponentRef<typeof DialogPrimitive.Title>,
  Omit<ModalHeaderProps, 'className'>
>(function DialogHeader(props, ref) {
  return (
    <ModalHeader
      {...props}
      ref={ref}
      className="flex items-start justify-between gap-3 px-5 pb-2 pt-5"
    />
  );
});

export const DialogBody = ModalBody;
