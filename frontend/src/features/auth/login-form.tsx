import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/shared/api/http';
import { ariaInvalid, AuthField, PasswordInput } from './auth-controls';
import { AuthAlert } from './auth-alert';
import { useLogin } from './use-auth';
import styles from './entry.module.css';

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
    if (login.isPending) return;
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
    <form onSubmit={submit} noValidate className={styles.form}>
      <h1>{t('forms.login.heading')}</h1>
      <p className={styles.formDescription}>{t('forms.login.description')}</p>

      <AuthAlert open={login.lastError != null} title={t('alerts.login.title')} className="mt-4">
        {loginErrorText(login.lastError, t('alerts.login.fallback'))}
      </AuthAlert>

      <div className={styles.fields}>
        <AuthField label={t('fields.identifier')} htmlFor={`${fieldId}-id`} error={identifierError}>
          <Input
            id={`${fieldId}-id`}
            preset="username"
            placeholder={t('placeholders.email')}
            value={identifier}
            aria-invalid={ariaInvalid(Boolean(identifierError))}
            aria-describedby={identifierError ? `${fieldId}-id-feedback` : undefined}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </AuthField>

        <div>
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
              aria-invalid={ariaInvalid(Boolean(passwordError))}
              aria-describedby={passwordError ? `${fieldId}-pw-feedback` : undefined}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </AuthField>
          <div className={styles.forgot}>
            <Link to="/forgot" className={styles.textLink}>
              {t('forms.login.forgotPassword')}
            </Link>
          </div>
        </div>

        <Button type="submit" size="lg" block loading={login.isPending} className={styles.submit}>
          {login.isPending ? t('actions.signInLoading') : t('actions.signIn')}
        </Button>
      </div>

      <p className={styles.switch}>
        {t('forms.login.dontHaveAccount')}{' '}
        <Link to="/register" className={styles.textLink}>
          {t('actions.createAccount')}
        </Link>
      </p>
    </form>
  );
}
