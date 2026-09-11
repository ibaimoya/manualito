import {
  type ButtonHTMLAttributes,
  Children,
  forwardRef,
  isValidElement,
  type ReactNode,
} from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { CircleNotchIcon } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/cn';

/**
 * Button con variantes, patrón shadcn/ui adaptado a tokens Manualito.
 * Toda variante respeta touch target ≥ 44 px en sizes md/lg.
 *
 * Con "loading": spinner en lugar del icono manteniendo el texto (ancho
 * estable), más "aria-busy" y "disabled" automáticos.
 */
const buttonVariants = cva(
  [
    'icon-feedback inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-body font-semibold',
    'transition-control duration-150 ease-[var(--ease-mn)]',
    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'data-[loading=true]:pointer-events-auto data-[loading=true]:opacity-100 data-[loading=true]:cursor-wait',
    'select-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-fg-inv not-disabled:not-aria-disabled:hover:bg-primary-600 not-disabled:not-aria-disabled:active:bg-primary-700',
        secondary:
          'bg-surface text-fg border border-border not-disabled:not-aria-disabled:hover:bg-surface-2 not-disabled:not-aria-disabled:active:bg-fg/10',
        ghost:
          'bg-transparent text-fg-2 not-disabled:not-aria-disabled:hover:bg-fg/[0.04] not-disabled:not-aria-disabled:active:bg-fg/[0.08]',
        destructive:
          'bg-error text-fg-inv not-disabled:not-aria-disabled:hover:opacity-90 not-disabled:not-aria-disabled:active:opacity-80',
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
  { className, variant, size, block, asChild = false, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  // Default 'button': sin type, dentro de un form sería submit implícito.
  const buttonType = asChild ? type : (type ?? 'button');

  // Solo los botones que declaran loading necesitan las dos capas persistentes.
  // Slot conserva su único hijo y comunica la carga mediante aria-busy.
  const hasLoading = loading !== undefined && !asChild;
  const busy = loading || undefined;
  const childNodes = Children.toArray(children);
  const [first, ...rest] = childNodes;
  const hasIcon = isValidElement(first) && (childNodes.length > 1 || size === 'icon');

  return (
    <Comp
      ref={ref}
      className={cn(
        buttonVariants({ variant, size, block }),
        hasLoading && !hasIcon && 'relative px-8',
        className,
      )}
      type={buttonType}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={busy}
      data-loading={busy}
      {...props}
    >
      {hasLoading ? (
        <ButtonLoadingContent loading={loading} size={size} icon={hasIcon ? first : null}>
          {hasIcon ? rest : children}
        </ButtonLoadingContent>
      ) : (
        children
      )}
    </Comp>
  );
});

function ButtonLoadingContent({
  loading,
  size,
  icon,
  children,
}: Readonly<{
  loading: boolean;
  size: ButtonProps['size'];
  icon: ReactNode;
  children: ReactNode;
}>) {
  const standalone = icon === null;
  const spinnerSize = size === 'lg' ? 20 : 18;

  return (
    <>
      <span
        className={cn('state-icon relative shrink-0', standalone && 'absolute start-2')}
        data-active={loading}
        style={standalone ? { width: spinnerSize, height: spinnerSize } : undefined}
      >
        <span className="inline-flex" data-feedback-icon>
          {icon}
        </span>
        <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
          <CircleNotchIcon
            className="size-full motion-safe:animate-[mn-spin_0.9s_linear_infinite]"
            style={{ animationPlayState: loading ? 'running' : 'paused' }}
          />
        </span>
      </span>
      {children}
    </>
  );
}
