import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { Toaster } from 'sonner';
import { server } from '@tests/_helpers/server';
import { NameManualSheet } from '@/features/upload/NameManualSheet';

const navigateSpy = vi.fn();
vi.mock('@tanstack/react-router', async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useNavigate: () => navigateSpy,
  };
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  navigateSpy.mockReset();
  localStorage.clear();
});
afterAll(() => server.close());

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster richColors />
    </QueryClientProvider>
  );
}

function makeFile(name = 'foto.jpg', type = 'image/jpeg', kb = 12): File {
  return new File(['x'.repeat(kb * 1024)], name, { type });
}

async function selectGame(user: ReturnType<typeof userEvent.setup>, name = 'Catan') {
  await user.type(screen.getByLabelText(/Nombre del juego/i), name);
  await user.click(await screen.findByRole('button', { name: gameResultName(name) }));
}

function gameResultName(name: string): RegExp {
  return new RegExp(`^${name}\\s+1995$`, 'i');
}

describe('NameManualForm via NameManualSheet', () => {
  it('no renderiza nada cuando open=false', () => {
    render(
      wrap(
        <NameManualSheet
          open={false}
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    expect(screen.queryByText(/Ponle nombre al manual/i)).not.toBeInTheDocument();
  });

  it('muestra las paginas seleccionadas y el input de nombre', async () => {
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile('catan-1.jpg'), makeFile('catan-2.jpg')]}
          source="gallery"
        />,
      ),
    );
    expect(await screen.findByText(/Ponle nombre al manual/i)).toBeInTheDocument();
    expect(screen.getByText('catan-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('catan-2.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Revisa las paginas/i)).toBeInTheDocument();
  });

  it('copy contextual cambia segun source', () => {
    const { rerender } = render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile('a.pdf', 'application/pdf')]}
          source="pdf"
        />,
      ),
    );
    expect(screen.getByText(/procesaran todas las paginas/i)).toBeInTheDocument();

    rerender(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile('cam.jpg')]}
          source="camera"
        />,
      ),
    );
    expect(screen.getByText(/etiquetar la foto/i)).toBeInTheDocument();
  });

  it('boton Procesar requiere nombre y juego seleccionado', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    const submit = screen.getByRole('button', { name: /Procesar/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'C');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'a');
    expect(submit).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: gameResultName('Ca') }));
    expect(submit).toBeEnabled();
  });

  it('permite reordenar y quitar paginas antes de subir', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile('uno.jpg'), makeFile('dos.jpg')]}
          source="gallery"
        />,
      ),
    );

    await user.click(screen.getByRole('button', { name: /Subir pagina 2/i }));
    const pageLabels = screen.getAllByText(/Pagina \d/i);
    expect(pageLabels[0]).toHaveTextContent('Pagina 1');
    expect(screen.getByText('dos.jpg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Quitar pagina 1/i }));
    expect(screen.queryByText('dos.jpg')).not.toBeInTheDocument();
  });

  it('envia imagenes en multipart y navega a processing', async () => {
    let receivedBody = '';
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        receivedBody = await request.text();
        return HttpResponse.json({
          manual_id: 'cat-123',
          game_id: 'game-123',
          status: 'indexing',
          visibility: 'private',
          source_type: 'images',
          page_count: 2,
        });
      }),
    );

    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={onOpenChange}
          files={[makeFile('a.jpg'), makeFile('b.jpg')]}
          source="gallery"
        />,
      ),
    );
    await selectGame(user, 'Catan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith({
        to: '/processing/$manualId',
        params: { manualId: 'cat-123' },
        search: { name: 'Catan' },
      }),
    );
    expect(receivedBody).toContain('title');
    expect(receivedBody).toContain('Catan');
    expect(receivedBody).toContain('game_id');
    expect(receivedBody).toContain('test-game-001');
    expect(receivedBody).toContain('images');
    expect(receivedBody.match(/name="images"/g)).toHaveLength(2);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('envia PDF como campo singular', async () => {
    let receivedBody = '';
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        receivedBody = await request.text();
        return HttpResponse.json({
          manual_id: 'pdf-123',
          game_id: 'game-123',
          status: 'indexing',
          visibility: 'private',
          source_type: 'pdf',
          page_count: 3,
        });
      }),
    );

    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile('manual.pdf', 'application/pdf')]}
          source="pdf"
        />,
      ),
    );
    await selectGame(user, 'Catan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(receivedBody).toContain('pdf');
    expect(receivedBody.match(/name="pdf"/g)).toHaveLength(1);
  });

  it('al fallar el POST muestra el toast mapeado y no navega', async () => {
    server.use(http.post('/api/manuals', () => HttpResponse.json({}, { status: 502 })));

    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    await selectGame(user, 'Wingspan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    expect(await screen.findByText(/Servicio cargando/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el sheet sin disparar peticion', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={onOpenChange}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
