import type * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {

  ModalFrame,
  ModalHeader,
  type ModalHeaderProps,
} from './dialog';
import {cn} from '@/shared/lib/cn';

/**
 * Bottom sheet (modal anclado abajo) construido sobre Radix Dialog.
 *
 * - Bloquea scroll del fondo y oscurece con overlay.
 * - Foco atrapado dentro mientras está abierto (a11y).
 * - Animación slide-up + fade del overlay, respetando prefers-reduced-motion.
 * - Cierra con Escape, click en overlay, o botón X.
 *
 * Uso:
 *   <Sheet open={open} onOpenChange={setOpen}>
 *     <SheetHeader title="Ponle nombre al manual" />
 *     <SheetBody>…</SheetBody>
 *   </Sheet>
 */

export const Sheet = ({
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
        contentBaseClassName="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-md rounded-t-3xl border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] shadow-lg"
        contentClassName={contentClassName}
        dataKind="sheet"
        handle={
          <div className="flex justify-center pt-3" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-border-strong"/>
          </div>
        }
    >
      {children}
    </ModalFrame>
);

export const SheetHeader = forwardRef<
    ComponentRef<typeof DialogPrimitive.Title>,
    Omit<ModalHeaderProps, 'className'>
>(function SheetHeader(props, ref) {
  return (
      <ModalHeader
          {...props}
          ref={ref}
          className="flex items-start justify-between gap-3 px-5 pb-2 pt-4"
      />
  );
});


export const SheetFooter = ({
                              children,
                              className,
                            }: Readonly<{
  children: ReactNode;
  className?: string;
}>) => (
    <footer
        className={cn(
            'flex items-center justify-end gap-2 border-t border-border px-5 py-3',
            className,
        )}
    >
      {children}
    </footer>
);

export {ModalBody as SheetBody} from './dialog';