import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { motion } from 'motion/react';
import { type ComponentPropsWithoutRef, type ComponentRef, forwardRef, useState } from 'react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';

/**
 * Menú contextual (kebab) sobre Radix DropdownMenu: foco gestionado,
 * flechas de teclado, Escape y cierre al hacer click fuera vienen de serie.
 */

// No-modal: con menú y Dialog modales, el cierre cruzado deja el body bloqueado.
export const DropdownMenu = (
  props: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>,
) => <DropdownMenuPrimitive.Root modal={false} {...props} />;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

type MenuHighlight = {
  x: number;
  y: number;
  width: number;
  height: number;
  danger: boolean;
  visible: boolean;
};

export const DropdownMenuContent = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent(
  {
    className,
    sideOffset = 6,
    children,
    onFocusCapture,
    onBlurCapture,
    onCloseAutoFocus,
    ...props
  },
  ref,
) {
  const [highlight, setHighlight] = useState<MenuHighlight | null>(null);
  const canAnimate = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );
  const hideHighlight = () =>
    setHighlight((current) => (current?.visible ? { ...current, visible: false } : current));

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        data-mn-menu=""
        className={cn(
          'relative isolate z-50 min-w-44 rounded-2xl border border-border bg-card p-1.5 shadow-md',
          className,
        )}
        {...props}
        onFocusCapture={(event) => {
          onFocusCapture?.(event);
          if (event.defaultPrevented) return;
          const item = event.target.closest<HTMLElement>('[role="menuitem"]');
          if (!item || !event.currentTarget.contains(item) || item.hasAttribute('data-disabled')) {
            hideHighlight();
            return;
          }
          // El foco nativo de Radix decide la opción; solo medimos su fondo.
          setHighlight({
            x: item.offsetLeft,
            y: item.offsetTop,
            width: item.offsetWidth,
            height: item.offsetHeight,
            danger: item.hasAttribute('data-danger'),
            visible: true,
          });
        }}
        onBlurCapture={(event) => {
          onBlurCapture?.(event);
          if (!event.currentTarget.contains(event.relatedTarget)) hideHighlight();
        }}
        onCloseAutoFocus={(event) => {
          hideHighlight();
          onCloseAutoFocus?.(event);
        }}
      >
        {highlight && (
          <motion.span
            key={canAnimate ? 'animated' : 'static'}
            data-mn-menu-highlight=""
            aria-hidden="true"
            initial={false}
            className={cn(
              'pointer-events-none absolute left-0 top-0 -z-10 rounded-xl transition-colors',
              highlight.danger ? 'bg-error-bg' : 'bg-surface-2',
            )}
            style={{ width: highlight.width, height: highlight.height }}
            animate={{
              x: highlight.x,
              y: highlight.y,
              opacity: highlight.visible ? 1 : 0,
            }}
            transition={
              canAnimate
                ? { type: 'spring', stiffness: 420, damping: 36, opacity: { duration: 0.12 } }
                : { duration: 0 }
            }
          />
        )}
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  ComponentRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { danger?: boolean }
>(function DropdownMenuItem({ className, danger = false, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      data-danger={danger || undefined}
      className={cn(
        'icon-feedback flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 text-sm font-semibold outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50',
        danger ? 'text-error' : 'text-fg',
        className,
      )}
      {...props}
    />
  );
});
