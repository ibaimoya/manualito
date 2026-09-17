import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ProfileRoute } from '@/routes/_app.profile';
import { accountStatsQueryOptions } from '@/features/profile/use-account';
import { renderRoute, routeComponent, TEST_USER } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';
import i18n from '@/app/i18n';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(async () => {
  if (vi.isFakeTimers()) {
    await act(() => vi.runOnlyPendingTimersAsync());
    vi.useRealTimers();
  }
  vi.restoreAllMocks();
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderProfile(user = TEST_USER) {
  return renderRoute({
    path: '/profile',
    initialEntry: '/profile',
    component: routeComponent(ProfileRoute),
    stubs: { '/security': 'Seguridad stub', '/home': 'Home stub' },
    user,
  });
}

function observeVisibility() {
  // jsdom no calcula intersecciones. Solo simulamos esta frontera del navegador.
  const OriginalObserver = window.IntersectionObserver;
  const observers = new Map<Element, () => void>();
  vi.spyOn(window, 'IntersectionObserver').mockImplementation(function (callback) {
    const observer = new OriginalObserver(callback);
    vi.spyOn(observer, 'observe').mockImplementation((target) => {
      observers.set(target, () => {
        const bounds = target.getBoundingClientRect();
        callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              boundingClientRect: bounds,
              intersectionRect: bounds,
              rootBounds: null,
              time: performance.now(),
            },
          ],
          observer,
        );
      });
    });
    return observer;
  });
  return (target: Element) => {
    expect(observers.has(target)).toBe(true);
    act(() => observers.get(target)?.());
  };
}

function counterValue(counter: Element) {
  const root = counter.querySelector('number-flow-react')?.shadowRoot;
  expect(root).toBeInstanceOf(ShadowRoot);
  return Array.from(
    root!.querySelectorAll('.digit__num:not([inert])'),
    (digit) => digit.textContent,
  ).join('');
}

