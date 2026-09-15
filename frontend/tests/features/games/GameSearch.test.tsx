import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { axe } from 'jest-axe';
import { server } from '@tests/_helpers/server';
import { GameJumpSearch } from '@/features/games/GameJumpSearch';
import { GameTypeahead } from '@/features/upload/GameTypeahead';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { GameSearchItem } from '@/shared/api/client';

const games: GameSearchItem[] = [
  { id: 'first', name: 'Catan', bgg_id: 13, year_published: 1995, manuals_count: 1 },
  { id: 'second', name: 'Catan Duel', bgg_id: 14, year_published: 2010, manuals_count: 0 },
];

// Se sustituye exclusivamente la frontera HTTP del catálogo.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderJumpSearch() {
  const root = createRootRoute();
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <GameJumpSearch games={games} />,
  });
  const game = createRoute({
    getParentRoute: () => root,
    path: '/game/$gameId',
    component: () => <h1>Juego seleccionado</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([index, game]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

function renderTypeahead() {
  const onSelect = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GameTypeahead onSelect={onSelect} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...view, onSelect };
}

describe('selección de juegos', () => {
  it('navega con flechas y Enter desde el combobox sin interferir con IME', async () => {
    // jsdom no tiene geometría ni scroll. Comprobamos la orden al navegador y su destinatario.
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const user = userEvent.setup();
    const router = renderJumpSearch();
    const input = await screen.findByRole('combobox');
    await user.type(input, 'Catan');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(router.state.location.pathname).toBe('/');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(scroll).toHaveBeenLastCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
    expect(scroll.mock.contexts.at(-1)).toBe(options[1]);
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { name: 'Juego seleccionado' });
    expect(router.state.location.pathname).toBe('/game/second');
  });

  it('activa el resultado local mediante click accesible', async () => {
    const router = renderJumpSearch();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'Catan' } });
    fireEvent.click(screen.getByRole('option', { name: /Catan Duel/ }));
    await screen.findByRole('heading', { name: 'Juego seleccionado' });
    expect(router.state.location.pathname).toBe('/game/second');
  });

  it('expone opciones del catálogo, conserva foco y permite click sin mousedown', async () => {
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    server.use(http.get('*/api/games', () => HttpResponse.json({ games, attribution: 'BGG' })));
    const user = userEvent.setup();
    const { container, onSelect } = renderTypeahead();
    const input = screen.getByRole('combobox');
    await user.type(input, 'Catan');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    const second = screen.getByRole('option', { name: /Catan Duel/ });
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(second).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', second.id);
    expect(scroll).toHaveBeenLastCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'instant',
    });
    expect(scroll.mock.contexts.at(-1)).toBe(second);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith(games[1]);
    fireEvent.click(screen.getByRole('option', { name: /^Catan.*1995/ }));
    expect(onSelect).toHaveBeenLastCalledWith(games[0]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('crea un juego vacío mediante Enter en el botón', async () => {
    let submitted: unknown;
    server.use(
      http.get('*/api/games', () => HttpResponse.json({ games: [], attribution: 'BGG' })),
      http.post('*/api/games', async ({ request }) => {
        submitted = await request.json();
        return HttpResponse.json({ ...games[0], name: 'Mi juego' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { onSelect } = renderTypeahead();
    await user.type(screen.getByRole('combobox'), 'Mi juego');
    const create = await screen.findByRole('option', { name: /Mi juego/ });
    create.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
    expect(submitted).toEqual({ name: 'Mi juego' });
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ name: 'Mi juego' });
  });

  it('recorre cinco coincidencias y la opción de añadir con las flechas', async () => {
    const many: GameSearchItem[] = Array.from({ length: 5 }, (_, index) => ({
      id: `g${index}`,
      name: `Catan ${index}`,
      bgg_id: index,
      year_published: 2000 + index,
      manuals_count: 0,
    }));
    server.use(
      http.get('*/api/games', () => HttpResponse.json({ games: many, attribution: 'BGG' })),
    );
    const user = userEvent.setup();
    renderTypeahead();
    const input = screen.getByRole('combobox');
    await user.type(input, 'Catan');
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(6);
    const addRow = options[5]!;
    expect(addRow).toHaveTextContent('Catan');

    for (let i = 0; i < 5; i += 1) await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', addRow.id);
    expect(addRow).toHaveAttribute('aria-selected', 'true');
  });

  it('ignora Enter cuando la consulta está vacía o acaba de cambiar', async () => {
    server.use(
      http.get('*/api/games', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        const matches = games.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
        return HttpResponse.json({ games: matches, attribution: 'BGG' });
      }),
    );
    const { onSelect } = renderTypeahead();
    const input = screen.getByRole('combobox');

    // Todavía no hay consulta.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Catan' } });
    await screen.findByRole('option', { name: /Catan Duel/ });

    // El texto queda por debajo del mínimo.
    fireEvent.change(input, { target: { value: 'Ca' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Catan' } });
    await screen.findByRole('option', { name: /Catan Duel/ });

    // La caché de Catan no corresponde al nuevo nombre.
    fireEvent.change(input, { target: { value: 'Wingspan' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Catan' } });
    await screen.findByRole('option', { name: /Catan Duel/ });

    // Añadir letras también invalida las opciones anteriores.
    fireEvent.change(input, { target: { value: 'Catani' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
