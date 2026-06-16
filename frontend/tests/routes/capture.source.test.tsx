import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as SourceRoute } from '@/routes/_app.capture.source';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSource(gameId?: string) {
  return renderRoute({
    path: '/capture/source',
    initialEntry: gameId ? `/capture/source?gameId=${gameId}` : '/capture/source',
    component: routeComponent(SourceRoute),
    validateSearch: (s) => ({ gameId: typeof s.gameId === 'string' ? s.gameId : undefined }),
    stubs: {
      '/home': 'HomeScreen',
      '/processing/$manualId': 'ProcessingScreen',
    },
  });
}

async function pickGame(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), name);
  await user.click(await screen.findByRole('button', { name: new RegExp(`${name}.*1995`, 'i') }));
}

const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * MB;
const MAX_UPLOAD_BYTES = 200 * MB;

function imageFile(name: string, size = 1): File {
  return sizedFile(name, 'image/jpeg', size);
}

function pdfFile(size: number): File {
  return sizedFile('manual.pdf', 'application/pdf', size);
}

function sizedFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function imageFiles(count: number): File[] {
  return Array.from({ length: count }, (_, index) => imageFile(`page-${index + 1}.jpg`));
}

function imageFilesWithTotalSize(totalSize: number): File[] {
  const files: File[] = [];
  let remaining = totalSize;
  while (remaining > 0) {
    const size = Math.min(MAX_IMAGE_BYTES, remaining);
    files.push(imageFile(`page-${files.length + 1}.jpg`, size));
    remaining -= size;
  }
  return files;
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

  it('si el juego no está en BGG, crearlo lo deja seleccionado', async () => {
    server.use(
      http.get('/api/games', () =>
        HttpResponse.json({ games: [], attribution: 'Powered by BoardGameGeek.' }),
      ),
      http.post('/api/games', () =>
        HttpResponse.json({
          id: 'g-new',
          name: 'Mi juego casero',
          bgg_id: null,
          year_published: null,
          manuals_count: 0,
        }),
      ),
    );
    renderSource();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole('combobox', { name: /Buscar juego/i }),
      'Mi juego casero',
    );
    // Sin coincidencias aparece la opción de crearlo.
    const createBtn = await screen.findByRole('button', { name: /Crear «Mi juego casero»/i });
    await user.click(createBtn);
    // El juego creado queda elegido (chip con «Elegido»).
    expect(await screen.findByText(/Elegido/i)).toBeInTheDocument();
    expect(screen.getByText('Mi juego casero')).toBeInTheDocument();
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

  it('rechaza una imagen mayor de 30 MB', async () => {
    renderSource();
    await screen.findByRole('combobox', { name: /Buscar juego/i });
    fireEvent.change(screen.getByTestId('picker-gallery'), {
      target: {
        files: [new File(['x'.repeat(31 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })],
      },
    });
    expect(await screen.findByText(/Imagen demasiado grande/i)).toBeInTheDocument();
    expect(screen.queryByText('big.jpg')).not.toBeInTheDocument();
  });

  it.each([
    [29, true],
    [30, true],
    [31, false],
  ])('BVA páginas por imágenes: %i páginas', async (count, accepted) => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    await user.upload(screen.getByTestId('picker-gallery') as HTMLInputElement, imageFiles(count));

    if (accepted) {
      expect(await screen.findByText(`${count} / 30 páginas`)).toBeInTheDocument();
      expect(screen.getByText('page-1.jpg')).toBeInTheDocument();
    } else {
      expect(await screen.findByText(/Demasiadas páginas/i)).toBeInTheDocument();
      expect(screen.queryByText('page-1.jpg')).not.toBeInTheDocument();
    }
  });

  it.each([
    [MAX_UPLOAD_BYTES - 1, true],
    [MAX_UPLOAD_BYTES, true],
    [MAX_UPLOAD_BYTES + 1, false],
  ])('BVA tamaño total de imágenes: %i bytes', async (totalSize, accepted) => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    const files = imageFilesWithTotalSize(totalSize);

    await user.upload(screen.getByTestId('picker-gallery') as HTMLInputElement, files);

    if (accepted) {
      expect(await screen.findByText(`${files.length} / 30 páginas`)).toBeInTheDocument();
    } else {
      expect(await screen.findByText(/Archivo demasiado grande/i)).toBeInTheDocument();
      expect(screen.queryByText('page-1.jpg')).not.toBeInTheDocument();
    }
  });

  it.each([
    [MAX_UPLOAD_BYTES - 1, true],
    [MAX_UPLOAD_BYTES, true],
    [MAX_UPLOAD_BYTES + 1, false],
  ])('BVA tamaño de PDF: %i bytes', async (pdfSize, accepted) => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    await user.upload(screen.getByTestId('picker-pdf') as HTMLInputElement, pdfFile(pdfSize));

    if (accepted) {
      expect(await screen.findByText('manual.pdf')).toBeInTheDocument();
    } else {
      expect(await screen.findByText(/PDF demasiado grande/i)).toBeInTheDocument();
      expect(screen.queryByText('manual.pdf')).not.toBeInTheDocument();
    }
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
    await waitFor(() => expect(screen.getByText('ProcessingScreen')).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it('preseleccionado desde el hub: arranca con el juego de origen como chip', async () => {
    // Llegamos desde el hub de Catan (test-game-001); el detalle lo sirve MSW.
    renderSource('test-game-001');
    expect(await screen.findByText(/Elegido/i)).toBeInTheDocument();
    expect(screen.getByText('Catan')).toBeInTheDocument();
    // Es un chip, no el buscador: no hay combobox visible.
    expect(screen.queryByRole('combobox', { name: /Buscar juego/i })).not.toBeInTheDocument();
  });

  it('si cambias el juego preseleccionado, el manual va al nuevo, no al de origen', async () => {
    let sentGameId: string | null = null;
    server.use(
      // El buscador devuelve un juego con id propio para distinguirlo del de origen.
      http.get('/api/games', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q') ?? '';
        return HttpResponse.json({
          games: [
            {
              id: 'game-wingspan',
              name: q,
              bgg_id: 266192,
              year_published: 1995,
              manuals_count: 0,
            },
          ],
          attribution: 'Powered by BoardGameGeek.',
        });
      }),
      http.post('/api/manuals', async ({ request }) => {
        // undici no parsea multipart con File de jsdom: leemos el cuerpo en crudo.
        const body = await request.text();
        sentGameId = /name="game_id"\r?\n\r?\n([^\r\n]+)/.exec(body)?.[1] ?? null;
        return HttpResponse.json({
          manual_id: 'm-new',
          game_id: sentGameId,
          status: 'indexing',
          visibility: 'shared',
          source_type: 'images',
          page_count: 1,
        });
      }),
    );
    renderSource('test-game-001');
    const user = userEvent.setup();
    // Arranca preseleccionado con el juego de origen.
    expect(await screen.findByText('Catan')).toBeInTheDocument();
    // Lo cambiamos por otro juego distinto.
    await user.click(screen.getByRole('button', { name: /Cambiar/i }));
    await pickGame(user, 'Wingspan');
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    await user.click((await screen.findAllByRole('button', { name: /Procesar/i }))[0]!);
    await waitFor(() => expect(sentGameId).toBe('game-wingspan'));
    expect(sentGameId).not.toBe('test-game-001');
  });

  it('comparte por defecto: el manual se procesa con visibility "shared"', async () => {
    let sentVisibility: string | null = null;
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        // undici no parsea multipart con File de jsdom: leemos el cuerpo en crudo.
        const body = await request.text();
        sentVisibility = /name="visibility"\r?\n\r?\n(shared|private)/.exec(body)?.[1] ?? null;
        return HttpResponse.json({
          manual_id: 'm-1',
          game_id: 'game-1',
          status: 'indexing',
          visibility: 'shared',
          source_type: 'images',
          page_count: 1,
        });
      }),
    );
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    // El interruptor arranca activado (compartir).
    expect(
      screen.getByRole('switch', { name: /Compartir el manual con la comunidad/i }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    await screen.findByText('foto.jpg');
    await user.click((await screen.findAllByRole('button', { name: /Procesar/i }))[0]!);
    await waitFor(() => expect(screen.getByText('ProcessingScreen')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(sentVisibility).toBe('shared');
  });

  it('al apagar el interruptor, el manual se procesa como "private"', async () => {
    let sentVisibility: string | null = null;
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        // undici no parsea multipart con File de jsdom: leemos el cuerpo en crudo.
        const body = await request.text();
        sentVisibility = /name="visibility"\r?\n\r?\n(shared|private)/.exec(body)?.[1] ?? null;
        return HttpResponse.json({
          manual_id: 'm-1',
          game_id: 'game-1',
          status: 'indexing',
          visibility: 'private',
          source_type: 'images',
          page_count: 1,
        });
      }),
    );
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    const toggle = screen.getByRole('switch', { name: /Compartir el manual con la comunidad/i });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      new File(['xxx'], 'foto.jpg', { type: 'image/jpeg' }),
    );
    await screen.findByText('foto.jpg');
    await user.click((await screen.findAllByRole('button', { name: /Procesar/i }))[0]!);
    await waitFor(() => expect(screen.getByText('ProcessingScreen')).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(sentVisibility).toBe('private');
  });
});
