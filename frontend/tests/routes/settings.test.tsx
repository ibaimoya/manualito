import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route as SettingsRoute } from '@/routes/_app.settings';
import type { AuthUser } from '@/shared/api/auth';
import { storage } from '@/shared/lib/storage';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

function renderSettings(user: AuthUser | null = null) {
  return renderRoute({
    path: '/settings',
    initialEntry: '/settings',
    component: routeComponent(SettingsRoute),
    user,
  });
}

describe('/settings', () => {
  it('renderiza las dos secciones principales: Apariencia y Privacidad y datos', async () => {
    renderSettings();
    expect(await screen.findByRole('region', { name: /Apariencia/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Privacidad y datos/i })).toBeInTheDocument();
  });

  it('muestra la sección de Cuenta con enlace al perfil y salir', async () => {
    renderSettings({
      id: 'u1',
      email: 'marta@x.app',
      username: 'Marta',
      role: 'user',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      last_login_at: null,
      email_verified_at: '2026-01-01T00:00:00.000Z',
      avatar_color: null,
      avatar_figure: null,
    });
    expect(await screen.findByRole('region', { name: /Cuenta/i })).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    // Email y verificación viven ahora en /profile, no aquí.
    const profileLink = screen.getByRole('link', {
      name: /Editar perfil, seguridad y verificación/i,
    });
    expect(profileLink).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: /Salir/i })).toBeInTheDocument();
  });

  it('sin sesión en cache no monta la sección de Cuenta', async () => {
    renderSettings();
    await screen.findByRole('region', { name: /Apariencia/i });
    expect(screen.queryByRole('region', { name: /Cuenta/i })).not.toBeInTheDocument();
  });

  it('cambia el modo del tema usando el SegmentedControl (light/dark/auto)', async () => {
    renderSettings();
    const user = userEvent.setup();
    const modoGroup = await screen.findByRole('radiogroup', {
      name: /Modo de color/i,
    });
    const darkOption = await screen.findByRole('radio', { name: 'Oscuro' });
    await user.click(darkOption);
    expect(darkOption).toHaveAttribute('aria-checked', 'true');
    expect(modoGroup).toBeInTheDocument();
  });

  it('cambia el color de acento entre Ámbar y Azul', async () => {
    renderSettings();
    const user = userEvent.setup();
    const azul = await screen.findByRole('radio', { name: 'Azul' });
    await user.click(azul);
    expect(azul).toHaveAttribute('aria-checked', 'true');
  });

  it('muestra el hint del modo auto reflejando el tema del sistema', async () => {
    // El hint solo aparece en modo auto; el default ahora es claro, así que
    // seleccionamos Auto primero. matchMedia mock = "claro" según setup.
    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'Auto' }));
    expect(await screen.findByText(/Sigue el sistema/)).toBeInTheDocument();
  });

  it('muestra el indicador estático de archivos gestionados por servidor', async () => {
    renderSettings();
    expect(
      await screen.findByRole('status', { name: /Archivos gestionados/i }),
    ).toBeInTheDocument();
  });

  it('botón "Borrar todo" abre el alertdialog de confirmación', async () => {
    renderSettings();
    const user = userEvent.setup();

    const buttons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(buttons[0]!);
    expect(
      await screen.findByRole('alertdialog', { name: /Confirmar borrado/i }),
    ).toBeInTheDocument();
  });

  it('confirma el borrado: barre claves legadas, onboarding seen y la caché /api del SW', async () => {
    // Restos de versiones viejas que el barrido debe limpiar.
    localStorage.setItem('manualito.result.m1', JSON.stringify({ summary: 's' }));
    storage.markOnboardingSeen();
    expect(storage.isOnboardingSeen()).toBe(true);
    const deleteSpy = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: deleteSpy },
    });

    renderSettings();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(buttons[0]!);

    const allButtons = await screen.findAllByRole('button', { name: /Borrar todo/i });
    await user.click(allButtons[allButtons.length - 1]!);

    await waitFor(() => {
      expect(localStorage.getItem('manualito.result.m1')).toBeNull();
      expect(storage.isOnboardingSeen()).toBe(false);
      expect(deleteSpy).toHaveBeenCalledWith('api');
    });
    Reflect.deleteProperty(globalThis, 'caches');
  });

  it('cancela la confirmación → no borra ni cierra los datos', async () => {
    localStorage.setItem('manualito.result.m1', JSON.stringify({ summary: 's' }));
    renderSettings();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole('button', { name: /Borrar todo/i }))[0]!);
    await user.click(await screen.findByRole('button', { name: /Cancelar/i }));
    expect(localStorage.getItem('manualito.result.m1')).not.toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByRole('alertdialog', { name: /Confirmar borrado/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('el footer enlaza a la política de privacidad', async () => {
    renderSettings();
    expect(
      await screen.findByRole('link', { name: /Política de privacidad/i }),
    ).toBeInTheDocument();
  });
});
