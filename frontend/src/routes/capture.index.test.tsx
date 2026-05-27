import { describe, expect, it, beforeAll, afterEach, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
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
import { server } from '@/test/server';
import { ThemeProvider } from '@/app/theme';
import { Route as CaptureRoute } from './capture.index';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderCapture() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: Outlet });
  const captureR = createRoute({
    getParentRoute: () => root,
    path: '/capture',
    component: (CaptureRoute as unknown as { options: { component: React.FC } }).options
      .component,
  });
  const sourceR = createRoute({
    getParentRoute: () => root,
    path: '/capture/source',
    component: () => <div data-testid="source-screen">Source</div>,
  });
  const homeR = createRoute({
    getParentRoute: () => root,
    path: '/home',
    component: () => <div data-testid="home-screen">Home</div>,
  });
  const tree = root.addChildren([captureR, sourceR, homeR]);
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/capture'] }),
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

describe('/capture', () => {
  it('muestra el shutter visual con "Toca para hacer foto"', async () => {
    renderCapture();
    expect(await screen.findByText(/Captura el manual/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Abrir cámara para capturar el manual/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Toca para hacer foto/i)).toBeInTheDocument();
  });

  it('NO muestra "Última partida" (decisión usuario)', () => {
    renderCapture();
    expect(screen.queryByText(/Última partida/i)).not.toBeInTheDocument();
  });

  it('flecha ← lleva a /capture/source (cambiar fuente)', async () => {
    renderCapture();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cambiar fuente/i }));
    expect(await screen.findByTestId('source-screen')).toBeInTheDocument();
  });

  it('botón X cancela y vuelve a /home', async () => {
    renderCapture();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /Cancelar y volver al inicio/i }),
    );
    expect(await screen.findByTestId('home-screen')).toBeInTheDocument();
  });

  it('botón secundario "Usar galería o PDF" vuelve a /capture/source', async () => {
    renderCapture();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: /Usar galería o PDF en su lugar/i }),
    );
    expect(await screen.findByTestId('source-screen')).toBeInTheDocument();
  });

  it('rechaza fichero > 20 MB con toast', async () => {
    renderCapture();
    const user = userEvent.setup();
    await screen.findByText(/Captura el manual/i);
    const big = new File(['x'.repeat(21 * 1024 * 1024)], 'huge.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(
      screen.getByTestId('picker-camera') as HTMLInputElement,
      big,
    );
    expect(await screen.findByText(/Archivo demasiado grande/i)).toBeInTheDocument();
  });

  it('al elegir foto válida abre el bottom sheet con preview', async () => {
    renderCapture();
    const user = userEvent.setup();
    await screen.findByText(/Captura el manual/i);
    const file = new File(['xxx'], 'shot.jpg', { type: 'image/jpeg' });
    await user.upload(
      screen.getByTestId('picker-camera') as HTMLInputElement,
      file,
    );
    expect(await screen.findByText(/Ponle nombre al manual/i)).toBeInTheDocument();
    expect(screen.getByText('shot.jpg')).toBeInTheDocument();
    // El copy debe ser el de cámara
    expect(screen.getByText(/etiquetar la foto/i)).toBeInTheDocument();
  });
});
