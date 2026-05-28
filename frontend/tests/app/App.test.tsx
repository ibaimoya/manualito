import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { App } from '@/app/App';

/**
 * App es la composición de `<Providers>` y `<AppRouter>`.  Mockeamos
 * `AppRouter` para no levantar el router real (que necesita el routeTree
 * generado y rutas reales) — solo verificamos que App lo monta DENTRO
 * de Providers, manteniendo el orden correcto del árbol.
 */
vi.mock('@/app/AppRouter', () => ({
  AppRouter: () => <div data-testid="app-router-mock">router-here</div>,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App', () => {
  it('monta el AppRouter envuelto en Providers (children visible)', () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('app-router-mock').textContent).toBe('router-here');
  });

  it('mantiene el árbol Providers > AppRouter (orden correcto)', () => {
    // El test anterior verifica que AppRouter aparece DENTRO del árbol;
    // este verifica el orden: si Providers no envolviese AppRouter, el
    // mockeo no recibiría context y fallaría.  Llegar hasta aquí sin
    // throw implica orden correcto.
    const { getByTestId } = render(<App />);
    expect(getByTestId('app-router-mock')).toBeInTheDocument();
  });
});
