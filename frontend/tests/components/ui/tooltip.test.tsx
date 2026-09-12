import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';

function Examples({ touch = false }: { touch?: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip content="Texto disponible" touch={touch}>
        <button type="button">Estado</button>
      </Tooltip>
      <Tooltip content="Compartido con la comunidad" touch={touch}>
        <button type="button">Compartido</button>
      </Tooltip>
      <button type="button">Siguiente</button>
    </TooltipProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Tooltip', () => {
  it('espera al principio y abre las ayudas consecutivas sin otra demora', async () => {
    // El reloj es una frontera no determinista. Radix y sus temporizadores se ejecutan completos.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<Examples />);

    fireEvent.pointerMove(screen.getByRole('button', { name: 'Estado' }), { pointerType: 'mouse' });
    await act(() => vi.advanceTimersByTimeAsync(119));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Texto disponible');
    expect(screen.getByRole('button', { name: 'Estado' })).toHaveAttribute(
      'data-state',
      'delayed-open',
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.pointerMove(screen.getByRole('button', { name: 'Compartido' }), {
      pointerType: 'mouse',
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Compartido con la comunidad');
    expect(screen.getByRole('button', { name: 'Compartido' })).toHaveAttribute(
      'data-state',
      'instant-open',
    );
  });

  it('conserva la burbuja al cruzar el corredor en ambas direcciones y cierra fuera', async () => {
    const user = userEvent.setup();
    render(<Examples />);
    const trigger = screen.getByRole('button', { name: 'Estado' });
    await user.hover(trigger);
    const tooltip = await screen.findByRole('tooltip');
    const content = tooltip;

    // jsdom no calcula cajas. Solo se fija esa frontera; Radix calcula y recorre su polígono real.
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 160, width: 32, height: 32 }),
    );
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 70, y: 90, width: 180, height: 60 }),
    );

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse', clientX: 116, clientY: 160 });
    fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 140, clientY: 154 });
    expect(tooltip).toBeInTheDocument();
    fireEvent.pointerMove(content, { pointerType: 'mouse', clientX: 220, clientY: 140 });
    expect(tooltip).toBeInTheDocument();

    fireEvent.pointerLeave(content, { pointerType: 'mouse', clientX: 230, clientY: 150 });
    fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 180, clientY: 155 });
    expect(tooltip).toBeInTheDocument();
    fireEvent.pointerMove(trigger, { pointerType: 'mouse', clientX: 116, clientY: 175 });
    expect(tooltip).toBeInTheDocument();

    fireEvent.pointerLeave(trigger, { pointerType: 'mouse', clientX: 116, clientY: 160 });
    fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 400, clientY: 300 });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('abre con foco, describe el disparador y cierra con Escape sin mover el foco', async () => {
    const user = userEvent.setup();
    const { baseElement } = render(<Examples touch />);
    const trigger = screen.getByRole('button', { name: 'Estado' });

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription('Texto disponible');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Los landmarks pertenecen a la ruta. Este componente aislado incluye un portal en body.
    expect(await axe(baseElement, { rules: { region: { enabled: false } } })).toHaveNoViolations();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).not.toHaveAttribute('aria-describedby');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Compartido' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Compartido con la comunidad');
    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('alterna una ayuda informativa al tocar y la cierra al tocar fuera', async () => {
    const user = userEvent.setup();
    render(<Examples touch />);
    const trigger = screen.getByRole('button', { name: 'Estado' });

    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Texto disponible');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.pointer({
      keys: '[TouchA]',
      target: screen.getByRole('button', { name: 'Siguiente' }),
    });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('al tocar otra ayuda sustituye la anterior y no deja dos abiertas', async () => {
    const user = userEvent.setup();
    render(<Examples touch />);

    await user.pointer({
      keys: '[TouchA]',
      target: screen.getByRole('button', { name: 'Estado' }),
    });
    await user.pointer({
      keys: '[TouchA]',
      target: screen.getByRole('button', { name: 'Compartido' }),
    });
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Compartido con la comunidad');
    expect(screen.getByRole('button', { name: 'Estado' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('conserva la activación táctil y de ratón de los botones con acciones', async () => {
    const user = userEvent.setup();
    const activations: boolean[] = [];
    render(
      <TooltipProvider>
        <Tooltip content="Abrir el manual">
          <button type="button" onClick={(event) => activations.push(event.defaultPrevented)}>
            Abrir
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir' });

    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(activations).toEqual([false]);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).not.toHaveAttribute('aria-expanded');

    await user.click(trigger);
    expect(activations).toEqual([false, false]);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('reserva el primer toque para consultar y permite abrir con el segundo', async () => {
    const user = userEvent.setup();
    const activations: boolean[] = [];
    render(
      <TooltipProvider>
        <Tooltip content="Reglas base" touch="confirm" touchHint="Toca de nuevo para abrir">
          <button type="button" onClick={(event) => activations.push(event.defaultPrevented)}>
            Abrir
          </button>
        </Tooltip>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir' });

    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Reglas base');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Toca de nuevo para abrir');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(activations).toEqual([true]);
    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(activations).toEqual([true, false]);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // La indicación de repetir el toque no corresponde al ratón ni al teclado.
    await user.click(trigger);
    expect(activations).toEqual([true, false, false]);
    await user.unhover(trigger);
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).not.toHaveTextContent('Toca de nuevo');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(activations).toEqual([true, false, false, false]);

    // Al cerrar, la próxima pulsación táctil vuelve a mostrar los detalles.
    await user.pointer({ keys: '[TouchA]', target: trigger });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Toca de nuevo para abrir');
    expect(activations).toEqual([true, false, false, false, true]);
  });
});
