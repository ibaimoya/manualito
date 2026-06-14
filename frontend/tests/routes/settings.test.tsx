import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route as SettingsRoute } from '@/routes/_app.settings';
import type { AuthUser } from '@/shared/api/auth';
import { renderRoute, routeComponent, TEST_USER } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  Reflect.deleteProperty(globalThis, 'caches');
  vi.restoreAllMocks();
});
afterAll(() => server.close());

function renderSettings(user: AuthUser | null = TEST_USER) {
  return renderRoute({
    path: '/settings',
    initialEntry: '/settings',
    component: routeComponent(SettingsRoute),
    user,
  });
}

describe('/settings', () => {
  it('renderiza las secciones principales: Apariencia y Privacidad y datos', async () => {
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

  it('sin sesión en caché no monta la sección de Cuenta ni el borrado de cuenta', async () => {
    renderSettings(null);
    await screen.findByRole('region', { name: /Apariencia/i });
    expect(screen.queryByRole('region', { name: /Cuenta/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Borrar cuenta/i })).not.toBeInTheDocument();
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

  it('el hint del tema es estático: no cambia al alternar de modo', async () => {
    renderSettings();
    const user = userEvent.setup();
    expect(await screen.findByText('Claro, oscuro o el del sistema')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Auto' }));
    expect(screen.getByText('Claro, oscuro o el del sistema')).toBeInTheDocument();
  });

  it('muestra el indicador estático de archivos gestionados por servidor', async () => {
    renderSettings();
    expect(
      await screen.findByRole('status', { name: /Archivos gestionados/i }),
    ).toBeInTheDocument();
  });

  it('botón "Borrar cuenta" abre el diálogo de confirmación', async () => {
    renderSettings();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Borrar cuenta' }));

    const dialog = await screen.findByRole('dialog', { name: 'Borrar cuenta' });
    expect(within(dialog).getByText(/Se borrarán/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /definitivamente/i })).toBeDisabled();
  });

  it('confirma el borrado de cuenta usando el backend y limpia la caché de API', async () => {
    let deleteBody: unknown = null;
    server.use(
      http.delete('/api/me', async ({ request }) => {
        deleteBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const deleteSpy = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: deleteSpy },
    });

    renderSettings();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Borrar cuenta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Borrar cuenta' });
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Borrar cuenta definitivamente',
    });

    await user.type(within(dialog).getByLabelText(/Escribe tu usuario/i), 'MARTA');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(deleteBody).toEqual({ username: 'MARTA' }));
    expect(await screen.findByText('Cuenta borrada')).toBeInTheDocument();
    expect(deleteSpy).toHaveBeenCalledWith('api');
  });

  it('el footer enlaza a la política de privacidad', async () => {
    renderSettings();
    expect(
      await screen.findByRole('link', { name: /Política de privacidad/i }),
    ).toBeInTheDocument();
  });
});
