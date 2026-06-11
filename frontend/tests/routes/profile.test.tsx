import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as ProfileRoute } from '@/routes/_app.profile';
import { renderRoute, routeComponent, TEST_USER } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
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
    expect(await screen.findByRole('link', { name: /Cuenta y seguridad/ })).toHaveAttribute(
      'href',
      '/security',
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Editar perfil/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar perfil' });
    expect(within(dialog).getByRole('group', { name: 'Color del avatar' })).toBeInTheDocument();
    expect(within(dialog).getByRole('group', { name: 'Figura del avatar' })).toBeInTheDocument();
  });
});

describe('/profile · actividad', () => {
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
    renderProfile();
    expect(await screen.findByRole('heading', { level: 1, name: 'marta' })).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderProfile();
    await screen.findByRole('heading', { level: 1, name: 'marta' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
