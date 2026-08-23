import { type ReactNode, useEffect, useState } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useTranslation } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import { LanguageProvider } from './language';
import { ThemeProvider, useTheme } from './theme';
import { TooltipProvider } from '@/components/ui/tooltip';
import { handleSessionExpired } from '@/features/auth/session-expired';
import { onStorageWriteFail } from '@/shared/lib/storage';

type Props = Readonly<{ children: ReactNode }>;

/**
 * Único QueryClient de la app.
 * - retry: 1 (los 502/504 ya se re-disparan manualmente con UX feedback).
 * - staleTime 30s: evita refetch agresivo al navegar entre rutas.
 * - networkMode 'always': la PWA puede tener cache aunque la red esté caída.
 * - onError global: un 401 de sesión caducada echa al login desde cualquier sitio.
 */
function createQueryClient(): QueryClient {
  const onError = (error: unknown): void => handleSessionExpired(error, client);
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
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
  return client;
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
  const { t } = useTranslation('shell');

  // useState: un único cliente aunque StrictMode doble el render.
  const [queryClient] = useState(createQueryClient);

  // Toast accionable cuando localStorage se queda sin cuota.
  useEffect(
    () =>
      onStorageWriteFail((reason) => {
        if (reason === 'quota') {
          toast.warning(t('storage.quota.title'), {
            id: 'storage-quota',
            description: t('storage.quota.description'),
            duration: 8000,
          });
        } else if (reason === 'denied') {
          toast.warning(t('storage.denied.title'), {
            id: 'storage-denied',
            description: t('storage.denied.description'),
            duration: 8000,
          });
        }
      }),
    [t],
  );

  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{children}</TooltipProvider>
          <AppToaster />
          {import.meta.env.DEV && <ReactQueryDevtools buttonPosition="bottom-right" />}
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
