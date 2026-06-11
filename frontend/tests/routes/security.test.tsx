import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { http, HttpResponse } from 'msw';
import { Route as SecurityRoute } from '@/routes/_app.security';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function renderSecurity() {
  return renderRoute({
    path: '/security',
    initialEntry: '/security',
    component: routeComponent(SecurityRoute),
    stubs: { '/home': 'Home stub', '/login': 'Login stub' },
  });
}

describe('/security · cambiar contraseña', () => {
  it('valida en local antes de llamar al backend', async () => {
    renderSecurity();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Escribe tu contraseña actual')).toBeInTheDocument();
  });

  it('401 del backend: error inline en la contraseña actual', async () => {
    server.use(
      http.post('/api/me/password', () =>
        HttpResponse.json({ detail: 'credenciales' }, { status: 401 }),
      ),
    );
    renderSecurity();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Contraseña actual'), 'malísima');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nuevaSegura123');
    await user.type(screen.getByLabelText(/Repite|Confirma/), 'nuevaSegura123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('La contraseña actual no es correcta')).toBeInTheDocument();
  });

  it('éxito: toast avisando del cierre de otras sesiones y limpia el formulario', async () => {
    renderSecurity();
    const user = userEvent.setup();
    const current = await screen.findByLabelText('Contraseña actual');
    await user.type(current, 'laDeAhora123');
    await user.type(screen.getByLabelText('Contraseña nueva'), 'nuevaSegura123');
    await user.type(screen.getByLabelText(/Repite|Confirma/), 'nuevaSegura123');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Contraseña actualizada')).toBeInTheDocument();
    expect(
      screen.getByText('Hemos cerrado la sesión en tus otros dispositivos.'),
    ).toBeInTheDocument();
    expect(current).toHaveValue('');
  });
});

describe('/security · zona de peligro', () => {
  it('el botón de borrado solo se habilita con el @usuario exacto (sin mayús/minús)', async () => {
    renderSecurity();
    const user = userEvent.setup();
    const remove = await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    expect(remove).toBeDisabled();
    const confirm = screen.getByLabelText(/Escribe tu usuario/);
    await user.type(confirm, 'otra-persona');
    expect(remove).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, 'MARTA');
    expect(remove).toBeEnabled();
  });

  it('el aviso incluye los contadores reales de lo que se borra', async () => {
    renderSecurity();
    expect(
      await screen.findByText(/tus 4 juegos, 7 conversaciones y 3 manuales/),
    ).toBeInTheDocument();
  });

  it('borrar la cuenta confirmada muestra la despedida', async () => {
    renderSecurity();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Escribe tu usuario/), 'marta');
    await user.click(screen.getByRole('button', { name: 'Eliminar mi cuenta' }));
    expect(await screen.findByText('Cuenta eliminada')).toBeInTheDocument();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderSecurity();
    await screen.findByRole('button', { name: 'Eliminar mi cuenta' });
    expect(await axe(container)).toHaveNoViolations();
  });
});
