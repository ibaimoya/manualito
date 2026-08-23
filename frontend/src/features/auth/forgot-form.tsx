import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/shared/api/auth';
import { ariaInvalid, AuthField, emailFieldError, isEmail } from './auth-controls';
import { AuthStatus } from './auth-status';

export function ForgotForm() {
  const { t } = useTranslation('auth');
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const forgot = useMutation({ mutationFn: (value: string) => authApi.forgotPassword(value) });
  const trimmedEmail = email.trim();
  const emailError = emailFieldError(trimmedEmail, submitted);

  if (forgot.isSuccess) {
    return (
      <AuthStatus
        tone="accent"
        icon={Mail}
        title={t('status.forgot.success.title')}
        body={t('status.forgot.success.body')}
        footnote={t('status.forgot.success.footnote')}
      >
        <Button asChild size="lg" block variant="secondary">
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
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
        {t('forms.forgot.heading')}
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">{t('forms.forgot.description')}</p>

      <div className="mt-5 flex flex-col gap-4">
        <AuthField label={t('fields.email')} htmlFor={`${fieldId}-email`} error={emailError}>
          <Input
            id={`${fieldId}-email`}
            preset="email"
            placeholder={t('placeholders.email')}
            value={email}
            aria-invalid={ariaInvalid(Boolean(emailError))}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </AuthField>
        <Button type="submit" size="lg" block loading={forgot.isPending}>
          {forgot.isPending ? t('actions.sendLinkLoading') : t('actions.sendLink')}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        {t('forms.forgot.rememberPassword')}{' '}
        <Link to="/login" className="font-bold text-accent hover:underline">
          {t('forms.register.signIn')}
        </Link>
      </p>
    </form>
  );
}
