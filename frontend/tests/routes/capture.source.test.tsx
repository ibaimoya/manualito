import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/app/theme';
import { Route as SourceRoute } from '@/routes/_app.capture.source';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSource() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: (SourceRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const homeR = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div data-testid="home-screen">Home</div>,
  });
  const processingR = createRoute({
    getParentRoute: () => root,
    path: '/processing/$manualId',
    component: () => <div data-testid="processing-screen">Processing</div>,
  });
  const router = createRouter({
    routeTree: root.addChildren([sourceR, homeR, processingR]),
    history: createMemoryHistory({ initialEntries: ['/capture/source'] }),
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
        <Toaster richColors />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

async function pickGame(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), name);
  await user.click(await screen.findByRole('button', { name: new RegExp(`${name}.*1995`, 'i') }));
}

describe('/capture/source · nuevo manual', () => {
  it('arranca eligiendo juego y con las fuentes deshabilitadas', async () => {
    renderSource();
    expect(await screen.findByRole('heading', { name: /Nuevo manual/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Elige el juego/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar juego/i })).toBeInTheDocument();
    // Sin juego elegido, no se pueden añadir páginas todavía.
    expect(screen.getByLabelText(/Seleccionar imágenes de la galería/i)).toBeDisabled();
    expect(screen.getByLabelText(/Seleccionar PDF/i)).toBeDisabled();
  });

  it('el typeahead muestra resultados y la atribución de BoardGameGeek', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), 'Catan');
    expect(await screen.findByRole('button', { name: /Catan.*1995/i })).toBeInTheDocument();
    expect(screen.getByText('BoardGameGeek')).toBeInTheDocument();
  });

  it('elegir un juego muestra el chip y habilita las fuentes', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    expect(await screen.findByRole('button', { name: /Cambiar/i })).toBeInTheDocument();
    expect(screen.getByText(/Elegido/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText(/Seleccionar imágenes de la galería/i)).toBeEnabled(),
    );
  });

  it('asocia cada tarjeta visible al input nativo de fichero', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    const galleryInput = screen.getByTestId('picker-gallery');
    const galleryLabel = screen.getByText('Galería').closest('label');
    expect(galleryLabel).toHaveAttribute('for', galleryInput.id);
  });

  it('mantiene Procesar deshabilitado hasta tener páginas', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    for (const button of screen.getAllByRole('button', { name: /^Procesar$/i })) {
      expect(button).toBeDisabled();
    }
  });

  it('botón X cancela y vuelve a /home', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cancelar y volver al inicio/i }));
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
  });

  it('rechaza una imagen mayor de 20 MB', async () => {
    renderSource();
    await screen.findByRole('combobox', { name: /Buscar juego/i });
    fireEvent.change(screen.getByTestId('picker-gallery'), {
      target: { files: [new File(['x'.repeat(21 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })] },
    });
    expect(await screen.findByText(/Imagen demasiado grande/i)).toBeInTheDocument();
    expect(screen.queryByText('big.jpg')).not.toBeInTheDocument();
  });

  it('rechaza formatos fuera de JPG, PNG y WebP', async () => {
    renderSource();
    await screen.findByRole('combobox', { name: /Buscar juego/i });
    fireEvent.change(screen.getByTestId('picker-gallery'), {
      target: { files: [new File(['gif'], 'animado.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByText(/Formato no soportado/i)).toBeInTheDocument();
  });

  it('flujo completo: elegir juego, añadir página y procesar', async () => {
    server.use(
      http.post('/api/manuals', () =>
        HttpResponse.json({
          manual_id: 'm-1',
          game_id: 'game-1',
          status: 'indexing',
          visibility: 'private',
          source_type: 'images',
          page_count: 1,
        }),
      ),
    );
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('foto.jpg')).toBeInTheDocument();
    const procesar = await screen.findAllByRole('button', { name: /Procesar/i });
    await user.click(procesar[0]!);
    await waitFor(() => expect(screen.getByTestId('processing-screen')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });
});
