import { type ReactNode, useEffect } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MailCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import { AuthShell } from '@/features/auth/auth-shell';
import { AuthStatus } from '@/features/auth/auth-status';

/** Ruta neutral: aterriza desde el enlace del email y verifica al montar. */
export const Route = createFileRoute('/verify-email')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: VerifyEmailScreen,
});

function VerifyEmailScreen() {
  const { token } = Route.useSearch();
  const queryClient = useQueryClient();
  // Como query (no useEffect): se ejecuta una sola vez y es segura ante el
  // doble render de StrictMode (el token es de un solo uso).
  const { isError, isPending, isSuccess } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: () => authApi.verifyEmail(token ?? ''),
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (isSuccess) {
      void queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY });
    }
  }, [isSuccess, queryClient]);

  let content: ReactNode;
  if (!token || isError) {
    content = (
      <AuthStatus
        tone="error"
        icon={ShieldAlert}
        title="Enlace no válido"
        body="Puede que ya lo hayas usado o que haya caducado. Inicia sesión y reenvíalo desde el aviso."
      >
        <Button asChild size="lg" block>
          <Link to="/login">Volver a entrar</Link>
        </Button>
      </AuthStatus>
    );
  } else if (isPending) {
    content = (
      <AuthStatus
        tone="accent"
        icon={Mail}
        title="Verificando…"
        body="Un momento, estamos confirmando tu email."
      />
    );
  } else {
    content = (
      <AuthStatus
        tone="success"
        icon={MailCheck}
        title="¡Email verificado!"
        body="Tu cuenta está lista. Vamos a aprender tu primer juego."
      >
        <Button asChild size="lg" block>
          <Link to="/home">Continuar</Link>
        </Button>
      </AuthStatus>
    );
  }

  return <AuthShell>{content}</AuthShell>;
}
