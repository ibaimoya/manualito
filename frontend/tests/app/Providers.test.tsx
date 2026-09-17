import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Providers } from '@/app/Providers';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  vi.restoreAllMocks();
});

function QueryProbe() {
  const { data } = useQuery({
    queryKey: ['probe'],
    queryFn: () => Promise.resolve('hola'),
  });
  return <p>{data ?? 'loading'}</p>;
}

describe('Providers', () => {
  it('provee QueryClient y renderiza los hijos que lo consumen', async () => {
    render(
      <Providers>
        <QueryProbe />
      </Providers>,
    );
    expect(await screen.findByText('hola')).toBeInTheDocument();
  });

  it('un toast global se renderiza dentro del árbol de Providers', async () => {
    render(<Providers>{null}</Providers>);
    act(() => {
      toast('mensaje de prueba');
    });
    expect(await screen.findByText('mensaje de prueba')).toBeInTheDocument();
  });

  it('el Toaster sigue el tema de la app, no el del SO', async () => {
    localStorage.setItem('manualito.settings', JSON.stringify({ mode: 'dark', accent: 'amber' }));
    render(<Providers>{null}</Providers>);
    act(() => {
      toast('tema oscuro');
    });
    expect(await screen.findByText('tema oscuro')).toBeInTheDocument();
    expect(document.querySelector('[data-sonner-toaster]')).toHaveAttribute(
      'data-sonner-theme',
      'dark',
    );
  });

  it.each([
    ['QuotaExceededError', 'Espacio local agotado'],
    ['SecurityError', 'No podemos guardar localmente'],
  ])('un fallo de Storage %s muestra el aviso correspondiente', async (name, title) => {
    render(<Providers>{null}</Providers>);
    // Storage es una frontera del navegador que puede rechazar la escritura.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('forced', name);
    });
    act(() => {
      storage.writeSettings({ mode: 'dark', accent: 'amber' });
    });
    expect(await screen.findByText(title)).toBeInTheDocument();
  });
});
