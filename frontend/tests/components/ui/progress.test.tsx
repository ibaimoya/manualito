import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Progress } from '@/components/ui/progress';

describe('Progress', () => {
  it('expone role="progressbar" para a11y', () => {
    render(<Progress value={42} aria-label="Progreso de carga" />);
    const bar = screen.getByRole('progressbar', { name: 'Progreso de carga' });
    expect(bar).toBeInTheDocument();
  });

  it('clampea valores fuera de [0, 100]', () => {
    const { rerender } = render(<Progress value={150} aria-label="x" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<Progress value={-20} aria-label="x" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('cuando value es undefined, queda en 0', () => {
    render(<Progress aria-label="x" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('pasa axe', async () => {
    const { container } = render(<Progress value={64} aria-label="Procesando manual" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
