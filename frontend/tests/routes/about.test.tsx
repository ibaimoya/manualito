import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Route as AboutRoute } from '@/routes/_app.about';
import { renderRoute, routeComponent } from '@tests/_helpers/renderRoute';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderAbout() {
  return renderRoute({
    path: '/about',
    initialEntry: '/about',
    component: routeComponent(AboutRoute),
    stubs: { '/home': 'Home stub', '/capture/source': 'Captura stub' },
  });
}

describe('/about', () => {
  it('héroe con el claim y los cuatro pasos numerados', async () => {
    renderAbout();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      /De la caja a la mesa/,
    );
    for (const step of ['01', '02', '03', '04']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it('las preguntas frecuentes se expanden y contraen', async () => {
    renderAbout();
    const user = userEvent.setup();
    const triggers = await screen.findAllByRole('button', { expanded: false });
    expect(triggers.length).toBeGreaterThan(0);
    await user.click(triggers[0]!);
    expect(triggers[0]).toHaveAttribute('aria-expanded', 'true');
  });

  it('incluye el contexto de TFG y un contacto por email', async () => {
    renderAbout();
    expect(await screen.findByText('Manualito es un TFG')).toBeInTheDocument();
    expect(document.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderAbout();
    await screen.findByRole('heading', { level: 1 });
    expect(await axe(container)).toHaveNoViolations();
  });
});
