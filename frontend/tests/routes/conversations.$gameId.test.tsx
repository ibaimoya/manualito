import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ConversationsRoute } from '@/routes/_app.conversations.$gameId';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderConversations() {
  return renderRoute({
    path: '/conversations/$gameId',
    initialEntry: '/conversations/test-game-001',
    component: routeComponent(ConversationsRoute),
    stubs: {
      '/history': 'Historial stub',
      '/home': 'Home stub',
      '/game/$gameId': 'Juego stub',
      '/chat/$manualId': 'Chat stub',
    },
  });
}

describe('/conversations/$gameId', () => {
  it('lista las conversaciones con contador y FAB de nueva', async () => {
    renderConversations();
    expect(await screen.findByText('Dudas de preparación')).toBeInTheDocument();
    expect(screen.getByText('1 guardada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Nueva conversación/ })).toHaveAttribute(
      'href',
      '/chat/test-manual-001?g=test-game-001',
    );
  });

  it('el filtro acota la lista y muestra "X de N" en el contador', async () => {
    renderConversations();
    const user = userEvent.setup();
    await screen.findByText('Dudas de preparación');
    const search = screen.getByRole('searchbox', { name: 'Filtrar conversaciones por título' });
    await user.type(search, 'preparación');
    expect(await screen.findByText('1 de 1')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'no existe');
    await waitFor(() => {
      expect(screen.queryByText('Dudas de preparación')).not.toBeInTheDocument();
    });
  });

  it('renombrar desde el kebab: el diálogo precarga el título y guarda', async () => {
    renderConversations();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Opciones de «Dudas de preparación»' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Renombrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar conversación' });
    const input = within(dialog).getByRole('textbox');
    expect(input).toHaveValue('Dudas de preparación');
    expect(dialog).toHaveTextContent(/Este título lo generó la IA/);
    await user.clear(input);
    await user.type(input, 'Preparación inicial');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Conversación renombrada')).toBeInTheDocument();
  });

  it('un borrador abandonado no sobrevive al cerrar y reabrir el diálogo', async () => {
    renderConversations();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Opciones de «Dudas de preparación»' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Renombrar' }));
    let dialog = await screen.findByRole('dialog', { name: 'Renombrar conversación' });
    const input = within(dialog).getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'borrador a medias');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Opciones de «Dudas de preparación»' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Renombrar' }));
    dialog = await screen.findByRole('dialog', { name: 'Renombrar conversación' });
    expect(within(dialog).getByRole('textbox')).toHaveValue('Dudas de preparación');
  });

  it('borrar desde el kebab pasa por confirmación destructiva', async () => {
    renderConversations();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Opciones de «Dudas de preparación»' }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Borrar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Borrar conversación' });
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer.');
    await user.click(within(dialog).getByRole('button', { name: 'Borrar conversación' }));
    expect(await screen.findByText('Conversación borrada')).toBeInTheDocument();
  });

  it('sin conversaciones muestra el estado vacío con CTA', async () => {
    server.use(
      http.get('/api/games/:gameId/conversations', () =>
        HttpResponse.json({ conversations: [] }),
      ),
    );
    renderConversations();
    expect(await screen.findByText('Aún no has preguntado nada')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderConversations();
    await screen.findByText('Dudas de preparación');
    expect(await axe(container)).toHaveNoViolations();
  });
});
