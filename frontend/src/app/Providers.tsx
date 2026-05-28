import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster, toast } from 'sonner';
import { ThemeProvider } from './theme';
import { onStorageWriteFail } from '@/shared/lib/storage';

type Props = Readonly<{ children: ReactNode }>;

/**
 * Crea un único QueryClient para toda la app.
 * (Equivalente al singleton `httpx.AsyncClient` que el backend gestiona via lifespan).
 *
 * - retry: 1 (los 502/504 ya los re-disparamos manualmente con UX feedback).
 * - staleTime 30s: evita refetch agresivo cuando se navega entre rutas.
 * - networkMode 'always': la PWA puede tener cache aunque la red esté caída.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        networkMode: 'always',
      },
      mutations: {
        retry: 0,
        networkMode: 'always',
      },
    },
  });
}

/**
 * Composición de providers globales.
 * Orden importa: Theme va fuera para que QueryClient y Toaster
 * puedan leer las CSS variables si necesitan.
 */
export function Providers({ children }: Props) {
  // useState para garantizar que el cliente se crea UNA sola vez,
  // incluso con StrictMode doble-render.
  const [queryClient] = useState(createQueryClient);

  // Suscripción global a fallos de escritura en localStorage — muestra
  // un toast accionable cuando se llena la cuota.  Catálogo bug #12.
  useEffect(
    () =>
      onStorageWriteFail((reason) => {
        if (reason === 'quota') {
          toast.warning('Espacio local agotado', {
            id: 'storage-quota',
            description:
              'Borra algún manual en Ajustes → Borrar historial para liberar espacio.',
            duration: 8000,
          });
        } else if (reason === 'denied') {
          toast.warning('No podemos guardar localmente', {
            id: 'storage-denied',
            description:
              'Tu navegador bloquea el almacenamiento (modo privado o cookies desactivadas).',
            duration: 8000,
          });
        }
      }),
    [],
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        {/*
          Toaster global — config explícita en lugar de defaults:
          - position 'top-center': anclaje predecible en móvil; no choca con el
            sticky composer del chat (que vive abajo).
          - visibleToasts={3}: cota dura para evitar que una ráfaga de
            errores (ej. 4 mutations paralelas que fallan) apile 10 toasts
            que tapan la pantalla.  Sonner colapsa el resto en una pila.
          - duration por defecto 5000 ms: equilibrio entre tiempo de lectura
            y no estorbar. Los toasts críticos (storage quota, errores) se
            sobrescriben puntualmente con duración mayor.
          - theme="system" + richColors: contraste WCAG AA en light y dark.
          - gap 8: separación visual entre toasts apilados.
        */}
        <Toaster
          position="top-center"
          richColors
          closeButton
          theme="system"
          visibleToasts={3}
          duration={5000}
          gap={8}
          toastOptions={{
            classNames: {
              toast: 'mn-toast',
            },
          }}
        />
        {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-right" />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
