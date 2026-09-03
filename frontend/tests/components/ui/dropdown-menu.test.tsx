import { type ComponentProps } from 'react';
import { BookOpen, Pencil, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function TestMenu({
  disableRename = false,
  onSelect,
  contentProps,
}: {
  disableRename?: boolean;
  onSelect?: (action: string) => void;
  contentProps?: ComponentProps<typeof DropdownMenuContent>;
}) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
        <DropdownMenuContent {...contentProps}>
          <DropdownMenuItem onSelect={() => onSelect?.('abrir')}>
            <BookOpen aria-hidden="true" /> Abrir
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disableRename} onSelect={() => onSelect?.('renombrar')}>
            <Pencil aria-hidden="true" /> Renombrar
          </DropdownMenuItem>
          <DropdownMenuItem danger onSelect={() => onSelect?.('borrar')}>
            <Trash2 aria-hidden="true" /> Borrar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button">Otra acción</button>
    </>
  );
}

describe('DropdownMenu', () => {
  it('abre con teclado y salta las opciones deshabilitadas en ambas direcciones', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TestMenu disableRename onSelect={onSelect} />);

    await user.tab();
    await user.keyboard('{ArrowDown}');
    const open = screen.getByRole('menuitem', { name: 'Abrir' });
    expect(open).toHaveFocus();
    expect(screen.getByRole('menuitem', { name: 'Renombrar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Borrar' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(open).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('sigue el puntero al invertir la dirección sin activar ninguna opción', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TestMenu onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));

    for (const name of ['Abrir', 'Renombrar', 'Borrar', 'Renombrar', 'Abrir']) {
      const item = screen.getByRole('menuitem', { name });
      await user.hover(item);
      expect(item).toHaveFocus();
    }

    expect(screen.getByRole('menuitem', { name: 'Borrar' })).toHaveClass('text-error');
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeVisible();
  });

  it('selecciona una sola vez al clicar y cierra el menú', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TestMenu onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await user.click(screen.getByRole('menuitem', { name: 'Renombrar' }));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('renombrar');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('activa la acción destructiva solo al confirmar con Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TestMenu onSelect={onSelect} />);
    await user.tab();
    await user.keyboard('{ArrowDown}{End}');
    expect(screen.getByRole('menuitem', { name: 'Borrar' })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('borrar');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('conserva los callbacks de foco y devuelve el foco al trigger con Escape', async () => {
    const user = userEvent.setup();
    const focused: string[] = [];
    const blurred: string[] = [];
    const onCloseAutoFocus = vi.fn();
    render(
      <TestMenu
        contentProps={{
          onFocusCapture: (event) => focused.push(event.target.textContent?.trim() ?? ''),
          onBlurCapture: (event) => blurred.push(event.target.textContent?.trim() ?? ''),
          onCloseAutoFocus,
        }}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowDown}{End}{Escape}');

    expect(focused).toEqual(expect.arrayContaining(['Abrir', 'Borrar']));
    expect(blurred).toContain('Abrir');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Acciones' })).toHaveFocus());
    expect(onCloseAutoFocus).toHaveBeenCalledOnce();
  });

  it('permite que el consumidor elija el foco al cerrar', async () => {
    const user = userEvent.setup();
    render(
      <TestMenu
        contentProps={{
          onCloseAutoFocus: (event) => {
            event.preventDefault();
            screen.getByRole('button', { name: 'Otra acción' }).focus();
          },
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Otra acción' })).toHaveFocus());
  });
});
