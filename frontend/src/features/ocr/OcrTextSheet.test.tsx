import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OcrTextSheet } from './OcrTextSheet';
import type { OcrLine } from '@/shared/lib/storage';

/**
 * `useNamedMediaQuery('desktop')` lee `matchMedia('(min-width: 768px)')`.
 * En jsdom el default es false (no desktop), así que por defecto el wrapper
 * monta Sheet. Para el caso desktop mockeamos el hook globalmente.
 */
const mockIsDesktop = vi.fn<[], boolean>(() => false);
vi.mock('@/shared/hooks/useMediaQuery', () => ({
  useNamedMediaQuery: () => mockIsDesktop(),
}));

const LINES: OcrLine[] = [
  { text: 'Línea 1', confidence: 0.95 },
  { text: 'Línea 2', confidence: 0.7 },
];

describe('OcrTextSheet', () => {
  it('cerrado (open=false) no renderiza nada accesible', () => {
    mockIsDesktop.mockReturnValue(false);
    render(
      <OcrTextSheet open={false} onOpenChange={() => undefined} lines={LINES} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('en móvil monta un Sheet con título y subtítulo', async () => {
    mockIsDesktop.mockReturnValue(false);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(
      await screen.findByText(/Texto original del manual/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Lo que ha leído el OCR/i),
    ).toBeInTheDocument();
  });

  it('en desktop monta un Dialog con el mismo título', async () => {
    mockIsDesktop.mockReturnValue(true);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(
      await screen.findByText(/Texto original del manual/i),
    ).toBeInTheDocument();
  });

  it('renderiza el OcrTextViewer dentro con las líneas pasadas', async () => {
    mockIsDesktop.mockReturnValue(false);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    // defaultView="lines" → vemos las líneas numeradas.
    const linesView = await screen.findByTestId('ocr-lines-view');
    expect(linesView.textContent).toContain('Línea 1');
    expect(linesView.textContent).toContain('Línea 2');
  });

  it('expone DOS controles de cierre: X del header y "Cerrar" en bottom bar', () => {
    mockIsDesktop.mockReturnValue(false);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    // El header del Sheet (Radix Dialog.Close) usa aria-label="Cerrar"
    // y el OcrTextViewer en variant='embedded' añade un botón con
    // texto visible "Cerrar".  Ambos deben coexistir.
    const closers = screen.getAllByRole('button', { name: /Cerrar/i });
    expect(closers.length).toBeGreaterThanOrEqual(2);
  });

  it('pulsar la X del header dispara onOpenChange(false)', async () => {
    mockIsDesktop.mockReturnValue(false);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<OcrTextSheet open onOpenChange={onOpenChange} lines={LINES} />);
    const [headerX] = screen.getAllByRole('button', { name: /Cerrar/i });
    await user.click(headerX!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pulsar el botón "Cerrar" de la bottom bar también cierra', async () => {
    mockIsDesktop.mockReturnValue(false);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<OcrTextSheet open onOpenChange={onOpenChange} lines={LINES} />);
    const closers = screen.getAllByRole('button', { name: /Cerrar/i });
    const bottomCerrar = closers[closers.length - 1];
    await user.click(bottomCerrar!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renderiza la nota informativa sobre uso por el LLM', async () => {
    mockIsDesktop.mockReturnValue(false);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={LINES} />);
    expect(
      await screen.findByText(/El LLM ha usado este texto/i),
    ).toBeInTheDocument();
  });

  it('lista vacía no rompe — el viewer interior degrada a "—"', async () => {
    mockIsDesktop.mockReturnValue(false);
    render(<OcrTextSheet open onOpenChange={() => undefined} lines={[]} />);
    // Como defaultView="lines" en el wrapper, pero con lines=[] no hay
    // líneas reales que mostrar.  Cambiamos a plain para ver el "—".
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Texto plano/i }));
    expect(screen.getByTestId('ocr-plain-view').textContent).toBe('—');
  });
});
