import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Skeleton es un puro div con gradient + animación shimmer.  No tiene
 * lógica que probar más allá de:
 *  - Renderiza un elemento DIV en el DOM.
 *  - Acepta className extra y la fusiona.
 *  - Pasa otros props (id, role, aria-*) al div subyacente.
 */
describe('Skeleton', () => {
  it('renderiza un div con las clases base del shimmer', () => {
    const { container } = render(<Skeleton data-testid="sk" />);
    const node = container.firstElementChild;
    expect(node).not.toBeNull();
    expect(node?.tagName).toBe('DIV');
    expect(node?.className).toMatch(/animate-/);
    expect(node?.className).toMatch(/bg-gradient-to-r/);
  });

  it('fusiona la className recibida con las clases base', () => {
    const { container } = render(<Skeleton className="h-10 w-10" />);
    const node = container.firstElementChild!;
    expect(node.className).toContain('h-10');
    expect(node.className).toContain('w-10');
    expect(node.className).toMatch(/animate-/);
  });

  it('reenvía atributos arbitrarios (role, aria-label) al div', () => {
    const { container } = render(
      <Skeleton role="status" aria-label="Cargando" id="sk-1" />,
    );
    const node = container.firstElementChild!;
    expect(node.getAttribute('role')).toBe('status');
    expect(node.getAttribute('aria-label')).toBe('Cargando');
    expect(node.id).toBe('sk-1');
  });
});
