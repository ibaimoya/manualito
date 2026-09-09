import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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

describe('imagen original del manual', () => {
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
