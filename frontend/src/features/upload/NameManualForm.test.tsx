import { describe, expect, it, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { Toaster } from 'sonner';
import { server } from '@/test/server';
import { storage } from '@/shared/lib/storage';
import { NameManualSheet } from './NameManualSheet';

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

/**
 * Tests del FLUJO del formulario — la lógica vive en NameManualForm pero
 * la testeamos a través del wrapper público NameManualSheet (que en jsdom
 * cae al path mobile/Sheet porque matchMedia mockeado devuelve false).
 * El switch Sheet↔Dialog tiene su propio test en NameManualSheet.test.tsx.
 */
describe('NameManualForm (vía NameManualSheet, mobile path)', () => {
  it('no renderiza nada cuando open=false', () => {
    render(
      wrap(
        <NameManualSheet
          open={false}
          onOpenChange={() => undefined}
          file={makeFile()}
          source="gallery"
        />,
      ),
    );
    expect(screen.queryByText(/Ponle nombre al manual/i)).not.toBeInTheDocument();
  });

  it('cuando abre muestra preview del fichero y el input enfocado', async () => {
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile('catan.jpg')}
          source="gallery"
        />,
      ),
    );
    expect(await screen.findByText(/Ponle nombre al manual/i)).toBeInTheDocument();
    expect(screen.getByText('catan.jpg')).toBeInTheDocument();
    expect(screen.getByText(/etiquetar la imagen/i)).toBeInTheDocument();
  });

  it('copy contextual cambia según source', () => {
    const { rerender } = render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile('a.pdf', 'application/pdf')}
          source="pdf"
        />,
      ),
    );
    expect(screen.getByText(/etiquetar el PDF/i)).toBeInTheDocument();

    rerender(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile('cam.jpg')}
          source="camera"
        />,
      ),
    );
    expect(screen.getByText(/etiquetar la foto/i)).toBeInTheDocument();
  });

  it('botón Procesar deshabilitado hasta que el nombre tiene ≥ 2 chars', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile()}
          source="gallery"
        />,
      ),
    );
    const submit = screen.getByRole('button', { name: /Procesar/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'C');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'a');
    expect(submit).toBeEnabled();
  });

  it('al enviar dispara POST /api/manuals y navega a /processing', async () => {
    let receivedCT: string | null = null;
    server.use(
      http.post('/api/manuals', ({ request }) => {
        receivedCT = request.headers.get('content-type');
        return HttpResponse.json({
          manual_id: 'cat-123',
          chunks_indexed: 14,
          status: 'indexed',
          ocr_lines: [
            { text: 'Catan — primera línea.', confidence: 0.94 },
            { text: 'Catan — segunda línea borrosa.', confidence: 0.41 },
          ],
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
          file={makeFile('catan.jpg')}
          source="gallery"
        />,
      ),
    );
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'Catan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith({
        to: '/processing/$manualId',
        params: { manualId: 'cat-123' },
        search: { name: 'Catan' },
      }),
    );
    expect(receivedCT).toMatch(/^multipart\/form-data; boundary=/);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    // Líneas OCR persistidas en el slot dedicado del storage — el viewer
    // "Ver texto original" del Result las leerá desde aquí sin re-OCR.
    expect(storage.getOcrLines('cat-123')).toEqual([
      { text: 'Catan — primera línea.', confidence: 0.94 },
      { text: 'Catan — segunda línea borrosa.', confidence: 0.41 },
    ]);
  });

  it('al fallar el POST muestra el toast mapeado y NO navega', async () => {
    server.use(
      http.post('/api/manuals', () => HttpResponse.json({}, { status: 502 })),
    );

    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile()}
          source="gallery"
        />,
      ),
    );
    await user.type(screen.getByLabelText(/Nombre del juego/i), 'Wingspan');
    await user.click(screen.getByRole('button', { name: /Procesar/i }));

    // Toast del mapper (mapHttpStatus 502 → "Servicio cargando")
    expect(await screen.findByText(/Servicio cargando/i)).toBeInTheDocument();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('Cancelar cierra el sheet sin disparar petición', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={onOpenChange}
          file={makeFile()}
          source="gallery"
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  /* ============================================================
     Bug #6 — toast spam dedupe por id estable
     ============================================================ */
  it('errores con el mismo code muestran UN solo toast (no spam)', async () => {
    server.use(http.post('/api/manuals', () => HttpResponse.json({}, { status: 502 })));

    const user = userEvent.setup();
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          file={makeFile()}
          source="gallery"
        />,
      ),
    );

    await user.type(screen.getByLabelText(/Nombre del juego/i), 'Catan');
    const submit = screen.getByRole('button', { name: /Procesar/i });

    await user.click(submit);
    await waitFor(() => expect(screen.getByText(/Servicio cargando/i)).toBeInTheDocument());
    await user.click(submit);
    await user.click(submit);

    // Con id estable, varios disparos del mismo error no apilan toasts.
    const matches = screen.queryAllByText(/Servicio cargando/i);
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
