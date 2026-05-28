import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renderiza con texto', () => {
    render(<Button>Hola</Button>);
    expect(screen.getByRole('button', { name: 'Hola' })).toBeInTheDocument();
  });

  it('dispara onClick', async () => {
    const user = userEvent.setup();
    let clicked = 0;
    render(<Button onClick={() => clicked++}>Pulsa</Button>);
    await user.click(screen.getByRole('button', { name: 'Pulsa' }));
    expect(clicked).toBe(1);
  });

  it('no dispara cuando disabled', async () => {
    const user = userEvent.setup();
    let clicked = 0;
    render(
      <Button onClick={() => clicked++} disabled>
        Off
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(clicked).toBe(0);
  });

  it('soporta variantes destructive', () => {
    render(<Button variant="destructive">Borrar</Button>);
    const btn = screen.getByRole('button', { name: 'Borrar' });
    expect(btn.className).toMatch(/bg-error/);
  });

  it('size lg cumple touch target ≥ 44 px (h-14)', () => {
    render(<Button size="lg">Big</Button>);
    expect(screen.getByRole('button', { name: 'Big' }).className).toMatch(/h-14/);
  });

  it('asChild compone con Slot (link como botón)', () => {
    render(
      <Button asChild>
        <a href="/foo">Enlace</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Enlace' });
    expect(link).toHaveAttribute('href', '/foo');
  });

  it('pasa a11y axe en sus variantes', async () => {
    const { container } = render(
      <div>
        <Button>primary</Button>
        <Button variant="secondary">secondary</Button>
        <Button variant="ghost">ghost</Button>
        <Button variant="destructive">destructive</Button>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // ─── loading prop (refactor J1, bug #26) ────────────────────────────
  describe('loading', () => {
    it('marca aria-busy y disabled cuando loading', () => {
      render(<Button loading>Procesar</Button>);
      const btn = screen.getByRole('button', { name: /procesar/i });
      expect(btn).toHaveAttribute('aria-busy', 'true');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('data-loading', 'true');
    });

    it('no dispara onClick cuando loading', async () => {
      const user = userEvent.setup();
      let clicked = 0;
      render(
        <Button loading onClick={() => clicked++}>
          Subir
        </Button>,
      );
      await user.click(screen.getByRole('button', { name: /subir/i }));
      expect(clicked).toBe(0);
    });

    it('preserva el texto al pasar de idle a loading (ancho estable)', () => {
      // Patrón "spinner reemplaza icono, texto se mantiene" → la
      // anchura del botón no salta entre estados.  Validamos que el
      // texto sigue presente.
      const { rerender } = render(
        <Button>
          <Upload size={18} /> Procesar
        </Button>,
      );
      expect(screen.getByRole('button', { name: /procesar/i })).toBeInTheDocument();

      rerender(
        <Button loading>
          <Upload size={18} /> Procesar
        </Button>,
      );
      const btn = screen.getByRole('button', { name: /procesar/i });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });

    it('sin loading no expone aria-busy', () => {
      render(<Button>Idle</Button>);
      const btn = screen.getByRole('button', { name: /idle/i });
      expect(btn).not.toHaveAttribute('aria-busy');
      expect(btn).not.toHaveAttribute('data-loading');
    });

    it('asChild + loading degrada a aria-busy SIN spinner (Slot solo acepta 1 child)', () => {
      // Radix Slot requiere un único React child.  Si insertásemos
      // <Fragment spinner + texto> dentro de un <Link>, Slot lanzaría
      // "Slot expected only one child".  El Button detecta el combo
      // y suprime el spinner: el child mantiene su contenido y solo
      // recibe `aria-busy` / `data-loading` para semántica.
      render(
        <Button asChild loading>
          <a href="/foo">Enlace</a>
        </Button>,
      );
      const link = screen.getByRole('link', { name: /enlace/i });
      expect(link).toHaveAttribute('aria-busy', 'true');
      expect(link).toHaveAttribute('data-loading', 'true');
      expect(link.textContent).toBe('Enlace');
    });
  });
});
