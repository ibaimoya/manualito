import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PasswordInput } from '@/features/auth/auth-controls';

const PASSWORD = 'SoloPruebas-123!';

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
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
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
