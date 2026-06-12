import { type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster, toast } from 'sonner';
import { ThemeProvider, useTheme } from './theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { onStorageWriteFail } from '@/shared/lib/storage';

type Props = Readonly<{ children: ReactNode }>;

/**
 * Único QueryClient de la app.
 * - retry: 1 (los 502/504 ya se re-disparan manualmente con UX feedback).
 * - staleTime 30s: evita refetch agresivo al navegar entre rutas.
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

/** Providers globales. Theme va fuera: el Toaster necesita leer el modo. */
/**
 * El Toaster sigue el tema de Ajustes (con "system" ignoraría el modo forzado).
 * Arriba para no chocar con el composer del chat; máximo 3 toasts a la vez.
 */
function AppToaster() {
  const { mode } = useTheme();
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      theme={mode === 'auto' ? 'system' : mode}
      visibleToasts={3}
      duration={5000}
      gap={8}
    />
  );
}

export function Providers({ children }: Props) {
  // useState: un único cliente aunque StrictMode doble el render.
  const [queryClient] = useState(createQueryClient);

  // Toast accionable cuando localStorage se queda sin cuota.
  useEffect(
    () =>
      onStorageWriteFail((reason) => {
        if (reason === 'quota') {
          toast.warning('Espacio local agotado', {
            id: 'storage-quota',
            description:
              'Libera espacio desde Ajustes → Borrar datos locales.',
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
        <TooltipProvider>{children}</TooltipProvider>
        <AppToaster />
        {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-right" />}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
