import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';

/**
 * Tooltip ligero sobre Radix. Trae su propio Provider para que el callsite
 * sea de una línea. Aparece al pasar el ratón o con foco de teclado y
 * desaparece al salir. El disparador (`children`) debe aceptar `ref` (p. ej.
 * un componente con `forwardRef`).
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}>) {
  return (
    <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-[15rem] rounded-lg bg-fg px-3 py-2 text-xs font-medium leading-snug text-bg shadow-lg data-[state=delayed-open]:animate-[mn-fade-in_140ms_ease-out]"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-fg" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
