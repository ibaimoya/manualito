import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Button con variantes — patrón shadcn/ui adaptado a tokens Manualito.
 * Toda variante respeta touch target ≥ 44 px en sizes md/lg.
 *
 * Con "loading": spinner en lugar del icono manteniendo el texto (ancho
 * estable), más "aria-busy" y "disabled" automáticos.
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
        primary: 'bg-primary text-fg-inv shadow-sm hover:bg-primary-600 active:translate-y-px',
        secondary: 'bg-surface text-fg border border-border hover:bg-surface-2',
        ghost: 'bg-transparent text-fg-2 hover:bg-surface',
        destructive: 'bg-error text-fg-inv shadow-sm hover:opacity-90 active:translate-y-px',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-base',
        lg: 'h-14 px-6 text-lg',
        icon: 'h-11 w-11 p-0',
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
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Spinner inline: reemplaza el primer icono y conserva el texto para que
   * el ancho no salte. Para cambiar también el texto, hazlo en "children".
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
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  // Default 'button': sin type, dentro de un form sería submit implícito.
  const buttonType = asChild ? type : (type ?? 'button');

  // Con asChild el Slot exige un único child: sin spinner, solo aria-busy.
  const showSpinner = loading && !asChild;
  const spinner = showSpinner ? (
    <Loader2
      size={size === 'lg' ? 20 : 18}
      strokeWidth={2}
      className="animate-[mn-spin_0.9s_linear_infinite]"
      aria-hidden="true"
    />
  ) : null;
  let finalChildren: ReactNode = children;
  if (showSpinner) {
    finalChildren =
      size === 'icon' ? (
        spinner
      ) : (
        <>
          {spinner}
          <StripFirstIcon>{children}</StripFirstIcon>
        </>
      );
  }

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      type={buttonType}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {finalChildren}
    </Comp>
  );
});

/** Oculta el primer hijo si es un elemento (icono): el spinner ocupa su sitio. */
function StripFirstIcon({ children }: Readonly<{ children: ReactNode }>) {
  if (!Array.isArray(children)) {
    return <>{children}</>;
  }
  const [first, ...rest] = children;
  const firstIsIcon = typeof first === 'object' && first !== null && 'type' in (first as object);
  return <>{firstIsIcon ? rest : children}</>;
}
