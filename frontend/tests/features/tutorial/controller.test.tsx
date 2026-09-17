// Driver es real. Estos objetivos mínimos prueban su ciclo de vida. La geometría se comprueba en el navegador.
import '@tests/features/tutorial/jsdom-visibility';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { useTutorialViews } from '@/features/tutorial/views';
import type { TutorialView } from '@/features/tutorial/types';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppToaster } from '@/app/AppToaster';
import i18n from '@/app/i18n';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { tutorial } from '@/features/tutorial/controller';
import { tourTarget } from '@/features/tutorial/targets';
import type { TourTarget } from '@/features/tutorial/types';
import { storage } from '@/shared/lib/storage';

const WELCOME_TARGETS: readonly TourTarget[] = [
  'home-activity',
  'nav-library',
  'nav-explore',
  'nav-new-manual',
  'nav-help',
];

const VIEWER_TARGETS: readonly TourTarget[] = [
  'viewer-pages',
  'viewer-search',
  'viewer-text',
  'viewer-original',
  'viewer-compare',
  'viewer-manage',
];

const EXPLORE_TARGETS: readonly TourTarget[] = [
  'explore-search',
  'explore-hints',
  'explore-suggestions',
];

const WELCOME_TITLES = ['Inicio', 'Biblioteca', 'Explorar', 'Añade un manual', 'Ayuda'];

function Fixture({ ids }: Readonly<{ ids: readonly TourTarget[] }>) {
  const [view, setView] = useState<TutorialView>('compare');
  useTutorialViews('viewer', view, setView, { compare: ['viewer-compare'] });
  return (
    <ThemeProvider>
      <LanguageProvider>
        <button type="button">origen</button>
        {ids.map((id) => (
          <button key={id} type="button" {...tourTarget(id)}>
            {id}
          </button>
        ))}
        <AppToaster />
      </LanguageProvider>
    </ThemeProvider>
  );
}

function renderFixture(ids: readonly TourTarget[] = WELCOME_TARGETS) {
  return render(<Fixture ids={ids} />);
}

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));

const noDialog = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

const at = (pathname: string, search = '') => tutorial.onLocationChange({ pathname, search });

const findUnavailable = () => screen.findByText(i18n.t('unavailable.title', { ns: 'tutorial' }));

