import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryPage } from '@/shared/components/recovery/RecoveryPage';

describe('RecoveryPage', () => {
  it('mantiene el botón ocupado hasta que termina la acción de recuperación', async () => {
    const user = userEvent.setup();
    const retry = Promise.withResolvers<void>();
    render(<RecoveryPage kind="error" onRetry={() => retry.promise} />);

    const button = screen.getByRole('button', { name: 'Reintentar' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await act(async () => retry.resolve());
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('informa de un reintento fallido y permite volver a intentarlo', async () => {
    const user = userEvent.setup();
    const retry = Promise.withResolvers<void>();
    render(<RecoveryPage kind="error" onRetry={() => retry.promise} />);

    const button = screen.getByRole('button', { name: 'Reintentar' });
    await user.click(button);
    await act(async () => retry.reject(new Error('No se pudo recuperar la página')));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sigue sin funcionar. Puedes volver al inicio o escribirnos.',
    );
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});
