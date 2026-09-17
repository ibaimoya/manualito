import type { QueryClient } from '@tanstack/react-query';
import { createElement } from 'react';
import { toast } from 'sonner';
import { router } from '@/app/AppRouter';
import { LiveTrans } from '@/shared/components/LiveTrans';
import { ApiError } from '@/shared/api/http';
import { dropSessionCaches } from './auth-queries';

// Código estable de api/exceptions.py: la request no trae una sesión válida.
// "invalid_credentials" (login o contraseña actual mal escrita) NO entra aquí.
const SESSION_EXPIRED_CODE = 'authentication_required';

// Una pantalla con varias queries dispara N errores a la vez; basta una salida.
let redirecting = false;

/**
 * Handler global de sesión caducada, enganchado a los "onError" del QueryClient:
 * limpia las cachés de la cuenta y vuelve al login conservando la URL actual
 * para regresar tras autenticarse.
 */
export function handleSessionExpired(error: unknown, queryClient: QueryClient): void {
  if (!(error instanceof ApiError) || error.view.code !== SESSION_EXPIRED_CODE) return;
  if (redirecting || router.state.location.pathname === '/login') return;
  redirecting = true;

  toast.warning(createElement(LiveTrans, { ns: 'errors', i18nKey: 'session.expired.title' }), {
    id: 'session-expired',
    description: createElement(LiveTrans, { ns: 'errors', i18nKey: 'session.expired.description' }),
  });
  const redirect = router.state.location.href;
  dropSessionCaches(queryClient)
    .then(() => router.navigate({ to: '/login', search: { redirect } }))
    .catch(() => undefined)
    .finally(() => {
      redirecting = false;
    });
}
