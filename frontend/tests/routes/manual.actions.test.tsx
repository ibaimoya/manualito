import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ManualRoute } from '@/routes/_app.manual.$manualId';
import {
  conversationMessagesKey,
  conversationMessagesQueryOptions,
} from '@/features/conversations/use-conversations';
import { manualDetailQueryOptions } from '@/features/manual/use-manuals';
import type { ManualDetailResponse } from '@/shared/api/client';
import type { ConversationMessage } from '@/shared/api/conversations';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { SAMPLE_MANUAL_SUMMARY } from '@tests/_helpers/mswHandlers';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const MANUAL_ID = 'test-manual-001';
const SHARED_ANONYMOUS = 'Compartido como Anónimo. Cambiar para compartir con mi nombre';
const SHARED_NAMED = 'Compartido con mi nombre. Cambiar para volver a aparecer como Anónimo';

function mountManual() {
  return renderRoute({
    path: '/manual/$manualId',
    initialEntry: `/manual/${MANUAL_ID}`,
    component: routeComponent(ManualRoute),
    stubs: { '/history': 'Historial stub', '/home': 'Home stub', '/game/$gameId': 'Juego stub' },
  });
}

type DetailsPatch = { title?: string; anonymous?: boolean };

const PAGES = [
  {
    page_number: 1,
    ocr_status: 'completed',
    text_source: 'ocr',
    text_quality: 'ok',
    dedup_status: 'none',
    image_available: true,
    image_width: 800,
    image_height: 1200,
    ocr_confidence_mean: 0.94,
    ocr_lines: [{ text: 'PREPARACIÓN', confidence: 0.97 }],
  },
];

// La frontera HTTP permite retrasar o rechazar el guardado antes de actualizar el estado.
function detailsServer(
  overrides: Partial<ManualDetailResponse> = {},
  respond: (body: DetailsPatch) => Promise<Response | null> = async () => null,
) {
  const requests: DetailsPatch[] = [];
  let current = { ...SAMPLE_MANUAL_SUMMARY, ...overrides };
  let reads = 0;
  server.use(
    http.get('/api/manuals/:manualId', () => {
      reads += 1;
      return HttpResponse.json({ ...current, pages: PAGES });
    }),
    http.patch('/api/manuals/:manualId', async ({ request }) => {
      const body = (await request.json()) as DetailsPatch;
      requests.push(body);
      const forced = await respond(body);
      if (forced) return forced;
      current = { ...current, ...body };
      return HttpResponse.json(current);
    }),
  );
  return { requests, reads: () => reads, current: () => current };
}

/** Deja cada PATCH en espera hasta que la prueba lo libere. */
function gatedServer(overrides: Partial<ManualDetailResponse> = {}) {
  const gates = new Map<string, PromiseWithResolvers<void>>();
  const key = (body: DetailsPatch) => JSON.stringify(body);
  const stateful = detailsServer(overrides, async (body) => {
    const gate = Promise.withResolvers<void>();
    gates.set(key(body), gate);
    await gate.promise;
    return null;
  });
  return {
    ...stateful,
    received: (body: DetailsPatch) => gates.has(key(body)),
    release: (body: DetailsPatch) => gates.get(key(body))?.resolve(),
    releaseAll: () => {
      for (const gate of gates.values()) gate.resolve();
    },
  };
}

