import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Button con variantes — patrón shadcn/ui adaptado a tokens Manualito.
 * Toda variante respeta touch target ≥ 44 px en sizes md/lg.
 *
 * Refactor (catálogo bug #26): incluye soporte first-class de loading:
 *  - `loading` prop reemplaza el icono por un spinner manteniendo el
 *    texto → ancho estable, sin tembleque al pasar a estado pending.
 *  - `aria-busy={loading}` automático para screen readers.
 *  - `disabled` automático cuando loading.
 *  - `disabled:cursor-not-allowed` global → feedback visual claro.
 *
 * Ver:
 *  - https://ui.shadcn.com/docs/components/base/button
 *  - https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-busy
 *  - https://www.bekk.christmas/post/2023/24/accessible-loading-button
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-body font-semibold',
    'transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-mn)]',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'select-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-fg-inv shadow-sm hover:bg-primary-600 active:translate-y-px',
        secondary:
          'bg-surface text-fg border border-border hover:bg-surface-2',
        ghost: 'bg-transparent text-fg-2 hover:bg-surface',
        destructive:
          'bg-error text-fg-inv shadow-sm hover:opacity-90 active:translate-y-px',
        outline:
          'bg-transparent text-fg border border-border-strong hover:bg-surface',
        link: 'bg-transparent text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-14 px-6 text-lg',
        icon: 'h-11 w-11 p-0',
        pill: 'h-11 rounded-full px-6 text-base',
      },
      block: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      block: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Mostrar spinner inline.  Mientras `loading=true`:
   *  - El primer icono visible (si lo hay) se reemplaza por `<Loader2>` girando.
   *  - El botón queda `disabled` y `aria-busy`.
   *  - El TEXTO se mantiene → el ancho no salta (bug "botón tembleque").
   *
   * Si quieres cambiar el texto en loading, hazlo manualmente:
   *   <Button loading={isPending}>
   *     {isPending ? 'Subiendo…' : 'Procesar'}
   *   </Button>
   * (Con eso aceptas que el ancho cambia — útil para botones grandes
   * donde el cambio aporta info, ej. CTA principal de un formulario.)
   */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    asChild = false,
    loading = false,
    disabled,
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';

  // Cuando loading: insertamos el spinner como primer hijo y, si había un
  // icono inicial, lo ocultamos visualmente.  El texto se preserva.
  //
  // ⚠ asChild + loading: Slot de Radix requiere UN SOLO React.Children,
  //   por lo que NO podemos meter un Fragment con [spinner, texto] dentro.
  //   En ese caso degradamos a "solo aria-busy" — el child es quien
  //   muestra su propio indicador visual.  Documentado en JSDoc del prop.
  const showSpinner = loading && !asChild;
  const finalChildren: ReactNode = showSpinner ? (
    <>
      <Loader2
        size={size === 'lg' ? 20 : 18}
        strokeWidth={2}
        className="animate-[mn-spin_0.9s_linear_infinite]"
        aria-hidden="true"
      />
      {/* Texto/contenido original — sin el primer icono porque el
          spinner ocupa su sitio. */}
      <StripFirstIcon>{children}</StripFirstIcon>
    </>
  ) : (
    children
  );

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {finalChildren}
    </Comp>
  );
});

/**
 * Auxiliar: oculta el primer hijo si es un elemento (icono) — el
 * spinner del loading ocupa su sitio.  Si el primer hijo es texto, no
 * lo toca.  Implementado con clonación rápida sin map para evitar
 * remontar elementos hijos.
 */
function StripFirstIcon({ children }: { children: ReactNode }) {
  // En el 99% de los casos `children` es un array de [icono, texto].
  // Si no es array, devolvemos tal cual.
  if (!Array.isArray(children)) {
    // Si es un único elemento (sin icono separado), lo dejamos tal cual.
    return <>{children}</>;
  }
  // Si el primer hijo parece un icono (objeto React element), lo
  // saltamos.  Resto se mantiene.
  const [first, ...rest] = children;
  const firstIsIcon =
    typeof first === 'object' && first !== null && 'type' in (first as object);
  return <>{firstIsIcon ? rest : children}</>;
}

export { buttonVariants };