describe('/profile · identidad', () => {
  it('muestra nombre, @usuario, email y antigüedad', async () => {
    renderProfile();
    expect(await screen.findByRole('heading', { level: 1, name: 'marta' })).toBeInTheDocument();
    expect(screen.getByText('@marta')).toBeInTheDocument();
    expect(screen.getByText('marta@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Miembro desde mayo de 2026/)).toBeInTheDocument();
  });

  it('email verificado muestra el tick junto al nombre, sin píldora ni reenvío', async () => {
    renderProfile();
    expect(await screen.findByLabelText('Email verificado')).toBeInTheDocument();
    expect(screen.queryByText('Sin verificar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar correo' })).not.toBeInTheDocument();
  });

  it('email sin verificar: «Sin verificar» + reenviar con cooldown', async () => {
    renderProfile({ ...TEST_USER, email_verified_at: null });
    expect(await screen.findByText('Sin verificar')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));
    expect(await screen.findByText(/Reenviado · \d+s/)).toBeInTheDocument();
  });

  it('enlaza a seguridad y abre el editor de perfil', async () => {
    renderProfile();
    expect(await screen.findByRole('link', { name: 'Cuenta' })).toHaveAttribute(
      'href',
      '/security',
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Editar perfil/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar perfil' });
    expect(within(dialog).getByRole('group', { name: 'Color del avatar' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Figura del avatar' })).toBeInTheDocument();
  });

  it.each(['es', 'en'] as const)(
    'pide la nueva verificación en %s al cambiar el email',
    async (locale) => {
      let body: Record<string, unknown> | undefined;
      server.use(
        http.patch('/api/me', async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            user: { ...TEST_USER, email: 'new@example.com', email_verified_at: null },
            csrf_token: 'csrf-test-token',
          });
        }),
      );
      const user = userEvent.setup();
      renderProfile();
      await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
      const dialog = await screen.findByRole('dialog');
      await act(() => i18n.changeLanguage(locale));
      const save = within(dialog).getByRole('button', {
        name: locale === 'en' ? 'Save changes' : 'Guardar cambios',
      });
      expect(save).toBeDisabled();
      const email = within(dialog).getByLabelText('Email');
      await user.clear(email);
      await user.type(email, 'new@example.com');
      await user.click(save);
      await waitFor(() => expect(body).toEqual({ email: 'new@example.com', locale }));
    },
  );

  it('conserva una sola figura y color al cambiar rápidamente y guarda la última elección', async () => {
    const requests: unknown[] = [];
    server.use(
      http.patch('/api/me', async ({ request }) => {
        requests.push(await request.json());
        return HttpResponse.json({
          user: { ...TEST_USER, avatar_figure: 'dice', avatar_color: 'primary' },
          csrf_token: 'csrf-test-token',
        });
      }),
    );
    const user = userEvent.setup();
    renderProfile();
    await user.click(await screen.findByRole('button', { name: 'Editar perfil' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar perfil' });
    const figures = within(within(dialog).getByRole('group', { name: 'Figura del avatar' }));
    const colors = within(within(dialog).getByRole('group', { name: 'Color del avatar' }));

    for (const [figureName, colorName] of [
      ['Dado', 'Ámbar'],
      ['Corona', 'Verde'],
      ['Dado', 'Ámbar'],
    ]) {
      const figure = figures.getByRole('button', { name: figureName });
      const color = colors.getByRole('button', { name: colorName });
      await user.click(figure);
      await user.click(color);
      expect(figures.getAllByRole('button', { pressed: true })).toEqual([figure]);
      expect(colors.getAllByRole('button', { pressed: true })).toEqual([color]);
    }

    expect(requests).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Editar perfil' })).not.toBeInTheDocument();
    });
    expect(requests).toEqual([{ avatar_figure: 'dice', avatar_color: 'primary', locale: 'es' }]);
  });
});

describe('/profile · actividad', () => {
  it('espera a los datos y a estar visible, manteniendo el total accesible durante el conteo', async () => {
    const enterView = observeVisibility();
    const response = Promise.withResolvers<Response>();
    server.use(http.get('/api/me/stats', () => response.promise));
    renderProfile();
    const section = await screen.findByRole('region', { name: 'Tu actividad' });
    expect(section.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(within(section).queryByText('1000')).not.toBeInTheDocument();
    const pendingCounter = section.querySelector('number-flow-react')!.parentElement!;
    const placeholder = pendingCounter.nextElementSibling!;
    expect(pendingCounter).toHaveClass('opacity-0');
    expect(placeholder).toHaveClass('opacity-100');

    response.resolve(
      HttpResponse.json({ games_count: 1000, conversations_count: 7, manuals_count: 3 }),
    );
    const total = await within(section).findByText('1000', { selector: '.sr-only' });
    const counter = total.nextElementSibling!;
    expect(counter).toBe(pendingCounter);
    expect(counter).toHaveAttribute('aria-hidden', 'true');
    expect(counterValue(counter)).toBe('0');

    // Controlamos solo la espera; NumberFlow y su DOM son reales.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    enterView(counter);
    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(counterValue(counter)).toBe('0');
    expect(counter).toHaveClass('opacity-0');
    expect(placeholder).toHaveClass('opacity-100');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(counterValue(counter)).toBe('1000');
    expect(counter).toHaveClass('opacity-100');
    expect(placeholder).toHaveClass('opacity-0');
    expect(total).toHaveTextContent('1000');
  });

  it('muestra el total al reducir movimiento durante la espera y no repite el cero al reactivarlo', async () => {
    const enterView = observeVisibility();
    // jsdom no implementa las preferencias del sistema, Motion y el contador son reales.
    const original = window.matchMedia;
    const media = Object.assign(new EventTarget(), {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === media.media ? (media as unknown as MediaQueryList) : original(query),
    );
    server.use(
      http.get('/api/me/stats', () =>
        HttpResponse.json({ games_count: 1000, conversations_count: 7, manuals_count: 3 }),
      ),
    );
    renderProfile();
    const finalValue = await screen.findByText('1000', { selector: '.sr-only' });
    const counter = finalValue.nextElementSibling!;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    enterView(counter);
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(counterValue(counter)).toBe('0');
    expect(counter).toHaveClass('opacity-0');
    act(() => {
      media.matches = true;
      media.dispatchEvent(new Event('change'));
    });
    expect(counterValue(counter)).toBe('1000');
    expect(counter).toHaveClass('opacity-100');
    act(() => {
      media.matches = false;
      media.dispatchEvent(new Event('change'));
    });
    expect(counterValue(counter)).toBe('1000');
    expect(counter).toHaveClass('opacity-100');
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(counterValue(counter)).toBe('1000');
  });

  it('actualiza los datos en caché sin reiniciar desde cero el contador visible', async () => {
    const enterView = observeVisibility();
    const { qc } = renderProfile();
    act(() => {
      qc.setQueryData(accountStatsQueryOptions().queryKey, {
        games_count: 1000,
        conversations_count: 7,
        manuals_count: 3,
      });
    });
    const total = await screen.findByText('1000', { selector: '.sr-only' });
    const counter = total.nextElementSibling!;
    enterView(counter);
    await waitFor(() => expect(counterValue(counter)).toBe('1000'));
    act(() => {
      qc.setQueryData(accountStatsQueryOptions().queryKey, {
        games_count: 2000,
        conversations_count: 7,
        manuals_count: 3,
      });
    });
    expect(await screen.findByText('2000', { selector: '.sr-only' })).toBe(total);
    expect(counterValue(counter)).toBe('2000');
  });

  it('usa el destino actualizado sin reiniciar la espera del contador', async () => {
    const enterView = observeVisibility();
    const { qc } = renderProfile();
    const total = await screen.findByText('4', { selector: '.sr-only' });
    const counter = total.nextElementSibling!;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    enterView(counter);
    await act(() => vi.advanceTimersByTimeAsync(200));
    act(() => {
      qc.setQueryData(accountStatsQueryOptions().queryKey, {
        games_count: 11,
        conversations_count: 7,
        manuals_count: 3,
      });
    });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(total).toHaveTextContent('11');
    expect(counterValue(counter)).toBe('0');
    expect(counter).toHaveClass('opacity-0');
    await act(() => vi.advanceTimersByTimeAsync(149));
    expect(counterValue(counter)).toBe('0');
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(counterValue(counter)).toBe('11');
    expect(counter).toHaveClass('opacity-100');
  });

  it('pinta los tres contadores de actividad', async () => {
    renderProfile();
    const section = await screen.findByRole('region', { name: 'Tu actividad' });
    expect(await within(section).findByText('4')).toBeInTheDocument();
    expect(within(section).getByText('Juegos')).toBeInTheDocument();
    expect(within(section).getByText('7')).toBeInTheDocument();
    expect(within(section).getByText('Conversaciones')).toBeInTheDocument();
    expect(within(section).getByText('3')).toBeInTheDocument();
    expect(within(section).getByText('Manuales')).toBeInTheDocument();
  });

  it('si las stats fallan, la pantalla sigue mostrando la identidad', async () => {
    server.use(
      http.get('/api/me/stats', () => HttpResponse.json({ detail: 'error' }, { status: 500 })),
    );
    const { qc } = renderProfile();
    await waitFor(() => {
      expect(qc.getQueryState(accountStatsQueryOptions().queryKey)?.status).toBe('error');
    });
    expect(screen.getByRole('heading', { level: 1, name: 'marta' })).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderProfile();
    await screen.findByRole('heading', { level: 1, name: 'marta' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
