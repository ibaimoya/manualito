import { type SyntheticEvent, useId, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { AuthShell } from '@/features/auth/auth-shell';
import { AuthStatus } from '@/features/auth/auth-status';
import { AuthAlert } from '@/features/auth/auth-alert';
import { MIN_PASSWORD, NewPasswordFields } from '@/features/auth/auth-controls';
import { mapApiError } from '@/shared/api/error-mapper';
import styles from '@/features/auth/entry.module.css';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';

/** Ruta neutral (con o sin sesión): se llega desde el enlace del email. */
export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordScreen,
});

function ResetPasswordScreen() {
  const { token } = Route.useSearch();
  return <AuthShell>{token ? <ResetForm token={token} /> : <InvalidLink />}</AuthShell>;
}

function InvalidLink() {
  const { t } = useTranslation('auth');
  return (
    <AuthStatus title={t('status.reset.invalid.title')} body={t('status.reset.invalid.body')}>
      <Button asChild className={recoveryStyles.primary}>
        <Link to="/forgot">{t('actions.requestAnotherLink')}</Link>
      </Button>
      <Button asChild variant="secondary" className={recoveryStyles.secondary}>
        <Link to="/login">{t('actions.backToLogin')}</Link>
      </Button>
    </AuthStatus>
  );
}

function ResetForm({ token }: Readonly<{ token: string }>) {
  const { t } = useTranslation('auth');
  const fieldId = useId();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const reset = useMutation({ mutationFn: () => authApi.resetPassword({ token, password }) });
  const resetError = reset.isError ? mapApiError(reset.error) : null;

  if (reset.isSuccess) {
    return (
      <AuthStatus
        key="success"
        title={t('status.reset.success.title')}
        body={t('status.reset.success.body')}
      >
        <Button asChild className={recoveryStyles.primary}>
          <Link to="/login">{t('actions.signInToManualito')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  if (resetError?.code === 'password_reset_token_invalid') {
    return (
      <AuthStatus
        key="expired"
        title={t('status.reset.expired.title')}
        body={t('status.reset.expired.body')}
      >
        <Button asChild className={recoveryStyles.primary}>
          <Link to="/forgot">{t('actions.requestAnotherLink')}</Link>
        </Button>
        <Button asChild variant="secondary" className={recoveryStyles.secondary}>
          <Link to="/login">{t('actions.backToLogin')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const invalidId = (
      [
        [password.length >= MIN_PASSWORD, `${fieldId}-pw`],
        [confirm.length > 0 && confirm === password, `${fieldId}-pw2`],
      ] as ReadonlyArray<readonly [boolean, string]>
    ).find(([valid]) => !valid)?.[1];

    if (invalidId) {
      document.getElementById(invalidId)?.focus();
      return;
    }
    reset.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <h1>{t('forms.reset.heading')}</h1>
      <p className={styles.formDescription}>{t('forms.reset.description')}</p>

      <div className={styles.fields}>
        {resetError ? <AuthAlert title={resetError.title}>{resetError.message}</AuthAlert> : null}
        <NewPasswordFields
          fieldId={fieldId}
          label={t('fields.password.new')}
          password={password}
          confirm={confirm}
          validation={{ password: submitted, confirm: submitted }}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />

        <Button type="submit" block loading={reset.isPending} className={styles.submit}>
          {reset.isPending ? t('actions.savePasswordLoading') : t('actions.savePassword')}
        </Button>
      </div>
    </form>
  );
}
