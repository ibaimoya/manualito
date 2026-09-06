import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariantD } from '@/features/manual/lab/VariantD';
import { VariantE } from '@/features/manual/lab/VariantE';
import { VariantF } from '@/features/manual/lab/VariantF';

const props = {
  escenario: 'base',
  initialPage: 1,
  showConfidence: false,
  seededQuery: '',
} as const;

afterEach(() => vi.restoreAllMocks());

describe('interacciones del laboratorio', () => {
  it('Escape desde edición confirma el descarte sin perder los controles', async () => {
    const user = userEvent.setup();
    render(<VariantD {...props} />);
    await user.click(screen.getByRole('button', { name: /^Editar$/ }));
    const editor = screen.getByRole('textbox', { name: /Editar el texto/ });
    await user.type(editor, ' texto nuevo');
    await user.keyboard('{Escape}');
    expect(screen.getByText('¿Descartar los cambios?')).toBeInTheDocument();
    expect(editor).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Editar el texto/ })).not.toBeInTheDocument(),
    );
  });

  it('permite elegir páginas desde el mazo y marca la página actual', async () => {
    const user = userEvent.setup();
    render(<VariantE {...props} />);
    const pages = within(screen.getByRole('navigation', { name: 'Mazo de hojas' })).getAllByRole(
      'button',
    );
    await user.click(pages[1]!);
    expect(pages[1]).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('article', { name: 'Texto de la hoja 2' })).toBeInTheDocument();
  });

  it('resalta y desplaza a una sola coincidencia exacta por ordinal en StrictMode', async () => {
    // jsdom no desplaza el viewport. Se observa el destino de la API de navegador.
    const scrolled: Element[] = [];
    const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: function (this: Element) {
        scrolled.push(this);
      },
    });
    try {
      const user = userEvent.setup();
      const { container } = render(
        <StrictMode>
          <VariantF {...props} seededQuery="refugio" />
        </StrictMode>,
      );
      const matches = [...container.querySelectorAll<HTMLElement>('mark[data-search-match]')];
      expect(matches.length).toBeGreaterThan(2);
      expect(container.querySelectorAll('mark.bg-accent')).toHaveLength(1);
      expect(matches[0]).toHaveClass('bg-accent');

      await user.click(screen.getByRole('button', { name: 'Coincidencia siguiente' }));
      expect(scrolled.at(-1)).toBe(matches[1]);
      expect(matches[1]).toHaveClass('bg-accent');
      expect(matches[0]).not.toHaveClass('bg-accent');
      expect(container.querySelectorAll('mark.bg-accent')).toHaveLength(1);
    } finally {
      if (previous) Object.defineProperty(Element.prototype, 'scrollIntoView', previous);
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });
});
