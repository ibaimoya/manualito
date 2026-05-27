import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { OcrTextViewer } from './OcrTextViewer';
import type { OcrLine } from '@/shared/lib/storage';

const SAMPLE: OcrLine[] = [
  { text: 'CATAN — REGLAS DEL JUEGO', confidence: 0.98 },
  { text: '', confidence: 1.0 },
  { text: 'Preparación inicial.', confidence: 0.72 },
  { text: 'Texto borroso difícil.', confidence: 0.31 },
];

// Cleanup de timers entre tests.  No mockeamos `navigator.clipboard`
// porque `@testing-library/user-event` ya inyecta su propio polyfill
// al hacer `setup()` y entra en conflicto.  Validamos copia vía el
// callback público `onCopyAll`, no via el clipboard del DOM.
afterEach(() => {
  vi.useRealTimers();
});

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
      await user.click(screen.getByRole('radio', { name: 'Por líneas' }));
      // El numerador salta líneas en blanco — 3 líneas reales, no 4.
      const linesView = await screen.findByTestId('ocr-lines-view');
      expect(linesView.textContent).toContain('#001');
      expect(linesView.textContent).toContain('#002');
      expect(linesView.textContent).toContain('#003');
      expect(linesView.textContent).not.toContain('#004');
    });

    it('respeta defaultView="lines" inicial', () => {
      render(<OcrTextViewer lines={SAMPLE} defaultView="lines" />);
      expect(screen.getByTestId('ocr-lines-view')).toBeInTheDocument();
      expect(screen.queryByTestId('ocr-plain-view')).not.toBeInTheDocument();
    });
  });

  describe('badges de confidence', () => {
    it('mapea confidence ≥ 0.85 a tono success, 0.5-0.85 a warning, < 0.5 a error', () => {
      render(<OcrTextViewer lines={SAMPLE} defaultView="lines" />);
      // Los badges renderizan el porcentaje como label; localizamos por
      // texto y comprobamos la clase de tone.
      const badge98 = screen.getByText('98%');
      const badge72 = screen.getByText('72%');
      const badge31 = screen.getByText('31%');
      expect(badge98.className).toMatch(/success/);
      expect(badge72.className).toMatch(/warning/);
      expect(badge31.className).toMatch(/error/);
    });

    it('una línea muestra confidence redondeada y se puede seleccionar/deseleccionar', async () => {
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} defaultView="lines" />);
      const linea = screen.getByRole('button', { name: /Preparación inicial/i });
      expect(linea).toHaveAttribute('aria-pressed', 'false');
      await user.click(linea);
      expect(linea).toHaveAttribute('aria-pressed', 'true');
      await user.click(linea);
      expect(linea).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('action bar', () => {
    it('"Copiar todo" pasa el texto plano al callback', async () => {
      const onCopyAll = vi.fn();
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} onCopyAll={onCopyAll} />);
      await user.click(screen.getByRole('button', { name: /Copiar todo/i }));
      expect(onCopyAll).toHaveBeenCalledTimes(1);
      const passedText = onCopyAll.mock.calls[0]?.[0] as string;
      // Concatena por \n, sin las líneas en blanco (que aparecen como
      // saltos extra preservando el shape del documento original).
      expect(passedText).toContain('CATAN');
      expect(passedText).toContain('Preparación inicial');
      expect(passedText).toContain('Texto borroso difícil');
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

    it('variant="screen" muestra Save (.txt) y Create manual', () => {
      render(<OcrTextViewer lines={SAMPLE} variant="screen" />);
      expect(
        screen.getByRole('button', { name: /Guardar como \.txt/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Crear manual con este texto/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cerrar/i })).not.toBeInTheDocument();
    });

    it('variant="embedded" muestra Cerrar + dispara onClose', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(<OcrTextViewer lines={SAMPLE} variant="embedded" onClose={onClose} />);
      expect(
        screen.queryByRole('button', { name: /Guardar como \.txt/i }),
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Cerrar/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('meta y casos límite', () => {
    it('muestra contador de líneas no-blank y duración OCR formateada', () => {
      render(<OcrTextViewer lines={SAMPLE} meta={{ ocrDurationMs: 1800 }} />);
      // 3 líneas reales (la 2ª está en blanco) → "3 líneas · OCR 1.8s"
      expect(screen.getByText(/3 líneas/)).toBeInTheDocument();
      expect(screen.getByText(/OCR/)).toBeInTheDocument();
      expect(screen.getByText(/1\.8s/)).toBeInTheDocument();
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
    const { container } = render(<OcrTextViewer lines={SAMPLE} variant="embedded" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
