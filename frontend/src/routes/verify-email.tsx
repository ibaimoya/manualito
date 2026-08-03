import { type ReactNode, useEffect } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MailCheck, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
  const { token } = Route.useSearch();
  const queryClient = useQueryClient();
  // Query, no useEffect: una sola ejecución pese al doble render de StrictMode.
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
      queryClient.invalidateQueries({ queryKey: AUTH_ME_KEY }).catch(() => undefined);
    }
  }, [isSuccess, queryClient]);

  let content: ReactNode;
  if (!token || isError) {
    content = (
      <AuthStatus
        tone="error"
        icon={ShieldAlert}
        title={t('status.verify.invalid.title')}
        body={t('status.verify.invalid.body')}
      >
        <Button asChild size="lg" block>
          <Link to="/login">{t('actions.backToLogin')}</Link>
        </Button>
      </AuthStatus>
    );
  } else if (isPending) {
    content = (
      <AuthStatus
        tone="accent"
        icon={Mail}
        title={t('status.verify.pending.title')}
        body={t('status.verify.pending.body')}
      />
    );
  } else {
    content = (
      <AuthStatus
        tone="success"
        icon={MailCheck}
        title={t('status.verify.success.title')}
        body={t('status.verify.success.body')}
      >
        <Button asChild size="lg" block>
          <Link to="/home">{t('actions.continue')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  return <AuthShell>{content}</AuthShell>;
}
