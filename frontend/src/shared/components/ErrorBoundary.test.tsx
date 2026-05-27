import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

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
});
