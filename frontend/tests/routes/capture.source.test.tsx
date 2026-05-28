import { describe, expect, it, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
import { Toaster } from 'sonner';
import { server } from '@tests/_helpers/server';
import { http, HttpResponse } from 'msw';
import { ThemeProvider } from '@/app/theme';

// Tree de rutas memory para aislar la pantalla.
import { Route as SourceRoute } from '@/routes/capture.source';

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
    component: (SourceRoute as unknown as { options: { component: React.FC } }).options
      .component,
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

describe('/capture/source', () => {
  it('renderiza el título y las tres fuentes', async () => {
    renderSource();
    expect(await screen.findByText(/¿De dónde sacamos el manual\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Galería/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hacer foto/i })).toBeInTheDocument();
  });

  it('"Hacer foto" navega a /capture (mantiene el flujo cámara)', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Hacer foto/i }));
    expect(await screen.findByTestId('capture-screen')).toBeInTheDocument();
  });

  it('botón X cancela y vuelve a /home', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /Cancelar y volver al inicio/i }),
    );
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
  });

  it('archivo de galería abre el bottom sheet con el nombre', async () => {
    renderSource();
    const user = userEvent.setup();
    // Espera a que la pantalla esté montada antes de buscar el input invisible.
    await screen.findByText(/¿De dónde sacamos el manual\?/i);
    const galleryInput = screen.getByTestId('picker-gallery') as HTMLInputElement;
    const file = new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(galleryInput, file);

    expect(
      await screen.findByText(/Ponle nombre al manual/i, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('foto.jpg')).toBeInTheDocument();
  });

  it('rechaza un fichero > 20 MB y NO abre el sheet', async () => {
    renderSource();
    const user = userEvent.setup();
    await screen.findByText(/¿De dónde sacamos el manual\?/i);
    const big = new File(['x'.repeat(21 * 1024 * 1024)], 'big.jpg', {
      type: 'image/jpeg',
    });
    const galleryInput = screen.getByTestId('picker-gallery') as HTMLInputElement;
    await user.upload(galleryInput, big);
    expect(await screen.findByText(/Archivo demasiado grande/i)).toBeInTheDocument();
    expect(screen.queryByText(/Ponle nombre al manual/i)).not.toBeInTheDocument();
  });

  it('flujo completo galería: elegir → nombre → POST → navega a /processing', async () => {
    server.use(
      http.post('/api/manuals', () =>
        HttpResponse.json({
          manual_id: 'm-1',
          chunks_indexed: 3,
          status: 'indexed',
          ocr_lines: [{ text: 'Demo line', confidence: 0.9 }],
        }),
      ),
    );
    renderSource();
    const user = userEvent.setup();
    await screen.findByText(/¿De dónde sacamos el manual\?/i);
    const file = new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' });
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      file,
    );
    await user.type(
      await screen.findByLabelText(/Nombre del juego/i),
      'Wingspan',
    );
    await user.click(screen.getByRole('button', { name: /Procesar/i }));
    await waitFor(
      () => expect(screen.getByTestId('processing-screen')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });
});
