import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * SegmentedControl — pill segmentado tipo iOS para elegir UN valor entre varios.
 *
 * Refactor (catálogo bugs #34 y #41): construido sobre `<RadioGroup>` de
 * Radix UI en vez de buttons manuales.  Ventajas:
 *  - **Roving tabindex** automático: Tab solo entra/sale del grupo, no
 *    navega entre los segmentos.  Patrón canónico WAI-ARIA.
 *  - **Flechas izq/dcha** para navegar entre opciones con teclado.
 *  - **Space/Enter** para seleccionar.
 *  - ARIA semántico (`role="radiogroup"` + `role="radio"` + aria-checked).
 *  - Sin `transition-colors` interno que choque con View Transitions
 *    globales (ej. cambio de tema con `document.startViewTransition`).
 *
 * API pública intacta — mismos props que la versión anterior:
 *   <SegmentedControl
 *     value={mode}
 *     onChange={setMode}
 *     options={[{value:'light', label:'Claro', icon:<Sun/>}, …]}
 *   />
 *
 * Ver:
 *   https://www.radix-ui.com/primitives/docs/components/radio-group
 *   https://www.w3.org/WAI/ARIA/apg/patterns/radio/
 */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
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
              // Sin `transition-colors` global — evita conflictos con
              // View Transitions del tema.  El cambio de pill es
              // instantáneo (lo bonito viene del crossfade global).
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active ? 'bg-bg text-fg shadow-xs' : 'text-fg-2',
            )}
          >
            {o.icon ? (
              <span aria-hidden="true" className="grid place-items-center [&_svg]:size-3.5">
                {o.icon}
              </span>
            ) : null}
            {o.label}
            {/* `<Indicator>` es el "punto activo" semántico — lo dejamos
                vacío porque el visual de "activo" se gestiona vía clases. */}
            <RadioGroupPrimitive.Indicator className="sr-only" />
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
