import { type SyntheticEvent, useId, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { AuthShell } from '@/features/auth/auth-shell';
import { AuthStatus } from '@/features/auth/auth-status';
import { MIN_PASSWORD, NewPasswordFields } from '@/features/auth/auth-controls';

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
    <AuthStatus
      tone="warning"
      icon={ShieldAlert}
      title={t('status.reset.invalid.title')}
      body={t('status.reset.invalid.body')}
    >
      <Button asChild size="lg" block>
        <Link to="/forgot">{t('actions.requestAnotherLink')}</Link>
      </Button>
      <Button asChild size="lg" block variant="ghost">
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

  if (reset.isSuccess) {
    return (
      <AuthStatus
        tone="success"
        icon={CheckCircle2}
        title={t('status.reset.success.title')}
        body={t('status.reset.success.body')}
      >
        <Button asChild size="lg" block>
          <Link to="/login">{t('actions.signInToManualito')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  if (reset.isError) {
    return (
      <AuthStatus
        tone="warning"
        icon={ShieldAlert}
        title={t('status.reset.expired.title')}
        body={t('status.reset.expired.body')}
      >
        <Button asChild size="lg" block>
          <Link to="/forgot">{t('actions.requestAnotherLink')}</Link>
        </Button>
        <Button asChild size="lg" block variant="ghost">
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
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
        {t('forms.reset.heading')}
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">{t('forms.reset.description')}</p>

      <div className="mt-5 flex flex-col gap-4">
        <NewPasswordFields
          fieldId={fieldId}
          label={t('fields.password.new')}
          password={password}
          confirm={confirm}
          submitted={submitted}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />

        <Button type="submit" size="lg" block loading={reset.isPending}>
          {reset.isPending ? t('actions.savePasswordLoading') : t('actions.savePassword')}
        </Button>
      </div>
    </form>
  );
}
