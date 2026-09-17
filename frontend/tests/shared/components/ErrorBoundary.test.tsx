import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

function Boom(): never {
  throw new Error('Test boom!');
}

beforeEach(() => {
  // React informa en consola de los errores de render provocados en estas pruebas.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('ErrorBoundary', () => {
  it('renderiza los hijos cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <p>Hijo OK</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hijo OK')).toBeInTheDocument();
  });

  it('ofrece detalles cerrados y recupera los hijos al reintentar', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const heading = screen.getByRole('heading', { name: 'No hemos podido abrir esta página' });
    expect(screen.getByRole('main')).toContainElement(heading);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: /inicio/i })).toHaveAttribute(
      'href',
      '/',
    );

    const details = screen.getByText('Detalles técnicos').closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('Test boom!')).not.toBeVisible();
    await user.click(screen.getByText('Detalles técnicos'));
    expect(screen.getByText('Test boom!')).toBeVisible();

    rerender(
      <ErrorBoundary>
        <p>Hijo recuperado</p>
      </ErrorBoundary>,
    );
    expect(screen.queryByText('Hijo recuperado')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Hijo recuperado')).toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('no expone detalles técnicos en producción', () => {
    vi.stubEnv('DEV', false);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(
      screen.getByRole('heading', { name: 'No hemos podido abrir esta página' }),
    ).toBeVisible();
    expect(screen.queryByText('Detalles técnicos')).not.toBeInTheDocument();
    expect(screen.queryByText('Test boom!')).not.toBeInTheDocument();
  });
});
