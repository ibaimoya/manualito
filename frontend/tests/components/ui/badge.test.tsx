import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renderiza texto y queda en el DOM', () => {
    render(<Badge>Listo</Badge>);
    expect(screen.getByText('Listo')).toBeInTheDocument();
  });

  it('aplica clases del tone success', () => {
    render(<Badge tone="success">OK</Badge>);
    expect(screen.getByText('OK').className).toMatch(/bg-success/);
  });

  it('renderiza icono cuando se pasa', () => {
    render(
      <Badge tone="primary" icon={<svg data-testid="icon" />}>
        Texto
      </Badge>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('pasa a11y axe en todos los tonos', async () => {
    const { container } = render(
      <div>
        <Badge>neutral</Badge>
        <Badge tone="primary">primary</Badge>
        <Badge tone="success">success</Badge>
        <Badge tone="error">error</Badge>
        <Badge tone="warning">warning</Badge>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