describe('tutorial controller', () => {
  afterEach(() => {
    tutorial.reset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('muestra el primer paso con progreso, controles localizados y foco en Siguiente', async () => {
    renderFixture();
    tutorial.start('welcome');

    const dialog = await screen.findByRole('dialog', { name: 'Inicio' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(
      within(dialog).getByText('Aquí puedes retomar los juegos y manuales que has consultado.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('1 de 5')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cerrar tutorial' })).toBeInTheDocument();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toHaveFocus(),
    );
    expect(document.body).toHaveClass('driver-active');
    expect(screen.getByRole('button', { name: 'home-activity' })).toHaveClass(
      'driver-active-element',
      'driver-no-interaction',
    );
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    expect(tutorial.activeTour()).toBe('welcome');
  });

  it('avanza, retrocede y termina devolviendo el foco a su origen', async () => {
    renderFixture();
    const user = userEvent.setup();
    const origin = screen.getByRole('button', { name: 'origen' });
    origin.focus();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    const second = await screen.findByRole('dialog', { name: 'Biblioteca' });
    expect(within(second).getByText('2 de 5')).toBeInTheDocument();
    expect(within(second).getByRole('button', { name: 'Anterior' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();

    for (const title of WELCOME_TITLES.slice(1)) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
      expect(await screen.findByRole('dialog', { name: title })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Terminar' }));
    await waitFor(noDialog);
    expect(document.body).not.toHaveClass('driver-active');
    expect(document.querySelector('.driver-overlay')).toBeNull();
    expect(document.querySelector('.driver-active-element')).toBeNull();
    expect(origin).toHaveFocus();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('conserva dos avances recibidos antes de colocar el siguiente paso', async () => {
    renderFixture();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    await act(async () => {
      fireEvent.keyUp(window, { key: 'ArrowRight' });
      fireEvent.keyUp(window, { key: 'ArrowRight' });
    });

    const dialog = await screen.findByRole('dialog', { name: 'Explorar' });
    expect(within(dialog).getByText('3 de 5')).toBeInTheDocument();
  });

  it('Escape cierra sin confirmación y la X también', async () => {
    renderFixture();
    const user = userEvent.setup();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    await user.keyboard('{Escape}');
    await waitFor(noDialog);
    expect(document.body).not.toHaveClass('driver-active');

    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await user.click(screen.getByRole('button', { name: 'Cerrar tutorial' }));
    await waitFor(noDialog);
  });

  it('devuelve los atributos ARIA del objetivo al soltarlo y al terminar', async () => {
    renderFixture();
    const user = userEvent.setup();
    const library = screen.getByRole('button', { name: 'nav-library' });
    library.setAttribute('aria-haspopup', 'menu');
    library.setAttribute('aria-expanded', 'false');
    library.setAttribute('aria-controls', 'library-menu');
    const help = screen.getByRole('button', { name: 'nav-help' });
    help.setAttribute('aria-haspopup', 'menu');
    help.setAttribute('aria-expanded', 'false');
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('dialog', { name: 'Biblioteca' });
    expect(library).toHaveAttribute('aria-haspopup', 'dialog');
    expect(library).toHaveAttribute('aria-expanded', 'true');
    expect(library).toHaveAttribute('aria-controls', 'driver-popover-content');

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('dialog', { name: 'Explorar' });
    await waitFor(() => expect(library).toHaveAttribute('aria-haspopup', 'menu'));
    expect(library).toHaveAttribute('aria-expanded', 'false');
    expect(library).toHaveAttribute('aria-controls', 'library-menu');
    expect(screen.getByRole('button', { name: 'nav-explore' })).not.toHaveAttribute(
      'aria-controls',
      'library-menu',
    );

    for (const title of ['Añade un manual', 'Ayuda']) {
      await user.click(screen.getByRole('button', { name: 'Siguiente' }));
      await screen.findByRole('dialog', { name: title });
    }
    expect(help).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(screen.getByRole('button', { name: 'Terminar' }));
    await waitFor(noDialog);
    expect(help).toHaveAttribute('aria-haspopup', 'menu');
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('button', { name: 'home-activity' })).not.toHaveAttribute(
      'aria-haspopup',
    );
  });

  it('las flechas responden aunque el paso siga animándose', async () => {
    renderFixture();
    const user = userEvent.setup();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 350)));

    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await user.keyboard('{ArrowRight}');
    now += 120;
    const second = await screen.findByRole('dialog', { name: 'Biblioteca' });
    expect(within(second).getByText('2 de 5')).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    const first = await screen.findByRole('dialog', { name: 'Inicio' });
    expect(within(first).getByText('1 de 5')).toBeInTheDocument();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(noDialog);
  });

  it('un toque en el velo no cierra mientras el paso se asienta, y sí después', async () => {
    renderFixture();
    const user = userEvent.setup();
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await user.click(document.querySelector('.driver-overlay path')!);
    expect(screen.getByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();
    expect(tutorial.activeTour()).toBe('welcome');
    frames.mockRestore();

    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 350)));
    await user.click(document.querySelector('.driver-overlay path')!);
    await waitFor(noDialog);
    expect(document.body).not.toHaveClass('driver-active');
    expect(tutorial.activeTour()).toBeNull();
  });

  it('si el origen del foco ya no existe, el foco vuelve al botón de ayuda visible', async () => {
    const view = renderFixture();
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'origen' }).focus();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    view.rerender(
      <ThemeProvider>
        <LanguageProvider>
          {WELCOME_TARGETS.map((id) => (
            <button key={id} type="button" {...tourTarget(id)}>
              {id}
            </button>
          ))}
          <AppToaster />
        </LanguageProvider>
      </ThemeProvider>,
    );
    await user.keyboard('{Escape}');
    await waitFor(noDialog);
    expect(screen.getByRole('button', { name: 'nav-help' })).toHaveFocus();
  });

  it('omite los pasos opcionales sin objetivo y renumera el progreso', async () => {
    renderFixture(['explore-search', 'explore-suggestions']);
    const user = userEvent.setup();
    tutorial.start('explore');

    const first = await screen.findByRole('dialog', { name: 'Buscador' });
    expect(within(first).getByText('1 de 2')).toBeInTheDocument();
    await user.click(within(first).getByRole('button', { name: 'Siguiente' }));
    const last = await screen.findByRole('dialog', { name: 'Sugerencias' });
    expect(within(last).getByText('2 de 2')).toBeInTheDocument();
    expect(within(last).getByRole('button', { name: 'Terminar' })).toBeInTheDocument();
  });

  it('omite un paso opcional que desaparece antes de llegar y renumera el progreso', async () => {
    const view = renderFixture(EXPLORE_TARGETS);
    const user = userEvent.setup();
    tutorial.start('explore');
    const first = await screen.findByRole('dialog', { name: 'Buscador' });
    expect(within(first).getByText('1 de 3')).toBeInTheDocument();

    view.rerender(<Fixture ids={['explore-search', 'explore-suggestions']} />);
    await waitFor(() => expect(within(first).getByText('1 de 2')).toBeInTheDocument());

    await user.click(within(first).getByRole('button', { name: 'Siguiente' }));
    const last = await screen.findByRole('dialog', { name: 'Sugerencias' });
    expect(within(last).getByText('2 de 2')).toBeInTheDocument();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
  });

  it('salta un paso opcional cuyo objetivo desaparece mientras está resaltado', async () => {
    const view = renderFixture(EXPLORE_TARGETS);
    const user = userEvent.setup();
    tutorial.start('explore');
    const first = await screen.findByRole('dialog', { name: 'Buscador' });
    await user.click(within(first).getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('dialog', { name: 'Qué puedes hacer' });

    view.rerender(<Fixture ids={['explore-search', 'explore-suggestions']} />);
    const last = await screen.findByRole('dialog', { name: 'Sugerencias' });
    expect(within(last).getByText('2 de 2')).toBeInTheDocument();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    expect(tutorial.activeTour()).toBe('explore');
  });

  it('cierra con aviso si un objetivo imprescindible desaparece durante el recorrido', async () => {
    const view = renderFixture();
    const user = userEvent.setup();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByRole('dialog', { name: 'Biblioteca' });

    view.rerender(<Fixture ids={WELCOME_TARGETS.filter((id) => id !== 'nav-library')} />);
    expect(await findUnavailable()).toBeInTheDocument();
    noDialog();
    expect(document.body).not.toHaveClass('driver-active');
    expect(document.querySelector('.driver-overlay')).toBeNull();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('cierra con aviso al avanzar hacia un objetivo imprescindible que ya no está', async () => {
    const view = renderFixture();
    const user = userEvent.setup();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    view.rerender(<Fixture ids={WELCOME_TARGETS.filter((id) => id !== 'nav-library')} />);
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await findUnavailable()).toBeInTheDocument();
    noDialog();
    expect(document.getElementById('driver-dummy-element')).toBeNull();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('espera a que aparezca un objetivo imprescindible que carga tarde', async () => {
    const view = renderFixture(['nav-library', 'nav-explore', 'nav-new-manual', 'nav-help']);
    tutorial.start('welcome');
    await settle();
    noDialog();

    view.rerender(<Fixture ids={WELCOME_TARGETS} />);
    expect(await screen.findByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('arranca cuando el objetivo recibe su marca sin que entre ni salga ningún nodo', async () => {
    renderFixture(['nav-library', 'nav-explore', 'nav-new-manual', 'nav-help']);
    tutorial.start('welcome');
    await settle();
    noDialog();

    screen.getByRole('button', { name: 'origen' }).setAttribute('data-tour', 'home-activity');
    expect(await screen.findByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('avisa sin globo huérfano cuando el objetivo imprescindible no llega', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderFixture(['nav-library']);
    tutorial.start('welcome');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();

    expect(await findUnavailable()).toBeInTheDocument();
    noDialog();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('marca la cuenta como vista solo cuando el primer paso ya se ha mostrado', async () => {
    renderFixture();
    tutorial.setUser('user-a');
    expect(tutorial.isSeen('user-a')).toBe(false);

    tutorial.autoStart();
    await screen.findByRole('dialog', { name: 'Inicio' });
    await waitFor(() => expect(storage.isTutorialSeen('user-a')).toBe(true));
    expect(JSON.parse(localStorage.getItem('manualito.tutorial.seen') ?? '{}')).toEqual({
      'user-a': true,
    });
    expect(tutorial.isSeen('user-b')).toBe(false);
    expect(localStorage.getItem('manualito.onboarding.seen')).toBeNull();
  });

  it('no repite el arranque automático para una cuenta que ya lo vio', async () => {
    storage.markTutorialSeen('user-a');
    renderFixture();
    tutorial.setUser('user-a');
    tutorial.autoStart();
    await settle();
    noDialog();
  });

  it('arranca automáticamente para otra cuenta del mismo navegador', async () => {
    storage.markTutorialSeen('user-a');
    renderFixture();
    tutorial.setUser('user-b');
    tutorial.autoStart();
    expect(await screen.findByRole('dialog', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('conserva la marca en memoria cuando el almacenamiento está bloqueado', async () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    renderFixture();
    const user = userEvent.setup();
    tutorial.setUser('user-a');

    tutorial.autoStart();
    await screen.findByRole('dialog', { name: 'Inicio' });
    await waitFor(() => expect(tutorial.isSeen('user-a')).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(noDialog);

    tutorial.autoStart();
    await settle();
    noDialog();
  });

  it('mantiene un único resaltado aunque se pida dos veces seguidas', async () => {
    renderFixture();
    tutorial.start('welcome');
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await settle();
    expect(document.querySelectorAll('.driver-popover')).toHaveLength(1);
    expect(document.querySelectorAll('.driver-overlay')).toHaveLength(1);
  });

  it('se cierra al cambiar de pantalla y descarta una petición ya cancelada', async () => {
    renderFixture();
    at('/home');
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });

    at('/explore');
    noDialog();
    expect(document.body).not.toHaveClass('driver-active');

    tutorial.start('welcome');
    tutorial.close();
    await settle();
    noDialog();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('cambiar de documento en la misma pantalla cierra el recorrido', async () => {
    renderFixture(VIEWER_TARGETS);
    at('/manual/a');
    tutorial.start('viewer');
    await screen.findByRole('dialog', { name: 'Páginas' });

    at('/manual/b');
    noDialog();
    expect(document.body).not.toHaveClass('driver-active');
    expect(tutorial.activeTour()).toBeNull();
  });

  it('cambiar la búsqueda de la misma ruta cierra el recorrido', async () => {
    renderFixture(['chat-composer']);
    at('/chat/x');
    tutorial.start('chat');
    await screen.findByRole('dialog', { name: 'Escribe tu pregunta' });

    at('/chat/x', '?c=2');
    noDialog();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('cerrar sesión cierra el recorrido activo', async () => {
    renderFixture();
    tutorial.setUser('user-a');
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    tutorial.setUser(null);
    noDialog();
    expect(tutorial.activeTour()).toBeNull();
  });

  it('cambiar de cuenta cierra el recorrido y conserva las marcas por cuenta', async () => {
    renderFixture();
    tutorial.setUser('user-a');
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    await waitFor(() => expect(tutorial.isSeen('user-a')).toBe(true));

    tutorial.setUser('user-b');
    noDialog();
    expect(tutorial.activeTour()).toBeNull();
    expect(tutorial.isSeen('user-a')).toBe(true);
    expect(tutorial.isSeen('user-b')).toBe(false);

    tutorial.autoStart();
    await screen.findByRole('dialog', { name: 'Inicio' });
    await waitFor(() => expect(tutorial.isSeen('user-b')).toBe(true));
  });

  it('respeta movimiento reducido, también si cambia durante el recorrido', async () => {
    const original = window.matchMedia;
    const media = Object.assign(new EventTarget(), {
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
    });
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === media.media ? (media as unknown as MediaQueryList) : original(query),
    );
    renderFixture();
    tutorial.start('welcome');
    await screen.findByRole('dialog', { name: 'Inicio' });
    expect(document.body).toHaveClass('driver-simple');
    expect(document.body).not.toHaveClass('driver-fade');

    act(() => {
      media.matches = false;
      media.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    });
    expect(document.body).toHaveClass('driver-fade');
    expect(document.body).not.toHaveClass('driver-simple');

    act(() => {
      media.matches = true;
      media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    });
    expect(document.body).toHaveClass('driver-simple');
  });
});
