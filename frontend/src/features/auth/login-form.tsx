import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/shared/api/http';
import { ariaInvalid, AuthField, PasswordInput } from './auth-controls';
import { AuthAlert } from './auth-alert';
import { useLogin } from './use-auth';

function loginErrorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.view.message;
  }
  return fallback;
}

export function LoginForm({ onAuthenticated }: Readonly<{ onAuthenticated: () => void }>) {
  const { t } = useTranslation('auth');
  const login = useLogin();
  const fieldId = useId();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const identifierError =
    submitted && identifier.trim().length === 0 ? t('validation.identifier.required') : undefined;
  const passwordError =
    submitted && password.length === 0 ? t('validation.password.required') : undefined;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    // Sin foco silencioso: damos feedback y llevamos al primer campo vacío.
    if (!identifier.trim()) {
      document.getElementById(`${fieldId}-id`)?.focus();
      return;
    }
    if (!password) {
      document.getElementById(`${fieldId}-pw`)?.focus();
      return;
    }
    login.mutate({ identifier: identifier.trim(), password }, { onSuccess: onAuthenticated });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
        {t('forms.login.heading')}
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">{t('forms.login.description')}</p>

      {login.isError ? (
        <AuthAlert title={t('alerts.login.title')} className="mt-4">
          {loginErrorText(login.error, t('alerts.login.fallback'))}
        </AuthAlert>
      ) : null}

      <div className="mt-5 flex flex-col gap-4">
        <AuthField label={t('fields.identifier')} htmlFor={`${fieldId}-id`} error={identifierError}>
          <Input
            id={`${fieldId}-id`}
            preset="username"
            placeholder={t('placeholders.email')}
            value={identifier}
            aria-invalid={ariaInvalid(Boolean(identifierError))}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </AuthField>

        <AuthField
          label={t('fields.password.default')}
          htmlFor={`${fieldId}-pw`}
          error={passwordError}
        >
          <PasswordInput
            id={`${fieldId}-pw`}
            autoComplete="current-password"
            placeholder={t('placeholders.loginPassword')}
            value={password}
            invalid={Boolean(passwordError)}
            aria-invalid={ariaInvalid(Boolean(passwordError))}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div className="mt-2 flex justify-end">
            <Link to="/forgot" className="text-sm font-semibold text-accent hover:underline">
              {t('forms.login.forgotPassword')}
            </Link>
          </div>
        </AuthField>

        <Button type="submit" size="lg" block loading={login.isPending} className="mt-1">
          {login.isPending ? t('actions.signInLoading') : t('actions.signIn')}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        {t('forms.login.dontHaveAccount')}{' '}
        <Link to="/register" className="font-bold text-accent hover:underline">
          {t('actions.createAccount')}
        </Link>
      </p>
    </form>
  );
}
