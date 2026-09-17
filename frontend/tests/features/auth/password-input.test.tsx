import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PasswordInput } from '@/features/auth/auth-controls';

const PASSWORD = 'SoloPruebas-123!';

afterEach(() => vi.restoreAllMocks());

function measurePassword(input: HTMLElement) {
  // jsdom no mide texto ni dibuja canvas. Solo se sustituye esa frontera del navegador.
  Object.defineProperties(input, {
    clientWidth: { value: 160 },
    offsetWidth: { value: 160 },
    offsetHeight: { value: 44 },
  });
  input.style.padding = '12px';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({
      width: 8,
      fontBoundingBoxAscent: 12,
      fontBoundingBoxDescent: 4,
      actualBoundingBoxAscent: 6,
      actualBoundingBoxDescent: 0,
    }),
  } as unknown as CanvasRenderingContext2D);
}

function field() {
  return (
    <PasswordInput
      aria-label="Contraseña"
      defaultValue={PASSWORD}
      autoComplete="current-password"
    />
  );
}

describe('PasswordInput', () => {
  it('retira el efecto al terminar y mantiene la contraseña solo en el campo', async () => {
    const user = userEvent.setup();
    const { container } = render(field());
    const input = screen.getByLabelText('Contraseña');
    measurePassword(input);
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(container.querySelector('.password-mask-burst')).toHaveAttribute('aria-hidden', 'true');
    expect(container.textContent).not.toContain(PASSWORD);
    expect(input).toHaveAttribute('type', 'password');
    await waitFor(() => expect(container.querySelector('.password-mask-burst')).toBeNull());
    expect(input).toHaveValue(PASSWORD);
  });

  it('cancela el efecto si se empieza a escribir', async () => {
    const user = userEvent.setup();
    const { container } = render(field());
    const input = screen.getByLabelText('Contraseña');
    measurePassword(input);
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(container.querySelector('.password-mask-burst')).not.toBeNull();
    fireEvent.input(input, { target: { value: `${PASSWORD}a` } });
    expect(container.querySelector('.password-mask-burst')).toBeNull();
    expect(input).toHaveValue(`${PASSWORD}a`);
  });

  it('muestra y oculta el valor en el mismo campo nativo, sin copiarlo a texto', async () => {
    const user = userEvent.setup();
    const { container } = render(field());
    const input = screen.getByLabelText('Contraseña');

    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue(PASSWORD);
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.textContent).not.toContain(PASSWORD);
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it('vuelve a estar oculta al montar el campo, aunque antes se hubiera mostrado', async () => {
    const user = userEvent.setup();
    const { unmount } = render(field());
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    unmount();
    const { container } = render(field());
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(container.querySelector('.password-mask-burst')).toBeNull();
  });

  it('permite alternar con teclado sin lanzar el efecto', async () => {
    const user = userEvent.setup();
    const { container } = render(field());
    await user.tab();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
    await user.keyboard(' ');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(container.querySelector('.password-mask-burst')).toBeNull();
  });
});
