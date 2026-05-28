import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Sheet, SheetBody, SheetFooter, SheetHeader } from '@/components/ui/sheet';

function Demo({
  open = true,
  onOpenChange = () => undefined,
}: {
  open?: boolean;
  onOpenChange?: (n: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetHeader
        title="Título de prueba"
        description="Descripción"
        onClose={() => onOpenChange(false)}
      />
      <SheetBody>
        <p>Contenido</p>
      </SheetBody>
      <SheetFooter>
        <button>Aceptar</button>
      </SheetFooter>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('no monta el portal cuando open=false', () => {
    render(<Demo open={false} />);
    expect(screen.queryByText('Título de prueba')).not.toBeInTheDocument();
  });

  it('cuando open=true muestra header, body, footer', () => {
    render(<Demo open />);
    expect(screen.getByText('Título de prueba')).toBeInTheDocument();
    expect(screen.getByText('Descripción')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
  });

  it('conserva la estructura visual de bottom sheet', () => {
    render(<Demo open />);

    const overlay = document.querySelector('[data-mn-overlay]');
    const sheet = document.querySelector('[data-mn-sheet]');

    expect(overlay).toBeInTheDocument();
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveClass('fixed', 'bottom-0', 'rounded-t-3xl');
    expect(sheet?.className).toContain('pb-[env(safe-area-inset-bottom)]');
    expect(sheet?.querySelector('.h-1.w-10.rounded-full.bg-border-strong')).toBeInTheDocument();
  });

  it('botón X dispara onOpenChange(false)', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Demo open onOpenChange={handler} />);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(handler).toHaveBeenCalledWith(false);
  });

  it('Escape cierra el sheet', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Demo open onOpenChange={handler} />);
    await user.keyboard('{Escape}');
    expect(handler).toHaveBeenCalledWith(false);
  });

  it('pasa axe a11y con título y descripción', async () => {
    const { baseElement } = render(<Demo open />);
    // Radix monta el contenido en un portal — pasamos baseElement para que
    // axe lo analice también.
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('aria-labelledby apunta al título', () => {
    render(<Demo open />);
    const dialog = screen.getByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const title = document.getElementById(labelledBy ?? '');
    expect(title?.textContent).toBe('Título de prueba');
  });
});
