import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';

/**
 * Provider único de tooltips (vive en Providers y en los harness de test).
 * Compartirlo entre todos los triggers es lo que activa el skip-delay: al
 * barrer una fila de iconos solo el primero espera los 120 ms.
 */
export function TooltipProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * Tooltip ligero sobre Radix. Aparece al pasar el ratón o con foco de
 * teclado y desaparece al salir. El disparador (`children`) debe aceptar
 * `ref` (p. ej. un componente con `forwardRef`).
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
  );
}