async function openRename(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole('button', { name: 'Renombrar manual' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Renombrar manual' });
  const input = within(dialog).getByRole('textbox', { name: 'Nombre del manual' });
  return { trigger, dialog, input };
}

async function openSharing(user: ReturnType<typeof userEvent.setup>, state: string) {
  const trigger = await screen.findByRole('button', { name: state });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  return { trigger, dialog };
}

async function expectNoDialog() {
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function headings(name: string) {
  return screen.getAllByRole('heading', { name }).length;
}

// La cabecera puede estar detrás de un modal y fuera del árbol accesible.
async function expectHeading(name: string) {
  const found = await screen.findAllByRole('heading', { name, hidden: true });
  expect(found.length).toBeGreaterThan(0);
}

// jsdom no ejecuta CSS. Este doble mantiene la salida de Radix hasta recibir animationend.
function keepDialogWhileClosing() {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const styles = original(element, pseudo ?? undefined);
    if (!(element instanceof HTMLElement) || !element.hasAttribute('data-mn-dialog')) {
      return styles;
    }
    return new Proxy(styles, {
      get(target, key) {
        if (key === 'animationName') {
          return element.dataset.state === 'closed' ? 'mn-zoom-out' : 'mn-zoom-in';
        }
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  return (dialog: HTMLElement) => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'mn-zoom-out' });
    act(() => {
      dialog.dispatchEvent(event);
    });
  };
}

function cachedMessage(): ConversationMessage {
  return {
    id: 'b1',
    role: 'assistant',
    status: 'completed',
    content: 'La madera la dan los bosques.',
    created_at: '2026-05-26T10:06:05.000Z',
    sources: [
      { manual_id: MANUAL_ID, manual_title: 'Catan', page: 2, is_own: true, author_name: 'marta' },
      { manual_id: 'm-otro', manual_title: 'Otro', page: 3, is_own: false, author_name: 'ana' },
    ],
  };
}

describe('/manual/$manualId, cambio de nombre', () => {
  it('guarda con Enter y devuelve el foco al acceso directo', async () => {
    const { requests } = detailsServer();
    mountManual();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'Opciones del manual' })).toBeNull();
    const { trigger, dialog, input } = await openRename(user);
    expect(dialog).toHaveAccessibleDescription(
      'El cambio también se verá en las fuentes de tus conversaciones.',
    );
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Catan');
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe('Catan'.length);
    expect(input).toHaveClass('h-12', 'rounded-2xl');
    expect(within(dialog).queryByRole('switch')).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();

    await user.clear(input);
    await user.type(input, '  Reglas base  {Enter}');
    await expectNoDialog();
    expect(requests).toEqual([{ title: 'Reglas base' }]);
    expect(trigger).toHaveFocus();
    expect(await screen.findByText('Nombre guardado')).toBeInTheDocument();
    expect(headings('Reglas base')).toBeGreaterThan(0);
  });

  it('rechaza nombres vacíos o demasiado largos antes de enviarlos', async () => {
    const { requests } = detailsServer();
    mountManual();
    const user = userEvent.setup();
    const { dialog, input } = await openRename(user);
    await user.clear(input);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar nombre' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Escribe un nombre para el manual.',
    );
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();

    await user.paste('a'.repeat(256));
    expect(within(dialog).queryByRole('alert')).toBeNull();
    await user.keyboard('{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Usa un máximo de 255 caracteres.',
    );
    expect(requests).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'Renombrar manual' })).toBe(dialog);
  });

  it('descarta el borrador al cerrar con Escape, Cancelar o la X', async () => {
    const { requests } = detailsServer();
    mountManual();
    const user = userEvent.setup();
    const first = await openRename(user);
    await user.type(first.input, ' borrador');
    await user.keyboard('{Escape}');
    await expectNoDialog();
    expect(first.trigger).toHaveFocus();

    const second = await openRename(user);
    expect(second.input).toHaveValue('Catan');
    expect(second.input).toHaveFocus();
    await user.type(second.input, ' otro');
    await user.click(within(second.dialog).getByRole('button', { name: 'Cancelar' }));
    await expectNoDialog();
    expect(second.trigger).toHaveFocus();

    const third = await openRename(user);
    expect(third.input).toHaveValue('Catan');
    await user.click(within(third.dialog).getByRole('button', { name: 'Cerrar' }));
    await expectNoDialog();
    expect(requests).toEqual([]);
    expect(headings('Catan')).toBeGreaterThan(0);
  });

  it('conserva el borrador y permite reintentar si falla el guardado', async () => {
    let fail = true;
    const { requests } = detailsServer({}, async () =>
      fail ? HttpResponse.json({ detail: 'boom' }, { status: 500 }) : null,
    );
    mountManual();
    const user = userEvent.setup();
    const { dialog, input } = await openRename(user);
    await user.clear(input);
    await user.type(input, 'Reglas base{Enter}');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No hemos podido guardar los cambios. Inténtalo de nuevo.',
    );
    expect(input).toHaveValue('Reglas base');
    expect(input).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Guardar nombre' })).toBeEnabled();

    fail = false;
    await user.click(within(dialog).getByRole('button', { name: 'Guardar nombre' }));
    await expectNoDialog();
    expect(requests).toEqual([{ title: 'Reglas base' }, { title: 'Reglas base' }]);
  });

  it('evita envíos repetidos y permite cerrar durante el guardado', async () => {
    const backend = gatedServer();
    mountManual();
    const user = userEvent.setup();
    try {
      const { dialog, input, trigger } = await openRename(user);
      await user.clear(input);
      await user.type(input, 'Primero');
      const save = within(dialog).getByRole('button', { name: 'Guardar nombre' });
      await user.click(save);
      await user.click(save);
      await user.keyboard('{Enter}');
      await waitFor(() => expect(backend.requests).toHaveLength(1));
      expect(save).toBeDisabled();
      expect(input).toBeDisabled();
      const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
      expect(cancel).toBeEnabled();
      await user.click(cancel);
      await expectNoDialog();
      expect(trigger).toHaveFocus();
      backend.release({ title: 'Primero' });
      expect(await screen.findByText('Nombre guardado')).toBeInTheDocument();
      expect(headings('Primero')).toBeGreaterThan(0);
    } finally {
      backend.releaseAll();
    }
  });

  it('una respuesta anterior no cierra el diálogo reabierto durante la salida', async () => {
    const finishClose = keepDialogWhileClosing();
    const backend = gatedServer();
    mountManual();
    const user = userEvent.setup();
    try {
      const first = await openRename(user);
      await user.clear(first.input);
      await user.type(first.input, 'Primero{Enter}');
      await waitFor(() => expect(backend.received({ title: 'Primero' })).toBe(true));
      await user.click(within(first.dialog).getByRole('button', { name: 'Cancelar' }));
      expect(first.dialog).toBeInTheDocument();
      expect(first.dialog).toHaveAttribute('data-state', 'closed');

      // Volvemos al botón antes de que termine la salida para comprobar la reapertura.
      act(() => first.trigger.focus());
      await user.keyboard('{Enter}');
      const second = await screen.findByRole('dialog', { name: 'Renombrar manual' });
      expect(second).not.toBe(first.dialog);
      expect(first.dialog).not.toBeInTheDocument();
      const input = within(second).getByRole('textbox', { name: 'Nombre del manual' });
      expect(input).toHaveValue('Catan');
      expect(input).toBeEnabled();
      expect(input).toHaveFocus();
      await user.clear(input);
      await user.type(input, 'Segundo');

      backend.release({ title: 'Primero' });
      expect(await screen.findByText('Nombre guardado')).toBeInTheDocument();
      expect(second).toHaveAttribute('data-state', 'open');
      expect(input).toHaveValue('Segundo');
      await expectHeading('Primero');

      await user.keyboard('{Enter}');
      await waitFor(() => expect(backend.received({ title: 'Segundo' })).toBe(true));
      backend.release({ title: 'Segundo' });
      await waitFor(() => expect(second).toHaveAttribute('data-state', 'closed'));
      finishClose(second);
      await expectNoDialog();
      expect(first.trigger).toHaveFocus();
      expect(backend.requests).toEqual([{ title: 'Primero' }, { title: 'Segundo' }]);
      expect(headings('Segundo')).toBeGreaterThan(0);
    } finally {
      backend.releaseAll();
    }
  });

  it('guarda los nombres en orden y conserva el último', async () => {
    const backend = gatedServer();
    const { qc } = mountManual();
    const user = userEvent.setup();
    try {
      const first = await openRename(user);
      await user.clear(first.input);
      await user.type(first.input, 'Primero{Enter}');
      await waitFor(() => expect(backend.received({ title: 'Primero' })).toBe(true));
      await user.click(within(first.dialog).getByRole('button', { name: 'Cancelar' }));
      await expectNoDialog();

      const second = await openRename(user);
      expect(second.input).toHaveValue('Catan');
      await user.clear(second.input);
      await user.type(second.input, 'Segundo{Enter}');
      await waitFor(() =>
        expect(
          within(second.dialog).getByRole('button', { name: 'Guardar nombre' }),
        ).toBeDisabled(),
      );
      expect(second.input).toBeDisabled();
      expect(within(second.dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
      expect(backend.requests).toEqual([{ title: 'Primero' }]);
      expect(backend.received({ title: 'Segundo' })).toBe(false);
      expect(qc.isMutating()).toBe(2);

      backend.release({ title: 'Primero' });
      await waitFor(() => expect(backend.received({ title: 'Segundo' })).toBe(true));
      await expectHeading('Primero');
      expect(screen.getByRole('dialog', { name: 'Renombrar manual' })).toBe(second.dialog);
      expect(backend.requests).toEqual([{ title: 'Primero' }, { title: 'Segundo' }]);

      const readsBefore = backend.reads();
      backend.release({ title: 'Segundo' });
      await expectNoDialog();
      await expectHeading('Segundo');
      await waitFor(() => expect(backend.reads()).toBeGreaterThan(readsBefore));
      await waitFor(() => expect(qc.isFetching()).toBe(0));
      expect(backend.current().title).toBe('Segundo');
      expect(qc.getQueryData(manualDetailQueryOptions(MANUAL_ID).queryKey)?.title).toBe('Segundo');
      expect(screen.queryByRole('heading', { name: 'Primero' })).toBeNull();
    } finally {
      backend.releaseAll();
    }
  });
});

