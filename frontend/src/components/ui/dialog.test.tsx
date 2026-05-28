import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Dialog, DialogBody, DialogHeader } from './dialog';

function Demo({
  open = true,
  onOpenChange = () => undefined,
}: Readonly<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader
        title="Titulo de prueba"
        description="Descripcion"
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <p>Contenido dialog</p>
      </DialogBody>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('no monta el portal cuando open=false', () => {
    render(<Demo open={false} />);
    expect(screen.queryByText('Titulo de prueba')).not.toBeInTheDocument();
  });

  it('conserva la estructura visual de dialog centrado', () => {
    render(<Demo open />);

    const overlay = document.querySelector('[data-mn-dialog-overlay]');
    const dialog = document.querySelector('[data-mn-dialog]');

    expect(overlay).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveClass('fixed', 'left-1/2', 'top-1/2', 'rounded-2xl');
    expect(dialog?.querySelector('.h-1.w-10.rounded-full.bg-border-strong')).not.toBeInTheDocument();
  });

  it('boton X dispara onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();

    render(<Demo open onOpenChange={handler} />);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(handler).toHaveBeenCalledWith(false);
  });

  it('pasa axe a11y con titulo y descripcion', async () => {
    const { baseElement } = render(<Demo open />);

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
