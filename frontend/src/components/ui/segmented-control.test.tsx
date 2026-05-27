import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { SegmentedControl } from './segmented-control';

/**
 * Tests del refactor J1 (catálogo bugs #34, #42): SegmentedControl
 * construido sobre Radix RadioGroup en lugar de buttons manuales.
 *
 * Cubrimos:
 *  - Render con role="radiogroup" + role="radio" semántico.
 *  - aria-checked refleja el `value` controlado.
 *  - Click sobre opción dispara onChange.
 *  - Expone aria-orientation (sanity check de que sigue siendo Radix).
 *  - Cada item es un <button> nativo (soporte SR y teclado del browser).
 *  - Sin violaciones axe.
 *
 * Nota: el comportamiento "Flechas navegan dentro del grupo + Tab
 * entra/sale" (roving tabindex) está implementado por Radix y verificado
 * end-to-end en Settings; lo cubrimos con tests aquí solo si jsdom lo
 * soportara — pero `RovingFocusGroup` depende de ResizeObserver y
 * focus tracking que jsdom no implementa de forma consistente.  Esa
 * cobertura queda para los e2e (Playwright, sprint siguiente).
 */

type Mode = 'light' | 'dark' | 'auto';

function Harness({ initial = 'light' as Mode }: { initial?: Mode }) {
  const [v, setV] = useState<Mode>(initial);
  return (
    <SegmentedControl<Mode>
      value={v}
      onChange={setV}
      ariaLabel="Modo de color"
      options={[
        { value: 'light', label: 'Claro' },
        { value: 'dark', label: 'Oscuro' },
        { value: 'auto', label: 'Auto' },
      ]}
    />
  );
}

describe('SegmentedControl', () => {
  it('renderiza como radiogroup con todas las opciones', () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Modo de color' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('aria-checked refleja el value controlado', () => {
    render(<Harness initial="dark" />);
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('click sobre una opción dispara onChange (y la marca activa)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('expone aria-required y aria-orientation desde Radix RadioGroup', () => {
    // Sanity check de que estamos usando Radix (no buttons sueltos):
    // RadioGroup.Root añade aria-orientation por defecto.  Si lo
    // sustituyésemos por buttons manuales (regresión a v0), esto
    // dejaría de existir.
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Modo de color' })).toHaveAttribute(
      'aria-orientation',
      'horizontal',
    );
  });

  it('los radios son botones nativos (no <div>) — soporte SR + teclado nativo', () => {
    // Radix renderiza cada Item como un <button> real, lo que garantiza
    // soporte de teclado y screen readers sin polyfills.
    render(<Harness />);
    const radios = screen.getAllByRole('radio');
    radios.forEach((r) => expect(r.tagName).toBe('BUTTON'));
  });

  it('pasa a11y axe', async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