describe('/manual/$manualId, identificación de la subida', () => {
  it('omite las opciones de identificación en manuales privados', async () => {
    detailsServer();
    mountManual();
    await screen.findByRole('button', { name: 'Renombrar manual' });
    expect(screen.queryByRole('button', { name: /Compartido/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Opciones del manual' })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('exige confirmar el cambio desde el estado visible', async () => {
    const { requests } = detailsServer({ visibility: 'shared', anonymous: true });
    mountManual();
    const user = userEvent.setup();
    const first = await openSharing(user, SHARED_ANONYMOUS);
    expect(first.trigger).toHaveTextContent('Compartido como Anónimo');
    expect(first.dialog).toHaveAccessibleName('¿Compartir con tu nombre?');
    expect(first.dialog).toHaveAccessibleDescription(
      'Otros verán tu nombre junto a este manual y en las fuentes de las respuestas.',
    );
    expect(within(first.dialog).queryByRole('textbox')).toBeNull();
    expect(within(first.dialog).queryByRole('switch')).toBeNull();
    expect(within(first.dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await expectNoDialog();
    expect(first.trigger).toHaveFocus();
    expect(requests).toEqual([]);

    const second = await openSharing(user, SHARED_ANONYMOUS);
    await user.click(within(second.dialog).getByRole('button', { name: 'Cancelar' }));
    await expectNoDialog();
    expect(requests).toEqual([]);

    const third = await openSharing(user, SHARED_ANONYMOUS);
    await user.click(within(third.dialog).getByRole('button', { name: 'Compartir con mi nombre' }));
    await expectNoDialog();
    expect(requests).toEqual([{ anonymous: false }]);
    // Toast y estado de la cabecera comparten el texto.
    await waitFor(() => expect(screen.getAllByText('Compartido con mi nombre')).toHaveLength(2));
    const named = await screen.findByRole('button', { name: SHARED_NAMED });
    expect(named).toHaveTextContent('Compartido con mi nombre');
    expect(named).toHaveFocus();
  });

  it('retira el nombre de las fuentes al confirmar el anonimato', async () => {
    const { requests } = detailsServer({ visibility: 'shared', anonymous: false });
    const { qc } = mountManual();
    qc.setQueryData(conversationMessagesKey('c-1'), [cachedMessage()]);
    const user = userEvent.setup();
    const { dialog } = await openSharing(user, SHARED_NAMED);
    expect(dialog).toHaveAccessibleName('¿Volver a aparecer como Anónimo?');
    expect(dialog).toHaveAccessibleDescription(
      'Tu nombre dejará de aparecer junto a este manual y en las fuentes de las respuestas.',
    );
    expect(requests).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Usar Anónimo' }));
    await expectNoDialog();
    expect(requests).toEqual([{ anonymous: true }]);
    // Toast y estado de la cabecera comparten el texto.
    await waitFor(() => expect(screen.getAllByText('Compartido como Anónimo')).toHaveLength(2));
    expect(screen.getByRole('button', { name: SHARED_ANONYMOUS })).toBeInTheDocument();

    const cached = qc.getQueryData<ConversationMessage[]>(conversationMessagesKey('c-1'));
    expect(cached?.[0]?.sources.map((source) => source.author_name)).toEqual([null, 'ana']);
    expect(cached?.[0]?.sources[0]?.manual_title).toBe('Catan');
  });

  it('una lectura pendiente no recupera un nombre que se acaba de ocultar', async () => {
    const { requests } = detailsServer({ visibility: 'shared', anonymous: false });
    const messagesGate = Promise.withResolvers<void>();
    let messageReads = 0;
    server.use(
      http.get('/api/conversations/:conversationId/messages', async () => {
        messageReads += 1;
        if (messageReads === 1) await messagesGate.promise;
        const message = cachedMessage();
        if (messageReads > 1) message.sources[0]!.author_name = null;
        return HttpResponse.json({ messages: [message] });
      }),
    );
    const { qc } = mountManual();
    const user = userEvent.setup();
    try {
      const inFlight = qc
        .fetchQuery(conversationMessagesQueryOptions('c-1'))
        .then(() => 'resolved' as const)
        .catch(() => 'cancelled' as const);
      await waitFor(() => expect(messageReads).toBe(1));

      const { dialog } = await openSharing(user, SHARED_NAMED);
      await user.click(within(dialog).getByRole('button', { name: 'Usar Anónimo' }));
      await expectNoDialog();
      expect(requests).toEqual([{ anonymous: true }]);
      expect(await inFlight).toBe('cancelled');

      messagesGate.resolve();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const cached = qc.getQueryData<ConversationMessage[]>(conversationMessagesKey('c-1'));
      expect(cached?.[0]?.sources[0]?.author_name ?? null).toBeNull();
    } finally {
      messagesGate.resolve();
    }
  });

  it('conserva el nombre y el anonimato cuando se guardan seguidos', async () => {
    const backend = gatedServer({ visibility: 'shared', anonymous: false });
    const { qc } = mountManual();
    qc.setQueryData(conversationMessagesKey('c-1'), [cachedMessage()]);
    const user = userEvent.setup();
    try {
      const rename = await openRename(user);
      await user.clear(rename.input);
      await user.type(rename.input, 'Reglas base{Enter}');
      await waitFor(() => expect(backend.received({ title: 'Reglas base' })).toBe(true));
      await user.keyboard('{Escape}');
      await expectNoDialog();

      const sharing = await openSharing(user, SHARED_NAMED);
      const confirm = within(sharing.dialog).getByRole('button', { name: 'Usar Anónimo' });
      await user.click(confirm);
      await waitFor(() => expect(confirm).toBeDisabled());
      expect(backend.requests).toEqual([{ title: 'Reglas base' }]);
      expect(within(sharing.dialog).getByRole('button', { name: 'Cancelar' })).toBeEnabled();

      backend.release({ title: 'Reglas base' });
      await waitFor(() => expect(backend.received({ anonymous: true })).toBe(true));
      await expectHeading('Reglas base');
      backend.release({ anonymous: true });
      await expectNoDialog();
      await waitFor(() => expect(screen.getAllByText('Compartido como Anónimo')).toHaveLength(2));
      await waitFor(() => expect(qc.isFetching()).toBe(0));

      expect(backend.requests).toEqual([{ title: 'Reglas base' }, { anonymous: true }]);
      expect(backend.current()).toMatchObject({ title: 'Reglas base', anonymous: true });
      expect(qc.getQueryData(manualDetailQueryOptions(MANUAL_ID).queryKey)).toMatchObject({
        title: 'Reglas base',
        anonymous: true,
      });
      const cached = qc.getQueryData<ConversationMessage[]>(conversationMessagesKey('c-1'));
      expect(cached?.[0]?.sources[0]).toMatchObject({
        manual_title: 'Reglas base',
        author_name: null,
      });
      expect(cached?.[0]?.sources[1]?.author_name).toBe('ana');
    } finally {
      backend.releaseAll();
    }
  });

  it('permite reintentar la confirmación tras un error', async () => {
    let fail = true;
    const { requests } = detailsServer({ visibility: 'shared', anonymous: false }, async () =>
      fail ? HttpResponse.json({ detail: 'boom' }, { status: 500 }) : null,
    );
    mountManual();
    const user = userEvent.setup();
    const { dialog } = await openSharing(user, SHARED_NAMED);
    const confirm = within(dialog).getByRole('button', { name: 'Usar Anónimo' });
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'No hemos podido guardar los cambios. Inténtalo de nuevo.',
    );
    expect(confirm).toBeEnabled();
    fail = false;
    await user.click(confirm);
    await expectNoDialog();
    expect(requests).toEqual([{ anonymous: true }, { anonymous: true }]);
  });

  it('cambiar el nombre mantiene el anonimato del manual', async () => {
    const { requests } = detailsServer({ visibility: 'shared', anonymous: false });
    mountManual();
    const user = userEvent.setup();
    const { dialog, input } = await openRename(user);
    expect(within(dialog).queryByRole('switch')).toBeNull();
    await user.clear(input);
    await user.type(input, 'Reglas base{Enter}');
    await expectNoDialog();
    expect(requests).toEqual([{ title: 'Reglas base' }]);
    expect(screen.getByRole('button', { name: SHARED_NAMED })).toBeInTheDocument();
  });

  it('supera la revisión de axe en la cabecera y los diálogos', async () => {
    detailsServer({ visibility: 'shared', anonymous: true });
    mountManual();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: SHARED_ANONYMOUS });
    // Los portales del diálogo quedan fuera de main. Se comprueban las demás reglas de axe.
    const options = { rules: { region: { enabled: false } } };
    expect(await axe(document.body, options)).toHaveNoViolations();
    await openRename(user);
    expect(await axe(document.body, options)).toHaveNoViolations();
    await user.keyboard('{Escape}');
    await expectNoDialog();
    await openSharing(user, SHARED_ANONYMOUS);
    expect(await axe(document.body, options)).toHaveNoViolations();
  });
});
