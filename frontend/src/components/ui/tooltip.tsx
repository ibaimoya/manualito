import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactNode, useRef, useState } from 'react';

/**
 * Provider único de tooltips (vive en Providers y en los harness de test).
 * Compartirlo entre todos los triggers es lo que activa el skip-delay: al
 * barrer una fila de iconos solo el primero espera los 120 ms.
 */
export function TooltipProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={120}
      skipDelayDuration={300}
      disableHoverableContent={false}
    >
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * Tooltip ligero sobre Radix. Aparece al pasar el ratón o con foco de
 * teclado. Radix conserva el corredor entre disparador y contenido al mover
 * el ratón. `touch` habilita la ayuda al tocar indicadores sin otra acción.
 * El disparador debe aceptar la ref y los eventos de Radix.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  touch = false,
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  touch?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const touchStartOpen = useRef<boolean | null>(null);

  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger
        asChild
        aria-expanded={touch ? open : undefined}
        onPointerDown={(event) => {
          // Radix cierra al pulsar. Conservamos el estado anterior para alternar al tocar.
          touchStartOpen.current = touch && event.pointerType === 'touch' ? open : null;
        }}
        onPointerCancel={() => {
          touchStartOpen.current = null;
        }}
        onClick={(event) => {
          const wasOpen = touchStartOpen.current;
          touchStartOpen.current = null;
          if (wasOpen === null) return;
          event.preventDefault();
          setOpen(!wasOpen);
        }}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align="center"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-[min(18rem,var(--radix-tooltip-content-available-width))] rounded-lg bg-fg px-3 py-2 text-center text-xs font-medium leading-snug text-balance text-bg shadow-lg motion-safe:data-[state=delayed-open]:animate-[mn-fade-in_140ms_ease-out] motion-reduce:animate-none"
        >
          {content}
          {/* El solape evita rendijas al renderizar coordenadas fraccionarias. */}
          <TooltipPrimitive.Arrow className="-translate-y-px fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
