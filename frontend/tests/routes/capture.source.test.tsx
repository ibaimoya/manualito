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

function renderSource(initialPath = '/capture/source') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: (SourceRoute as unknown as { options: { component: React.FC } }).options.component,
  });
  const captureR = createRoute({
    getParentRoute: () => root,
    path: '/capture',
    component: () => <div data-testid="capture-screen">Capture</div>,
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
  const tree = root.addChildren([sourceR, captureR, homeR, processingR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
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

async function selectGame(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText(/Nombre del juego/i), name);
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^${name}\\s+1995$`, 'i') }),
  );
}

describe('/capture/source', () => {
  it('renderiza el titulo y las tres fuentes', async () => {
    renderSource();
    expect(await screen.findByText(/De dónde sacamos el manual\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Galería/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hacer foto/i })).toBeInTheDocument();
  });

  it('"Hacer foto" navega a /capture', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Hacer foto/i }));
    expect(await screen.findByTestId('capture-screen')).toBeInTheDocument();
  });

  it('botón X cancela y vuelve a /home', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cancelar y volver al inicio/i }));
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
  });

  it('varias imágenes de galería abren el sheet con páginas', async () => {
    renderSource();
    const user = userEvent.setup();
    await screen.findByText(/De dónde sacamos el manual\?/i);
    const galleryInput = screen.getByTestId('picker-gallery') as HTMLInputElement;
    await user.upload(galleryInput, [
      new File(['uno'], 'uno.jpg', { type: 'image/jpeg' }),
      new File(['dos'], 'dos.jpg', { type: 'image/jpeg' }),
    ]);

    expect(await screen.findByText(/Ponle nombre al manual/i)).toBeInTheDocument();
    expect(screen.getByText('uno.jpg')).toBeInTheDocument();
    expect(screen.getByText('dos.jpg')).toBeInTheDocument();
  });

  it('rechaza una imagen mayor de 20 MB y no abre el sheet', async () => {
    renderSource();
    const user = userEvent.setup();
    await screen.findByText(/De dónde sacamos el manual\?/i);
    const big = new File(['x'.repeat(21 * 1024 * 1024)], 'big.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(screen.getByTestId('picker-gallery') as HTMLInputElement, big);

    expect(await screen.findByText(/Imagen demasiado grande/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ponle nombre al manual/i)).not.toBeInTheDocument();
  });

  it('rechaza imágenes fuera de JPG, PNG y WebP', async () => {
    renderSource();
    await screen.findByText(/De dónde sacamos el manual\?/i);

    fireEvent.change(screen.getByTestId('picker-gallery'), {
      target: { files: [new File(['gif'], 'animado.gif', { type: 'image/gif' })] },
    });

    expect(await screen.findByText(/Formato no soportado/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ponle nombre al manual/i)).not.toBeInTheDocument();
  });

  it('flujo completo galería: elegir, nombrar, subir y navegar', async () => {
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
    await screen.findByText(/De dónde sacamos el manual\?/i);
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    await selectGame(user, 'Wingspan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    await waitFor(() => expect(screen.getByTestId('processing-screen')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });
});
