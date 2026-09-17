import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { toast, Toaster } from 'sonner';
import i18n from '@/app/i18n';
import { ApiError } from '@/shared/api/http';
import { LiveTrans } from '@/shared/components/LiveTrans';
import { toastApiError } from '@/shared/lib/toastApiError';

afterEach(() => {
  toast.dismiss();
});

const fallback = {
  title: <LiveTrans ns="capture" i18nKey="feedback.unexpected.title" />,
  description: <LiveTrans ns="capture" i18nKey="feedback.unexpected.description" />,
  id: 'test-fallback',
};

describe('notificaciones de error', () => {
  it('retraduce el mismo error API visible sin volver a emitirlo ni mostrar el detalle remoto', async () => {
    render(<Toaster duration={Infinity} />);
    act(() => {
      toastApiError(
        new ApiError(503, { detail: 'Upstream connection failed' }),
        'test-api',
        fallback,
      );
    });
    const title = await screen.findByText('Servicio no disponible');
    const notification = title.closest('[data-sonner-toast]');
    expect(
      screen.getByText('El servidor está temporalmente fuera de servicio.'),
    ).toBeInTheDocument();

    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('Service unavailable').closest('[data-sonner-toast]')).toBe(
      notification,
    );
    expect(screen.getByText('The server is temporarily unavailable.')).toBeInTheDocument();
    expect(
      screen.queryByText('El servidor está temporalmente fuera de servicio.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Upstream connection failed')).not.toBeInTheDocument();

    await act(() => i18n.changeLanguage('es'));
    expect(screen.getByText('Servicio no disponible').closest('[data-sonner-toast]')).toBe(
      notification,
    );
    expect(
      screen.getByText('El servidor está temporalmente fuera de servicio.'),
    ).toBeInTheDocument();
  });

  it('retraduce también el fallback de un error no reconocido que ya estaba visible', async () => {
    render(<Toaster duration={Infinity} />);
    act(() => {
      toastApiError(new Error('Technical detail'), 'test-unknown', fallback);
    });
    expect(await screen.findByText('Error inesperado')).toBeInTheDocument();
    expect(screen.getByText('Vuelve a intentarlo en un momento.')).toBeInTheDocument();

    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Please try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText('Error inesperado')).not.toBeInTheDocument();
    expect(screen.queryByText('Technical detail')).not.toBeInTheDocument();
  });
});
