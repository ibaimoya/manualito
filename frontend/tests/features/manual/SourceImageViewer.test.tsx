import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SourceImageViewer } from '@/features/manual/SourceImageViewer';
import type { ManualDetailPage } from '@/shared/api/client';

const page: ManualDetailPage = {
  page_number: 1,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'ok',
  dedup_status: 'none',
  image_available: true,
  image_width: 800,
  image_height: 1200,
  ocr_confidence_mean: 0.98,
  ocr_lines: [{ text: 'Reparte las cartas.', confidence: 0.98 }],
};

afterEach(() => vi.restoreAllMocks());

function openMeasuredImage() {
  // jsdom no calcula tamaños. El visor y sus controles de zoom se ejecutan sin sustituirlos.
  const matchMedia = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    ...matchMedia(query),
    matches: query === '(prefers-reduced-motion: reduce)',
  }));
  render(<SourceImageViewer imageUrl="/page-1.png" title="Cartas" page={page} />, {
    wrapper: TooltipProvider,
  });
  const canvas = screen.getByRole('region');
  const image = screen.getByRole('img', { name: 'Página 1 de Cartas' });
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
  });
  Object.defineProperties(image.parentElement!, {
    offsetWidth: { configurable: true, value: 800 },
    offsetHeight: { configurable: true, value: 1200 },
  });
  fireEvent.load(image);
  return { canvas, zoom: screen.getByRole('status', { name: 'Zoom de imagen' }) };
}

describe('imagen original del manual', () => {
  it('ajusta la página, el ancho y el tamaño original con el visor real', async () => {
    const user = userEvent.setup();
    const { zoom } = openMeasuredImage();
    await waitFor(() => expect(zoom).toHaveTextContent('50%'));
    await user.click(screen.getByRole('button', { name: 'Ajustar al ancho' }));
    expect(zoom).toHaveTextContent('100%');
    expect(screen.getByRole('button', { name: 'Ajustar al ancho' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Acercar imagen' }));
    expect(zoom).toHaveTextContent('120%');
    expect(screen.getByRole('button', { name: 'Ajustar al ancho' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Alejar imagen' }));
    expect(zoom).toHaveTextContent('100%');
    await user.click(screen.getByRole('button', { name: 'Página completa' }));
    expect(zoom).toHaveTextContent('50%');
    await user.click(screen.getByRole('button', { name: 'Tamaño real' }));
    expect(zoom).toHaveTextContent('100%');
  });

  it('amplía con doble clic y recupera el encuadre con el teclado', async () => {
    const { canvas, zoom } = openMeasuredImage();
    await waitFor(() => expect(zoom).toHaveTextContent('50%'));
    fireEvent.doubleClick(canvas, { clientX: 200, clientY: 150 });
    expect(zoom).toHaveTextContent('75%');
    fireEvent.keyDown(canvas, { key: '0', ctrlKey: true });
    expect(zoom).toHaveTextContent('75%');
    fireEvent.keyDown(canvas, { key: '0' });
    expect(zoom).toHaveTextContent('50%');
    expect(screen.getByRole('button', { name: 'Página completa' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('mantiene los controles deshabilitados hasta que la imagen está disponible', () => {
    const { container } = render(
      <SourceImageViewer imageUrl="/page-1.png" title="Cartas" page={page} />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByRole('status', { name: 'Cargando imagen…' })).toHaveTextContent(
      'Cargando imagen',
    );
    expect(screen.getByRole('button', { name: 'Acercar imagen' })).toBeDisabled();

    // jsdom no descarga imágenes ni calcula su geometría. Los gestos se verifican en navegador.
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.load(image!);
    expect(screen.queryByRole('status', { name: 'Cargando imagen…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acercar imagen' })).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Página 1 de Cartas' })).toBeVisible();
  });

  it('permite reintentar una carga fallida sin confundirla con una imagen inexistente', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SourceImageViewer imageUrl="/page-1.png" title="Cartas" page={page} />,
      { wrapper: TooltipProvider },
    );
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('No se ha podido cargar la imagen')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(screen.getByRole('status', { name: 'Cargando imagen…' })).toHaveTextContent(
      'Cargando imagen',
    );
    fireEvent.load(container.querySelector('img')!);
    expect(screen.queryByRole('button', { name: 'Volver a intentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acercar imagen' })).toBeEnabled();
  });

  it('abre una sesión nueva al cambiar de página después de una carga fallida', () => {
    const { container, rerender } = render(
      <SourceImageViewer imageUrl="/page-1.png" title="Cartas" page={page} />,
      { wrapper: TooltipProvider },
    );
    const previousImage = container.querySelector('img')!;
    fireEvent.error(previousImage);
    rerender(
      <SourceImageViewer
        imageUrl="/page-2.png"
        title="Cartas"
        page={{ ...page, page_number: 2 }}
      />,
    );
    expect(screen.getByRole('status', { name: 'Cargando imagen…' })).toHaveTextContent(
      'Cargando imagen',
    );
    fireEvent.load(previousImage);
    expect(screen.getByRole('button', { name: 'Acercar imagen' })).toBeDisabled();
    fireEvent.load(container.querySelector('img')!);
    expect(screen.getByRole('img', { name: 'Página 2 de Cartas' })).toBeVisible();
  });

  it('explica que no hay imagen sin ofrecer un reintento que no puede funcionar', () => {
    render(
      <SourceImageViewer
        imageUrl="/page-1.png"
        title="Cartas"
        page={{ ...page, image_available: false }}
      />,
      { wrapper: TooltipProvider },
    );
    expect(screen.getByText('La imagen no está disponible')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Cargando imagen…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Volver a intentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acercar imagen' })).toBeDisabled();
  });
});
