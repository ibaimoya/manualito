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
 * Ayuda de Radix para ratón y teclado. touch=true permite alternarla al tocar.
 * Para enlaces, touch='confirm' reserva el primer toque para consultar la ayuda.
 * El hijo debe aceptar la ref y los eventos de Radix.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  touch = false,
  touchHint,
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  touch?: boolean | 'confirm';
  /** Indicación adicional para la consulta táctil. */
  touchHint?: ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const [touchPreview, setTouchPreview] = useState(false);
  const touchStartOpen = useRef<boolean | null>(null);
  const touchMode = touch !== false;

  return (
    <TooltipPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTouchPreview(false);
      }}
    >
      <TooltipPrimitive.Trigger
        asChild
        aria-expanded={touchMode ? open : undefined}
        onPointerDown={(event) => {
          // Radix cierra al pulsar. Conservamos el estado anterior para alternar al tocar.
          touchStartOpen.current = touchMode && event.pointerType === 'touch' ? open : null;
        }}
        onPointerCancel={() => {
          touchStartOpen.current = null;
        }}
        onClickCapture={(event) => {
          // Intercepta la consulta táctil antes de que el enlace navegue.
          const wasOpen = touchStartOpen.current;
          touchStartOpen.current = null;
          if (wasOpen === null) return;
          // El segundo toque conserva la acción normal del enlace.
          if (touch === 'confirm' && wasOpen) return;
          event.preventDefault();
          setOpen(!wasOpen);
          setTouchPreview(!wasOpen);
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
          {touchPreview && touchHint ? (
            <span className="mt-1 block opacity-80">{touchHint}</span>
          ) : null}
          {/* El solape evita rendijas al renderizar coordenadas fraccionarias. */}
          <TooltipPrimitive.Arrow className="-translate-y-px fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
