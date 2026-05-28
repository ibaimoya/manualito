import { describe, expect, it, vi } from 'vitest';

/**
 * AppRouter envuelve `RouterProvider` de TanStack Router con el `router`
 * singleton creado en module-scope (lee `routeTree.gen.ts`).
 *
 * Test isolation: mockeamos `RouterProvider` y `createRouter` ANTES de
 * importar `AppRouter`, así no necesitamos un routeTree generado válido
 * y comprobamos solo el contrato: AppRouter llama a `createRouter` con
 * el routeTree y renderiza `<RouterProvider router={router} />`.
 */
vi.mock('@tanstack/react-router', () => {
  const createRouter = vi.fn(() => ({ __router: 'mocked' }));
  const RouterProvider = ({
    router,
  }: {
    router: { __router: string };
  }) => <div data-testid="router-provider">{router.__router}</div>;
  return { createRouter, RouterProvider };
});

vi.mock('@/routeTree.gen', () => ({
  // Solo necesitamos cualquier objeto — `createRouter` está mockeado y
  // no inspecciona el contenido.
  routeTree: { __routeTree: true },
}));

describe('AppRouter', () => {
  it('renderiza un RouterProvider con el router creado por createRouter', async () => {
    const { render } = await import('@testing-library/react');
    const { AppRouter } = await import('@/app/AppRouter');
    const { createRouter } = await import('@tanstack/react-router');

    const { getByTestId } = render(<AppRouter />);
    expect(getByTestId('router-provider').textContent).toBe('mocked');
    expect(createRouter).toHaveBeenCalledTimes(1);
    // Verificamos el contrato esperado: defaultPreload + scrollRestoration.
    const callArg = (
      createRouter as unknown as { mock: { calls: Array<[Record<string, unknown>]> } }
    ).mock.calls[0]![0];
    expect(callArg).toMatchObject({
      defaultPreload: 'intent',
      scrollRestoration: true,
    });
  });
});
