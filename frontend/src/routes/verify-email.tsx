import { type ReactNode, useEffect } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import { AuthShell } from '@/features/auth/auth-shell';
import { AuthStatus } from '@/features/auth/auth-status';
import { VerificationEnvelope, type VerificationState } from '@/features/auth/VerificationEnvelope';
import { ApiError } from '@/shared/api/http';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';

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
  const { error, errorUpdatedAt, isFetching, isPending, isSuccess, refetch } = useQuery({
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
  let verificationState: VerificationState;
  if (!token || isInvalidVerificationLink(error)) {
    verificationState = 'invalid';
    content = (
      <AuthStatus
        key="invalid"
        title={t('status.verify.invalid.title')}
        body={t('status.verify.invalid.body')}
      >
        <Button asChild className={recoveryStyles.primary}>
          <Link to="/login">{t('actions.backToLogin')}</Link>
        </Button>
      </AuthStatus>
    );
  } else if (errorUpdatedAt > 0 && !isSuccess) {
    verificationState = 'unavailable';
    // El fallo permanece visible durante el reintento, aunque la query vuelva a pending.
    content = (
      <AuthStatus
        key="unavailable"
        title={t('status.verify.unavailable.title')}
        body={t('status.verify.unavailable.body')}
      >
        <Button
          className={recoveryStyles.primary}
          loading={isFetching}
          onClick={() => void refetch({ cancelRefetch: false })}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {t('actions.retryVerification')}
        </Button>
        <Button asChild variant="secondary" className={recoveryStyles.secondary}>
          <Link to="/login">{t('actions.backToLogin')}</Link>
        </Button>
      </AuthStatus>
    );
  } else if (isPending) {
    verificationState = 'pending';
    content = (
      <AuthStatus
        key="pending"
        title={t('status.verify.pending.title')}
        body={t('status.verify.pending.body')}
      />
    );
  } else {
    verificationState = 'verified';
    content = (
      <AuthStatus
        key="success"
        title={t('status.verify.success.title')}
        body={t('status.verify.success.body')}
      >
        <Button asChild className={recoveryStyles.primary}>
          <Link to="/home">{t('actions.continue')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  return (
    <AuthShell illustration={<VerificationEnvelope state={verificationState} />}>
      {content}
    </AuthShell>
  );
}

function isInvalidVerificationLink(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 400 ||
      error.status === 422 ||
      error.view.code === 'email_verification_token_invalid')
  );
}
