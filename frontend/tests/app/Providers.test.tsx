import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Providers } from '@/app/Providers';
import { storage } from '@/shared/lib/storage';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  // Restaurar el prototype de Storage por si lo monkey-patcheamos en un test.
  if (storageProtoBackup) {
    Object.defineProperty(Storage.prototype, 'setItem', storageProtoBackup);
    storageProtoBackup = null;
  }
});

// Backup del descriptor para poder restaurar el setItem original tras monkey-patch.
let storageProtoBackup: PropertyDescriptor | null = null;

function failNextSetItemWith(name: string): void {
  storageProtoBackup = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')!;
  Object.defineProperty(Storage.prototype, 'setItem', {
    configurable: true,
    writable: true,
    value: () => {
      throw new DOMException('forced', name);
    },
  });
}

/**
 * Componente probe que usa useQuery para confirmar que el QueryClient
 * está en context (si no estuviera, useQuery lanzaría).
 */
function QueryProbe() {
  const q = useQuery({
    queryKey: ['probe'],
    queryFn: () => Promise.resolve('hola'),
  });
  return <p data-testid="probe">{q.data ?? 'loading'}</p>;
}

describe('Providers', () => {
  it('renderiza los children dentro del árbol', () => {
    render(
      <Providers>
        <p>contenido hijo</p>
      </Providers>,
    );
    expect(screen.getByText('contenido hijo')).toBeInTheDocument();
  });

  it('provee QueryClient → useQuery funciona dentro', async () => {
    render(
      <Providers>
        <QueryProbe />
      </Providers>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('hola');
    });
  });

  it('Toaster activo: un toast() global se renderiza dentro del árbol de Providers', async () => {
    // Sonner monta el portal de toasts lazy: solo aparece al primer toast.
    render(
      <Providers>
        <p>x</p>
      </Providers>,
    );
    toast('mensaje de prueba');
    await waitFor(() => {
      expect(screen.getByText('mensaje de prueba')).toBeInTheDocument();
    });
  });

  it('el Toaster sigue el tema de la app, no el del SO', async () => {
    localStorage.setItem(
      'manualito.settings',
      JSON.stringify({ mode: 'dark', accent: 'amber' }),
    );
    render(
      <Providers>
        <p>x</p>
      </Providers>,
    );
    toast('tema oscuro');
    await waitFor(() => {
      expect(screen.getByText('tema oscuro')).toBeInTheDocument();
    });
    const toaster = document.querySelector('[data-sonner-toaster]');
    expect(toaster).toHaveAttribute('data-sonner-theme', 'dark');
  });

  it('cuota llena → muestra toast "Espacio local agotado" con descripción accionable', async () => {
    // El listener del Providers se ejecuta tras montar.  Simulamos un fallo
    // de escritura "quota" parchando Storage.prototype.setItem (vi.spyOn no
    // funciona porque setItem está en el prototype, no en la instancia).
    render(
      <Providers>
        <p data-testid="ready">x</p>
      </Providers>,
    );
    await screen.findByTestId('ready');
    await new Promise((r) => setTimeout(r, 0));

    failNextSetItemWith('QuotaExceededError');
    storage.upsertManual({
      manual_id: 'x',
      name: 'X',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 1,
    });

    await waitFor(() => {
      expect(screen.getByText(/Espacio local agotado/)).toBeInTheDocument();
    });
  });

  it('cookies/privado bloquea storage → toast "No podemos guardar localmente"', async () => {
    render(
      <Providers>
        <p data-testid="ready">x</p>
      </Providers>,
    );
    await screen.findByTestId('ready');
    await new Promise((r) => setTimeout(r, 0));

    failNextSetItemWith('SecurityError');
    storage.upsertManual({
      manual_id: 'y',
      name: 'Y',
      created_at: '2026-05-26T10:00:00.000Z',
      last_opened_at: '2026-05-26T10:00:00.000Z',
      chunks_indexed: 1,
    });

    await waitFor(() => {
      expect(
        screen.getByText(/No podemos guardar localmente/),
      ).toBeInTheDocument();
    });
  });
});
