import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageComposer } from '@/features/conversations/MessageComposer';

function ComposerHarness({
  initialValue = '',
  disabled = false,
  sendPending = false,
  onSubmit = () => undefined,
}: Readonly<{
  initialValue?: string;
  disabled?: boolean;
  sendPending?: boolean;
  onSubmit?: () => void;
}>) {
  const [value, setValue] = useState(initialValue);

  return (
    <MessageComposer
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      placeholder="Pregunta sobre Catan..."
      maxLength={4000}
      disabled={disabled}
      sendPending={sendPending}
    />
  );
}

describe('MessageComposer', () => {
  it('permite escribir mientras el envio esta pendiente, pero bloquea el boton', async () => {
    const user = userEvent.setup();
    render(<ComposerHarness sendPending />);

    const input = screen.getByRole('textbox', { name: /Escribe tu pregunta/i });
    const send = screen.getByRole('button', { name: /Enviar pregunta/i });

    await user.type(input, 'Siguiente pregunta');

    expect(input).toHaveValue('Siguiente pregunta');
    expect(input).toBeEnabled();
    expect(send).toBeDisabled();
    expect(send).toHaveAttribute('aria-busy', 'true');
  });

  it('no envia con Enter mientras el envio esta pendiente', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ComposerHarness initialValue="Siguiente pregunta" sendPending onSubmit={onSubmit} />);

    screen.getByRole('textbox', { name: /Escribe tu pregunta/i }).focus();
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('envia con click y Enter cuando hay texto valido', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ComposerHarness initialValue="Madera" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /Enviar pregunta/i }));
    screen.getByRole('textbox', { name: /Escribe tu pregunta/i }).focus();
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('deshabilita textarea y boton cuando disabled es true', () => {
    render(<ComposerHarness initialValue="Madera" disabled />);

    expect(screen.getByRole('textbox', { name: /Escribe tu pregunta/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Enviar pregunta/i })).toBeDisabled();
  });
});
