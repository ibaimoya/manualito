import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as SourceRoute } from '@/routes/_app.capture.source';
import { server } from '@tests/_helpers/server';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import i18n from '@/app/i18n';

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderSource(gameId?: string, strict = false) {
  const SourceScreen = routeComponent(SourceRoute);
  return renderRoute({
    path: '/capture/source',
    initialEntry: gameId ? `/capture/source?gameId=${gameId}` : '/capture/source',
    component: strict
      ? () => (
          <StrictMode>
            <SourceScreen />
          </StrictMode>
        )
      : SourceScreen,
    validateSearch: (s) => ({ gameId: typeof s.gameId === 'string' ? s.gameId : undefined }),
    stubs: {
      '/home': 'HomeScreen',
      '/processing/$manualId': 'ProcessingScreen',
    },
  });
}

async function pickGame(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), name);
  await user.click(await screen.findByRole('option', { name: new RegExp(`${name}.*1995`, 'i') }));
}

const MAX_IMAGE_BYTES = 30_000_000;
const MAX_UPLOAD_BYTES = 95_000_000;

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

// Leemos el multipart en texto porque undici no interpreta los File de jsdom.
function formField(body: string, name: string): string | null {
  return new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`).exec(body)?.[1] ?? null;
}

/** Recoge los campos enviados a la API de subida. */
function captureManualPost() {
  let body = '';
  server.use(
    http.post('/api/manuals', async ({ request }) => {
      body = await request.text();
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
  return (name: string) => formField(body, name);
}

async function process(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole('button', { name: /Procesar/i }))[0]!);
  expect(
    await screen.findByText('ProcessingScreen', undefined, { timeout: 3000 }),
  ).toBeInTheDocument();
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
  // DataTransfer pertenece al navegador y jsdom no implementa el arrastre de archivos.
  function fileTransfer(files: File[] = []) {
    return { types: ['Files'], files, dropEffect: 'none' };
  }

  it('mantiene el destino al cruzar sus controles y lo oculta al cancelar', async () => {
    renderSource();
    await screen.findByRole('combobox', { name: /Buscar juego/i });
    const source = screen.getByTestId('picker-gallery');
    const zone = source.closest('[data-file-drop]')!;
    const dataTransfer = fileTransfer();
    fireEvent.dragEnter(window, { dataTransfer });
    fireEvent.dragEnter(source, { dataTransfer });
    fireEvent.dragLeave(source, { dataTransfer });
    expect(zone).toHaveAttribute('data-file-drop', 'active');
    expect(screen.getByText('Elige primero el juego')).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(zone).toHaveAttribute('data-file-drop', 'idle');
    fireEvent.dragEnter(window, { dataTransfer });
    fireEvent.blur(window);
    expect(zone).toHaveAttribute('data-file-drop', 'idle');
  });

  it('añade las imágenes soltadas junto a las elegidas sin enviar el manual', async () => {
    const user = userEvent.setup();
    renderSource();
    await pickGame(user, 'Wingspan');
    const source = screen.getByTestId('picker-gallery');
    await user.upload(source, imageFile('primera.jpg'));
    fireEvent.drop(source, { dataTransfer: fileTransfer([imageFile('segunda.jpg')]) });
    expect(screen.getByText('primera.jpg')).toBeInTheDocument();
    expect(screen.getByText('segunda.jpg')).toBeInTheDocument();
    expect(screen.getByText('2 / 30 páginas')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Procesar 2 páginas' })[0]).toBeEnabled();
    expect(screen.queryByText('ProcessingScreen')).not.toBeInTheDocument();
  });

  it('acepta un PDF y conserva el primero si se suelta otro', async () => {
    const user = userEvent.setup();
    renderSource();
    await pickGame(user, 'Wingspan');
    const source = screen.getByTestId('picker-pdf');
    fireEvent.drop(source, { dataTransfer: fileTransfer([pdfFile(10)]) });
    expect(screen.getByText('PDF listo para procesar')).toBeInTheDocument();
    fireEvent.drop(source, {
      dataTransfer: fileTransfer([new File(['pdf'], 'otro.pdf', { type: 'application/pdf' })]),
    });
    expect(await screen.findByText('Ya has añadido un PDF')).toBeInTheDocument();
    expect(screen.getByText('manual.pdf')).toBeInTheDocument();
    expect(screen.queryByText('otro.pdf')).not.toBeInTheDocument();
  });

  it('rechaza formatos mezclados y aplica los límites al soltar', async () => {
    const user = userEvent.setup();
    renderSource();
    await pickGame(user, 'Wingspan');
    const source = screen.getByTestId('picker-gallery');
    fireEvent.drop(source, { dataTransfer: fileTransfer([imageFile('foto.jpg'), pdfFile(10)]) });
    expect(await screen.findByText('Elige un solo formato')).toBeInTheDocument();
    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
    fireEvent.drop(source, {
      dataTransfer: fileTransfer([imageFile('grande.jpg', MAX_IMAGE_BYTES + 1)]),
    });
    expect(await screen.findByText('Imagen demasiado grande')).toBeInTheDocument();
    expect(screen.queryByText('grande.jpg')).not.toBeInTheDocument();
  });

  it('no recibe archivos sin juego ni fuera del destino y libera los eventos al salir', async () => {
    const view = renderSource();
    await screen.findByRole('combobox', { name: /Buscar juego/i });
    const dataTransfer = fileTransfer([imageFile('foto.jpg')]);
    fireEvent.drop(screen.getByTestId('picker-gallery'), { dataTransfer });
    expect(screen.queryByText('foto.jpg')).not.toBeInTheDocument();
    expect(fireEvent.drop(window, { dataTransfer })).toBe(false);
    expect(fireEvent.drop(window, { dataTransfer: { types: ['text/plain'], files: [] } })).toBe(
      true,
    );
    view.unmount();
    expect(fireEvent.drop(window, { dataTransfer })).toBe(true);
  });

  it('arranca eligiendo juego y con las fuentes deshabilitadas', async () => {
    renderSource();
    expect(await screen.findByRole('heading', { name: /Nuevo manual/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Elige el juego/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Buscar juego/i })).toBeInTheDocument();
    // Sin juego elegido, no se pueden añadir páginas todavía.
    expect(screen.getByLabelText(/Seleccionar imágenes de la galería/i)).toBeDisabled();
    expect(screen.getByLabelText(/Seleccionar PDF/i)).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: /Compartir el manual con la comunidad/i }),
    ).toBeDisabled();
  });

  it('compartir responde al teclado solo mientras hay un juego elegido', async () => {
    renderSource();
    const user = userEvent.setup();
    const share = await screen.findByRole('switch', {
      name: /Compartir el manual con la comunidad/i,
    });
    share.focus();
    expect(share).not.toHaveFocus();
    await user.click(share);
    expect(share).toHaveAttribute('aria-checked', 'true');

    await pickGame(user, 'Wingspan');
    expect(share).toBeEnabled();
    share.focus();
    await user.keyboard(' ');
    expect(share).toHaveAttribute('aria-checked', 'false');
    await user.upload(screen.getByTestId('picker-gallery'), imageFile('page.jpg'));

    await user.click(screen.getByRole('button', { name: /Cambiar/i }));
    expect(share).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quitar página 1' })).toBeDisabled();
    share.focus();
    expect(share).not.toHaveFocus();
    expect(share).toHaveAttribute('aria-checked', 'false');
  });

  it('el typeahead muestra resultados y la atribución de BoardGameGeek', async () => {
    renderSource();
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: /Buscar juego/i }), 'Catan');
    expect(await screen.findByRole('option', { name: /Catan.*1995/i })).toBeInTheDocument();
    expect(screen.getByText('BoardGameGeek')).toBeInTheDocument();
  });

  it('elegir un juego muestra su ayuda y habilita las fuentes', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    expect(await screen.findByRole('button', { name: /Cambiar/i })).toBeInTheDocument();
    const selected = screen.getByRole('button', { name: 'Juego elegido para este manual' });
    await user.hover(selected);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Juego elegido para este manual');
    expect(screen.getByRole('button', { name: /Cambiar/i })).toBeInTheDocument();
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
    const createBtn = await screen.findByRole('option', {
      name: /Añadir «Mi juego casero» a Manualito/i,
    });
    await user.click(createBtn);
    // El juego creado queda seleccionado y ofrece ayuda sin sustituir Cambiar.
    expect(
      await screen.findByRole('button', { name: 'Juego elegido para este manual' }),
    ).toBeInTheDocument();
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

  it.each([
    [MAX_IMAGE_BYTES - 1, true],
    [MAX_IMAGE_BYTES, true],
    [MAX_IMAGE_BYTES + 1, false],
  ])('BVA tamaño por imagen: %i bytes', async (imageSize, accepted) => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      imageFile('boundary.jpg', imageSize),
    );

    if (accepted) {
      expect(await screen.findByText('boundary.jpg')).toBeInTheDocument();
    } else {
      expect(await screen.findByText(/Imagen demasiado grande/i)).toBeInTheDocument();
      expect(screen.getByText('Cada imagen puede ocupar 30 MB.')).toBeInTheDocument();
      expect(screen.queryByText('boundary.jpg')).not.toBeInTheDocument();
    }
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

  it('retraduce el aviso local ya visible y conserva el límite al cambiar de idioma', async () => {
    renderSource('test-game-001');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Juego elegido para este manual' });
    await user.upload(
      screen.getByTestId('picker-gallery'),
      imageFile('large.jpg', MAX_IMAGE_BYTES + 1),
    );
    const title = await screen.findByText('Imagen demasiado grande');
    const notification = title.closest('[data-sonner-toast]');
    expect(screen.getByText('Cada imagen puede ocupar 30 MB.')).toBeInTheDocument();

    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('That image is too big').closest('[data-sonner-toast]')).toBe(
      notification,
    );
    expect(screen.getByText('Each image can be up to 30 MB.')).toBeInTheDocument();
    expect(screen.queryByText('Imagen demasiado grande')).not.toBeInTheDocument();

    await act(() => i18n.changeLanguage('es'));
    expect(screen.getByText('Imagen demasiado grande').closest('[data-sonner-toast]')).toBe(
      notification,
    );
    expect(screen.getByText('Cada imagen puede ocupar 30 MB.')).toBeInTheDocument();
    expect(screen.queryByText('large.jpg')).not.toBeInTheDocument();
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
      expect(screen.getByText('El total no puede superar 95 MB.')).toBeInTheDocument();
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
      expect(screen.getByText('El PDF puede ocupar 95 MB.')).toBeInTheDocument();
      expect(screen.queryByText('manual.pdf')).not.toBeInTheDocument();
    }
  });

  it('al quitar la última imagen vuelve a permitir cualquier fuente', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    await user.upload(
      screen.getByTestId('picker-gallery') as HTMLInputElement,
      imageFile('page.jpg'),
    );
    expect(await screen.findByText('page.jpg')).toBeInTheDocument();
    expect(screen.getByTestId('picker-pdf')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Quitar página 1' }));

    expect(await screen.findByText(/Puedes añadir un PDF/i)).toBeInTheDocument();
    expect(screen.getByTestId('picker-gallery')).toBeEnabled();
    expect(screen.getByTestId('picker-pdf')).toBeEnabled();
  });

  it('al quitar el PDF vuelve a permitir cualquier fuente', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');

    await user.upload(screen.getByTestId('picker-pdf') as HTMLInputElement, pdfFile(1));
    expect(await screen.findByText('manual.pdf')).toBeInTheDocument();
    expect(screen.getByTestId('picker-gallery')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Quitar PDF' }));

    expect(await screen.findByText(/Puedes añadir un PDF/i)).toBeInTheDocument();
    expect(screen.getByTestId('picker-gallery')).toBeEnabled();
    expect(screen.getByTestId('picker-pdf')).toBeEnabled();
  });

  it('rechaza formatos fuera de JPG, PNG y WebP', async () => {
    renderSource();
    await pickGame(userEvent.setup(), 'Wingspan');
    // Simula una selección que no ha respetado el filtro accept del navegador.
    fireEvent.change(screen.getByTestId('picker-gallery'), {
      target: { files: [new File(['gif'], 'animado.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByText(/Formato no soportado/i)).toBeInTheDocument();
  });

  it('reordenar conserva la fila, su vista previa y el foco del botón', async () => {
    renderSource('test-game-001');
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Juego elegido para este manual' });
    await user.upload(screen.getByTestId('picker-gallery'), imageFiles(3));
    const row = screen.getByText('page-1.jpg').closest('li');
    const image = row?.querySelector('img');
    const down = screen.getByRole('button', { name: /Bajar página 1/i });
    await user.click(down);
    expect(screen.getByText('page-1.jpg').closest('li')).toBe(row);
    expect(row?.querySelector('img')).toBe(image);
    expect(screen.getByRole('button', { name: /Bajar página 2/i })).toBe(down);
    expect(down).toHaveFocus();
  });

  it('las vistas previas liberan todas las URLs bajo StrictMode', async () => {
    // Blob URLs son recursos del navegador, que jsdom no carga como imágenes.
    const liveUrls = new Set<string>();
    let nextUrl = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:preview-${++nextUrl}`;
      liveUrls.add(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => liveUrls.delete(url));
    const { unmount } = renderSource('test-game-001', true);
    await screen.findByRole('button', { name: 'Juego elegido para este manual' });
    await userEvent.setup().upload(screen.getByTestId('picker-gallery'), imageFile('preview.jpg'));
    const image = screen.getByText('preview.jpg').closest('li')?.querySelector('img');
    expect(image).not.toBeNull();
    expect(liveUrls.has(image!.src)).toBe(true);
    unmount();
    expect(liveUrls.size).toBe(0);
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
    expect(
      await screen.findByText('ProcessingScreen', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('preseleccionado desde el hub: arranca con el juego de origen como chip', async () => {
    // Llegamos desde el hub de Catan (test-game-001). El detalle lo sirve MSW.
    renderSource('test-game-001');
    expect(
      await screen.findByRole('button', { name: 'Juego elegido para este manual' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Catan')).toBeInTheDocument();
    // Es un chip, no el buscador. No hay combobox visible.
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
        // undici no parsea multipart con File de jsdom. Leemos el cuerpo en crudo.
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
        // undici no parsea multipart con File de jsdom. Leemos el cuerpo en crudo.
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
    expect(
      await screen.findByText('ProcessingScreen', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(sentVisibility).toBe('shared');
  });

  it('al apagar el interruptor, el manual se procesa como "private"', async () => {
    let sentVisibility: string | null = null;
    server.use(
      http.post('/api/manuals', async ({ request }) => {
        // undici no parsea multipart con File de jsdom. Leemos el cuerpo en crudo.
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
    expect(
      await screen.findByText('ProcessingScreen', undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(sentVisibility).toBe('private');
  });
});

describe('/capture/source, nombre e identificación', () => {
  it('usa el nombre sugerido y el anonimato por defecto', async () => {
    const field = captureManualPost();
    renderSource();
    const user = userEvent.setup();
    expect(screen.queryByRole('textbox', { name: 'Nombre del manual (opcional)' })).toBeNull();
    await pickGame(user, 'Wingspan');
    const name = screen.getByRole('textbox', { name: 'Nombre del manual (opcional)' });
    expect(name).toHaveValue('');
    expect(name).toHaveAttribute('placeholder', 'Manual de Wingspan');
    expect(name).toHaveAccessibleDescription('Puedes dejar el nombre sugerido o escribir otro.');
    await user.type(name, '   ');
    await user.upload(screen.getByTestId('picker-gallery'), imageFile('foto.jpg'));
    await process(user);
    expect(field('title')).toBe('Manual de Wingspan');
    expect(field('visibility')).toBe('shared');
    expect(field('anonymous')).toBe('true');
  });

  it('conserva el nombre escrito al añadir o quitar archivos', async () => {
    const field = captureManualPost();
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    const name = screen.getByRole('textbox', { name: 'Nombre del manual (opcional)' });
    await user.type(name, 'Mis reglas caseras');
    await user.upload(screen.getByTestId('picker-gallery'), imageFiles(2));
    await user.click(await screen.findByRole('button', { name: 'Quitar página 1' }));
    await user.click(screen.getByRole('button', { name: 'Quitar página 1' }));
    expect(await screen.findByText(/Puedes añadir un PDF/i)).toBeInTheDocument();
    expect(name).toHaveValue('Mis reglas caseras');
    await user.upload(screen.getByTestId('picker-pdf'), pdfFile(1));
    expect(await screen.findByText('manual.pdf')).toBeInTheDocument();
    expect(name).toHaveValue('Mis reglas caseras');
    await process(user);
    expect(field('title')).toBe('Mis reglas caseras');
    expect(field('anonymous')).toBe('true');
  });

  it('permite identificarse desde las opciones de compartir', async () => {
    const field = captureManualPost();
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    expect(screen.queryByRole('switch', { name: 'Compartir con mi nombre' })).toBeNull();
    const options = screen.getByRole('button', { name: /Opciones de compartir/ });
    expect(options).toHaveAttribute('aria-expanded', 'false');
    expect(options).toHaveTextContent('Anónimo');
    expect(options).not.toHaveTextContent('Como Anónimo');
    const panel = document.getElementById(options.getAttribute('aria-controls')!)!;
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(panel).toHaveAttribute('inert');
    await user.click(options);
    expect(options).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('aria-hidden', 'true');
    expect(panel).not.toHaveAttribute('inert');
    const showName = screen.getByRole('switch', { name: 'Compartir con mi nombre' });
    expect(showName).toHaveAttribute('aria-checked', 'false');
    expect(showName).toHaveAccessibleDescription('Otros verán que tú has subido este manual.');
    await user.click(showName);
    expect(showName).toHaveAttribute('aria-checked', 'true');
    expect(options).toHaveTextContent('Con mi nombre');
    await user.click(options);
    expect(screen.queryByRole('switch', { name: 'Compartir con mi nombre' })).toBeNull();
    expect(options).toHaveTextContent('Con mi nombre');
    await user.upload(screen.getByTestId('picker-gallery'), imageFile('foto.jpg'));
    await process(user);
    expect(field('visibility')).toBe('shared');
    expect(field('anonymous')).toBe('false');
  });

  it('permite envolver el resumen de las opciones en pantallas estrechas', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    const options = screen.getByRole('button', { name: /Opciones de compartir/ });
    const title = within(options).getByText('Opciones de compartir');
    expect(title.className).not.toMatch(/truncate|nowrap/);
    expect(title.parentElement).toHaveClass('flex-wrap');
    expect(options).not.toHaveClass('h-11');
  });

  it('envía los manuales privados como anónimos', async () => {
    const field = captureManualPost();
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    await user.click(screen.getByRole('button', { name: /Opciones de compartir/ }));
    await user.click(screen.getByRole('switch', { name: 'Compartir con mi nombre' }));
    await user.click(screen.getByRole('switch', { name: /Compartir el manual con la comunidad/i }));
    expect(screen.queryByRole('button', { name: /Opciones de compartir/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Compartir con mi nombre' })).toBeNull();
    await user.upload(screen.getByTestId('picker-gallery'), imageFile('foto.jpg'));
    await process(user);
    expect(field('visibility')).toBe('private');
    expect(field('anonymous')).toBe('true');
  });

  it('mantiene el tamaño del buscador en el campo de nombre', async () => {
    renderSource();
    const user = userEvent.setup();
    await pickGame(user, 'Wingspan');
    const name = screen.getByRole('textbox', { name: 'Nombre del manual (opcional)' });
    expect(name).toHaveClass('h-12', 'rounded-2xl');
    expect(name).not.toHaveAttribute('role');
  });
});
