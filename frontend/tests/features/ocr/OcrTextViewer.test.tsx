import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { OcrTextViewer } from '@/features/ocr/OcrTextViewer';
import type { OcrLine } from '@/shared/lib/storage';

const SAMPLE: OcrLine[] = [
  { text: 'CATAN — REGLAS DEL JUEGO', confidence: 0.98 },
  { text: '', confidence: 1.0 },
  { text: 'Preparación inicial.', confidence: 0.72 },
  { text: 'Texto borroso difícil.', confidence: 0.31 },
];

afterEach(() => {
  vi.useRealTimers();
});

/** Cambia a la vista "Por líneas" como lo haría el usuario. */
async function switchToLines(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('radio', { name: 'Por líneas' }));
  return screen.findByTestId('ocr-lines-view');
}

describe('OcrTextViewer', () => {
  describe('vista por defecto + cambio entre vistas', () => {
    it('renderiza "plain" por defecto con todas las líneas concatenadas por \\n', () => {
      render(<OcrTextViewer lines={SAMPLE} />);
      const pre = screen.getByTestId('ocr-plain-view');
      // Las líneas vacías también aparecen como salto extra (el shape
      // del bundle preserva los huecos del manual original).
      expect(pre.textContent).toBe(
        'CATAN — REGLAS DEL JUEGO\n\nPreparación inicial.\nTexto borroso difícil.',
      );
    });

    it('al cambiar al segmento "Por líneas" muestra LinesView con #001..#NNN', async () => {
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} />);
      // El numerador salta líneas en blanco — 3 líneas reales, no 4.
      const linesView = await switchToLines(user);
      expect(linesView.textContent).toContain('#001');
      expect(linesView.textContent).toContain('#002');
      expect(linesView.textContent).toContain('#003');
      expect(linesView.textContent).not.toContain('#004');
    });
  });

  describe('badges de confidence', () => {
    it('mapea confidence ≥ 0.85 a tono success, 0.5-0.85 a warning, < 0.5 a error', async () => {
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} />);
      await switchToLines(user);
      // Los badges renderizan el porcentaje como label; localizamos por
      // texto y comprobamos la clase de tone.
      expect(screen.getByText('98%').className).toMatch(/success/);
      expect(screen.getByText('72%').className).toMatch(/warning/);
      expect(screen.getByText('31%').className).toMatch(/error/);
    });

    it('muestra s/c cuando la linea viene de texto PDF sin confidence', async () => {
      const user = userEvent.setup();
      render(<OcrTextViewer lines={[{ text: 'Texto extraido del PDF', confidence: null }]} />);
      await switchToLines(user);
      expect(screen.getByText('s/c')).toBeInTheDocument();
    });

    it('una línea muestra confidence redondeada y se puede seleccionar/deseleccionar', async () => {
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} />);
      await switchToLines(user);
      const linea = screen.getByRole('button', { name: /Preparación inicial/i });
      expect(linea).toHaveAttribute('aria-pressed', 'false');
      await user.click(linea);
      expect(linea).toHaveAttribute('aria-pressed', 'true');
      await user.click(linea);
      expect(linea).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('action bar', () => {
    it('"Copiar todo" escribe el texto plano en el portapapeles', async () => {
      // user-event inyecta un stub de clipboard funcional en setup().
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} />);
      await user.click(screen.getByRole('button', { name: /Copiar todo/i }));
      const copied = await navigator.clipboard.readText();
      expect(copied).toContain('CATAN');
      expect(copied).toContain('Preparación inicial');
      expect(copied).toContain('Texto borroso difícil');
    });

    it('tras copiar muestra "¡Copiado!" temporal y vuelve a "Copiar todo"', async () => {
      // Sin fake timers — el debounce de feedback es de 1500 ms, lo
      // dejamos correr en real time con waitFor + timeout amplio.
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} />);
      await user.click(screen.getByRole('button', { name: /Copiar todo/i }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /¡Copiado!/i })).toBeInTheDocument(),
      );
      await waitFor(
        () =>
          expect(
            screen.getByRole('button', { name: /Copiar todo/i }),
          ).toBeInTheDocument(),
        { timeout: 2500 },
      );
    });

    it('Cerrar dispara onClose', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} onClose={onClose} />);
      await user.click(screen.getByRole('button', { name: /Cerrar/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('casos límite', () => {
    it('muestra contador de líneas no-blank', () => {
      render(<OcrTextViewer lines={SAMPLE} />);
      // 3 líneas reales (la 2ª está en blanco).
      expect(screen.getByText(/3 líneas/)).toBeInTheDocument();
    });

    it('singular "1 línea" cuando solo hay una', () => {
      render(<OcrTextViewer lines={[{ text: 'Solo una', confidence: 0.9 }]} />);
      expect(screen.getByText(/1 línea(?! s)/)).toBeInTheDocument();
    });

    it('lista vacía no rompe — muestra "—" en plain view', () => {
      render(<OcrTextViewer lines={[]} />);
      expect(screen.getByTestId('ocr-plain-view').textContent).toBe('—');
    });
  });

  it('pasa axe a11y', async () => {
    const { container } = render(<OcrTextViewer lines={SAMPLE} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
