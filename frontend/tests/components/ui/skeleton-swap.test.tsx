import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';

describe('SkeletonSwap', () => {
  it('reserva la carga sin exponer el placeholder a lectores ni al teclado', () => {
    const { container } = render(
      <SkeletonSwap pending skeleton={<button>Placeholder</button>}>
        <p>Contenido</p>
      </SkeletonSwap>,
    );
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Placeholder').closest('[inert]')).toBeInTheDocument();
    expect(screen.queryByText('Contenido')).not.toBeInTheDocument();
  });

  it('muestra directamente contenido disponible al montar', () => {
    render(
      <SkeletonSwap pending={false} skeleton={<span>Placeholder</span>}>
        <p>Desde caché</p>
      </SkeletonSwap>,
    );
    expect(screen.queryByText('Placeholder')).not.toBeInTheDocument();
    expect(screen.getByText('Desde caché').parentElement).toHaveStyle({ opacity: '1' });
  });

  it('conserva el campo, su valor y el foco durante actualizaciones del contenido', async () => {
    function Content({ version }: Readonly<{ version: string }>) {
      return (
        <SkeletonSwap pending={false} skeleton={null}>
          <p>{version}</p>
          <input aria-label="Pregunta" />
        </SkeletonSwap>
      );
    }
    const { rerender } = render(<Content version="Inicial" />);
    const field = screen.getByRole('textbox', { name: 'Pregunta' });
    await userEvent.type(field, 'Mi pregunta');
    rerender(<Content version="Actualizado" />);
    expect(screen.getByRole('textbox')).toBe(field);
    expect(field).toHaveValue('Mi pregunta');
    expect(field).toHaveFocus();
    expect(screen.getByText('Actualizado').parentElement).toHaveStyle({ opacity: '1' });
  });

  it('oculta la capa saliente y termina en el último estado tras interrumpir un relevo', async () => {
    const content = (pending: boolean) => (
      <SkeletonSwap pending={pending} skeleton={<span>Placeholder</span>}>
        <button>Reintentar</button>
      </SkeletonSwap>
    );
    const { container, rerender } = render(content(false));
    rerender(content(true));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Reintentar').closest('[inert]')).toBeInTheDocument();
    rerender(content(false));
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Placeholder')).not.toBeInTheDocument());
    expect(container.firstChild).toHaveAttribute('aria-busy', 'false');
  });
});
