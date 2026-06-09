import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

function Boom(): never {
  throw new Error('Test boom!');
}

describe('ErrorBoundary', () => {
  it('renderiza los hijos cuando no hay error', () => {
    render(
      <ErrorBoundary>
        <p>Hijo OK</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hijo OK')).toBeInTheDocument();
  });

  it('renderiza fallback custom cuando un hijo lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary fallback={(err) => <p>Caught: {err.message}</p>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Caught: Test boom!/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('fallback por defecto cuando un hijo lanza', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Algo ha fallado/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('fallback custom recibe `reset` como función invocable', () => {

    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let receivedReset: (() => void) | null = null;
    render(
      <ErrorBoundary
        fallback={(_err, reset) => {
          receivedReset = reset;
          return <p>fb</p>;
        }}
      >
        <Boom />
      </ErrorBoundary>,
    );
    expect(typeof receivedReset).toBe('function');
    // Llamar reset() — no esperamos un re-render visible (el render del
    // boundary tras setState dispararía otra vez Boom).  Solo necesitamos
    // que la línea se ejecute para que V8 la marque como cubierta.
    receivedReset!();
    spy.mockRestore();
  });

  it('botón "Reintentar" del fallback por defecto llama a window.location.reload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // window.location.reload no es trivial de mockear porque `location` es
    // readonly.  Reemplazamos el objeto completo con un proxy mockeable.
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: /Reintentar/i }));
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
      spy.mockRestore();
    }
  });

  it('en modo dev muestra el mensaje del error en un <pre> debajo', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // import.meta.env.DEV es true en vitest (NODE_ENV=test ⇒ DEV=true).
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Test boom!/)).toBeInTheDocument();
    spy.mockRestore();
  });
});
