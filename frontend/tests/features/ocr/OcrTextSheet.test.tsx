import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrTextSheet } from '@/features/ocr/OcrTextSheet';
import type { OcrLine } from '@/shared/lib/storage';

const LINES: OcrLine[] = [
  { text: 'Línea 1', confidence: 0.95 },
  { text: 'Línea 2', confidence: 0.7 },
];

describe('OcrTextSheet', () => {
  it('cerrado (open=false) no renderiza nada accesible', () => {
    render(<OcrTextSheet open={false} onOpenChange={() => undefined} lines={LINES} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abierto muestra título y subtítulo', async () => {
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(await screen.findByText(/Texto extraído del manual/i)).toBeInTheDocument();
    expect(screen.getByText(/Lo que leyó el OCR/i)).toBeInTheDocument();
  });

  it('por defecto muestra el texto plano con las líneas', async () => {
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    const plain = await screen.findByTestId('ocr-plain-view');
    expect(plain.textContent).toContain('Línea 1');
    expect(plain.textContent).toContain('Línea 2');
  });

  it('permite cambiar a la vista por líneas', async () => {
    const user = userEvent.setup();
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    await user.click(await screen.findByRole('radio', { name: /Por líneas/i }));
    expect(screen.getByTestId('ocr-lines-view').textContent).toContain('Línea 1');
  });

  it('expone dos controles de cierre: X del header y "Cerrar" en la barra', () => {
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(screen.getAllByRole('button', { name: /Cerrar/i }).length).toBeGreaterThanOrEqual(2);
  });

  it('pulsar la X del header dispara onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<OcrTextSheet open onOpenChange={onOpenChange} lines={LINES} />);
    await user.click(screen.getAllByRole('button', { name: /Cerrar/i })[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pulsar "Cerrar" de la barra inferior también cierra', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<OcrTextSheet open onOpenChange={onOpenChange} lines={LINES} />);
    const closers = screen.getAllByRole('button', { name: /Cerrar/i });
    await user.click(closers[closers.length - 1]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renderiza la nota informativa sobre uso por el LLM', async () => {
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(await screen.findByText(/El LLM usó este texto/i)).toBeInTheDocument();
  });

  it('lista vacía degrada a "—"', async () => {
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={[]} />);
    expect((await screen.findByTestId('ocr-plain-view')).textContent).toBe('—');
  });
});
