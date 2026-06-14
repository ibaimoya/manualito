import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * SegmentedControl — pill segmentado tipo iOS para elegir UN valor entre varios.
 *
 * Sobre `<RadioGroup>` de Radix: roving tabindex, navegación con flechas,
 * Space/Enter para seleccionar y ARIA semántico de serie. Sin
 * `transition-colors` interno que choque con las View Transitions del tema.
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Contador opcional: pinta una píldora con el número (p. ej. nº de items). */
  count?: number;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentOption<T>>;
  /** Etiqueta accesible del grupo — obligatoria por WAI-ARIA. */
  ariaLabel?: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      orientation="horizontal"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-full border border-border bg-surface p-1',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <RadioGroupPrimitive.Item
            key={o.value}
            value={o.value}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-card text-fg shadow-xs' : 'text-fg-2',
            )}
          >
            {o.icon ? (
              <span aria-hidden="true" className="grid place-items-center [&_svg]:size-3.5">
                {o.icon}
              </span>
            ) : null}
            {o.label}
            {typeof o.count === 'number' ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mono grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-primary-100 text-primary-700' : 'bg-surface-2 text-fg-3',
                )}
              >
                {o.count}
              </span>
            ) : null}
            <RadioGroupPrimitive.Indicator className="sr-only" />
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
