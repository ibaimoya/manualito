import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/shared/api/auth';
import { mapApiError } from '@/shared/api/error-mapper';
import { AuthAlert } from './auth-alert';
import { ariaInvalid, AuthField, emailFieldError, isEmail } from './auth-controls';
import { AuthStatus } from './auth-status';
import styles from './entry.module.css';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';

export function ForgotForm() {
  const { t, i18n } = useTranslation('auth');
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const forgot = useMutation({
    mutationFn: (value: string) =>
      authApi.forgotPassword({
        email: value,
        locale: i18n.resolvedLanguage === 'en' ? 'en' : 'es',
      }),
  });
  const trimmedEmail = email.trim();
  const emailError = submitted ? emailFieldError(trimmedEmail) : undefined;
  const requestError = forgot.isError ? mapApiError(forgot.error) : null;

  if (forgot.isSuccess) {
    return (
      <AuthStatus
        title={t('status.forgot.success.title')}
        body={t('status.forgot.success.body')}
        footnote={t('status.forgot.success.footnote')}
      >
        <Button asChild variant="secondary" className={recoveryStyles.secondary}>
          <Link to="/login">{t('actions.backToLogin')}</Link>
        </Button>
      </AuthStatus>
    );
  }

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!isEmail(trimmedEmail)) {
      document.getElementById(`${fieldId}-email`)?.focus();
      return;
    }
    forgot.mutate(trimmedEmail);
  };

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <h1>{t('forms.forgot.heading')}</h1>
      <p className={styles.formDescription}>{t('forms.forgot.description')}</p>
      <AuthAlert open={forgot.isError} title={requestError?.title ?? ''} className="mt-4">
        {requestError?.message}
      </AuthAlert>

      <div className={styles.fields}>
        <AuthField label={t('fields.email')} htmlFor={`${fieldId}-email`} error={emailError}>
          <Input
            id={`${fieldId}-email`}
            preset="email"
            placeholder={t('placeholders.email')}
            value={email}
            aria-invalid={ariaInvalid(Boolean(emailError))}
            aria-describedby={emailError ? `${fieldId}-email-feedback` : undefined}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </AuthField>
        <Button type="submit" size="lg" block loading={forgot.isPending} className={styles.submit}>
          {forgot.isPending ? t('actions.sendLinkLoading') : t('actions.sendLink')}
        </Button>
      </div>

      <p className={styles.switch}>
        {t('forms.forgot.rememberPassword')}{' '}
        <Link to="/login" className={styles.textLink}>
          {t('forms.register.signIn')}
        </Link>
      </p>
    </form>
  );
}
