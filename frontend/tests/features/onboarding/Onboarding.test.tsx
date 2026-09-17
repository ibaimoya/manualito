import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { LanguageProvider } from '@/app/language';
import { ThemeProvider } from '@/app/theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { AuthShell } from '@/features/auth/auth-shell';
import { storage } from '@/shared/lib/storage';

afterEach(() => vi.restoreAllMocks());

function renderOnboarding() {
  const root = createRootRoute({
    component: () => (
      <AuthShell>
        <Outlet />
      </AuthShell>
    ),
  });
  const onboarding = createRoute({
    getParentRoute: () => root,
    path: '/onboarding',
    component: Onboarding,
  });
  const router = createRouter({
    routeTree: root.addChildren([onboarding]),
    history: createMemoryHistory({ initialEntries: ['/onboarding'] }),
  });
  const result = render(
    <LanguageProvider>
      <ThemeProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>,
  );
  return { ...result, router };
}

describe('Onboarding', () => {
  it.each([
    [true, 'Usar modo claro', 'light', '{Enter}'],
    [false, 'Usar modo oscuro', 'dark', ' '],
  ] as const)(
    'alterna desde el aspecto del sistema con teclado y conserva el acento cuando oscuro=%s',
    async (dark, label, mode, key) => {
      // jsdom no tiene apariencia del sistema. Solo se controla esa frontera.
      // El provider y el botón de tema se montan sin sustituirlos.
      const matchMedia = window.matchMedia;
      vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
        ...matchMedia(query),
        matches: query === '(prefers-color-scheme: dark)' && dark,
      }));
      storage.writeSettings({ mode: 'auto', accent: 'blue' });
      const user = userEvent.setup();
      renderOnboarding();

      const toggle = await screen.findByRole('button', { name: label });
      toggle.focus();
      await user.keyboard(key);

      expect(document.documentElement).toHaveClass(`theme-${mode}`, 'accent-blue');
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAccessibleName(dark ? 'Usar modo oscuro' : 'Usar modo claro');
    },
  );

  it('presenta una bienvenida accesible sin marcarla como vista', async () => {
    const { container } = renderOnboarding();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Que comience la partida.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manualito, ir a la web' })).toHaveAttribute(
      'href',
      'https://manualito.dev',
    );
    expect(
      screen.getByText('Consulta las reglas y resuelve tus dudas de tus juegos de mesa.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Política de privacidad' })).toBeEnabled();
    expect(storage.isOnboardingSeen()).toBe(false);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('cambia el idioma con teclado y conserva el foco en la bienvenida', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding();
    const language = await screen.findByRole('button', { name: 'Switch language to English' });
    language.focus();

    await user.keyboard('{Enter}');

    expect(await screen.findByRole('heading', { name: 'Let the game begin.' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cambiar el idioma a español' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(storage.isOnboardingSeen()).toBe(false);
  });

  it('abre privacidad sin navegar y devuelve el foco al cerrarla con Escape', async () => {
    const user = userEvent.setup();
    const { router } = renderOnboarding();
    const privacy = await screen.findByRole('button', { name: 'Política de privacidad' });

    await user.click(privacy);
    const dialog = await screen.findByRole('dialog', { name: 'Política de privacidad' });
    expect(within(dialog).getByRole('heading', { name: 'Política de privacidad' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(storage.isOnboardingSeen()).toBe(false);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(privacy).toHaveFocus();
  });
});
