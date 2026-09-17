import { StrictMode } from 'react';
import { AnimatePresence } from 'motion/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthAlert } from '@/features/auth/auth-alert';
import { FeedbackReveal } from '@/features/auth/FeedbackReveal';
import { FieldFeedback } from '@/features/auth/FieldFeedback';

function systemMotion(matches = false) {
  // jsdom no ofrece preferencias del sistema. React, Motion y el reloj son reales.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches,
    media: '(prefers-reduced-motion: reduce)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (value: boolean) =>
    act(() => {
      media.matches = value;
      media.dispatchEvent(new Event('change'));
    });
}

// La opacidad permite comprobar que la interrupción ocurre durante el movimiento.
// No se fija la curva ni la duración, y jsdom no permite medir la altura visual.
async function duringAnimation(element: HTMLElement) {
  await waitFor(() => {
    const opacity = Number(element.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });
}

afterEach(() => vi.restoreAllMocks());

describe('feedback de autenticación', () => {
  it('anuncia el error del campo y lo reemplaza por la confirmación actual', async () => {
    const { rerender } = render(
      <FieldFeedback id="email-feedback" error="Correo inválido" success="Correo disponible" />,
    );
    const liveRegion = document.getElementById('email-feedback');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByText('Correo inválido')).toBeInTheDocument();
    expect(screen.queryByText('Correo disponible')).not.toBeInTheDocument();

    rerender(<FieldFeedback id="email-feedback" success="Correo disponible" />);
    expect(screen.queryByText('Correo inválido')).not.toBeInTheDocument();
    expect(screen.getAllByText('Correo disponible')).toHaveLength(1);
    rerender(<FieldFeedback id="email-feedback" />);
    await waitFor(() => expect(liveRegion).toBeEmptyDOMElement());
  });

  it('retira la alerta de la accesibilidad al cerrar y del DOM al terminar', async () => {
    const { container, rerender } = render(
      <AuthAlert title="No se pudo entrar">Revisa el correo y la contraseña.</AuthAlert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo entrar');
    expect(alert).toHaveTextContent('Revisa el correo y la contraseña.');
    const reveal = container.firstElementChild as HTMLElement;
    await waitFor(() => expect(reveal).toHaveStyle({ opacity: '1' }));

    rerender(
      <AuthAlert open={false} title="No se pudo entrar">
        Revisa el correo y la contraseña.
      </AuthAlert>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('alert', { hidden: true })).toBe(alert);
    expect(alert.closest('[inert]')).not.toBeNull();
    await waitFor(() => expect(alert).not.toBeInTheDocument());
  });

  it('recupera una alerta que estaba saliendo sin duplicar ni perder el nuevo mensaje', async () => {
    const { container, rerender } = render(<AuthAlert title="Error">Primer intento</AuthAlert>);
    const reveal = container.firstElementChild as HTMLElement;
    await waitFor(() => expect(reveal).toHaveStyle({ opacity: '1' }));
    rerender(
      <AuthAlert open={false} title="Error">
        Primer intento
      </AuthAlert>,
    );
    await duringAnimation(reveal);
    rerender(<AuthAlert title="Error">Segundo intento</AuthAlert>);

    expect(screen.getAllByRole('alert', { hidden: true })).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Segundo intento');
    expect(screen.queryByText('Primer intento')).not.toBeInTheDocument();
    expect(screen.getByRole('alert').closest('[inert]')).toBeNull();
    await waitFor(() => expect(reveal).toHaveStyle({ opacity: '1' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Segundo intento');
  });

  it('muestra y retira FeedbackReveal sin espera con movimiento reducido y StrictMode', async () => {
    systemMotion(true);
    const { container, rerender } = render(
      <AnimatePresence>
        <FeedbackReveal key="feedback">
          <button>Reintentar</button>
        </FeedbackReveal>
      </AnimatePresence>,
      { wrapper: StrictMode },
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(container.firstElementChild).toHaveStyle({ opacity: '1' });
    rerender(<AnimatePresence />);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Reintentar')).not.toBeInTheDocument());
  });

  it('retira AuthAlert al cerrar con movimiento reducido desde el primer render', async () => {
    systemMotion(true);
    const { container, rerender } = render(<AuthAlert title="Error">Revisa tus datos.</AuthAlert>);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(container.firstElementChild).toHaveStyle({ opacity: '1' });
    rerender(
      <AuthAlert open={false} title="Error">
        Revisa tus datos.
      </AuthAlert>,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Revisa tus datos.')).not.toBeInTheDocument());
  });

  it('completa la entrada al reducir movimiento sin volver a ocultar el mensaje al restaurarlo', async () => {
    const reduce = systemMotion();
    const { container } = render(<AuthAlert title="Error">No se pudo guardar.</AuthAlert>, {
      wrapper: StrictMode,
    });
    const reveal = container.firstElementChild as HTMLElement;
    await duringAnimation(reveal);
    reduce(true);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(reveal).toHaveStyle({ opacity: '1' });
    expect(screen.getByRole('alert')).toBeVisible();

    reduce(false);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(reveal).toHaveStyle({ opacity: '1' });
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar.');
  });

  it('termina una salida en curso al reducir movimiento y no resucita la alerta al restaurarlo', async () => {
    const reduce = systemMotion();
    const { container, rerender } = render(
      <AuthAlert title="Error">Vuelve a intentarlo.</AuthAlert>,
    );
    const reveal = container.firstElementChild as HTMLElement;
    await waitFor(() => expect(reveal).toHaveStyle({ opacity: '1' }));
    rerender(
      <AuthAlert open={false} title="Error">
        Vuelve a intentarlo.
      </AuthAlert>,
    );
    await duringAnimation(reveal);
    reduce(true);
    expect(screen.queryByText('Vuelve a intentarlo.')).not.toBeInTheDocument();
    reduce(false);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(screen.queryByRole('alert', { hidden: true })).not.toBeInTheDocument();
  });
});
