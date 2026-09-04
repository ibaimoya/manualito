import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivacyPolicyModal } from '@/features/legal/PrivacyPolicyModal';
import { ApiError } from '@/shared/api/http';
import {
  ariaInvalid,
  AuthField,
  emailFieldError,
  isEmail,
  MIN_PASSWORD,
  NewPasswordFields,
} from './auth-controls';
import { AuthAlert } from './auth-alert';
import { FieldFeedback } from './FieldFeedback';
import { useRegister } from './use-auth';

export function RegisterForm({ onAuthenticated }: Readonly<{ onAuthenticated: () => void }>) {
  const { t } = useTranslation('auth');
  const register = useRegister();
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const emailError = emailFieldError(email.trim(), submitted);
  const usernameError =
    submitted && username.trim().length === 0 ? t('validation.username.required') : undefined;
  const consentError = submitted && !consent;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const invalidId = (
      [
        [isEmail(email.trim()), `${fieldId}-email`],
        [username.trim().length > 0, `${fieldId}-name`],
        [password.length >= MIN_PASSWORD, `${fieldId}-pw`],
        [confirm.length > 0 && confirm === password, `${fieldId}-pw2`],
        [consent, `${fieldId}-consent`],
      ] as ReadonlyArray<readonly [boolean, string]>
    ).find(([valid]) => !valid)?.[1];

    if (invalidId) {
      document.getElementById(invalidId)?.focus();
      return;
    }
    register.mutate(
      { email: email.trim(), username: username.trim(), password },
      { onSuccess: onAuthenticated },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
        {t('forms.register.heading')}
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">{t('forms.register.description')}</p>

      <RegisterErrorAlert error={register.error} />

      <div className="mt-5 flex flex-col gap-4">
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

        <AuthField label={t('fields.username')} htmlFor={`${fieldId}-name`} error={usernameError}>
          <Input
            id={`${fieldId}-name`}
            preset="username"
            placeholder={t('placeholders.username')}
            value={username}
            aria-invalid={ariaInvalid(Boolean(usernameError))}
            aria-describedby={usernameError ? `${fieldId}-name-feedback` : undefined}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </AuthField>

        <NewPasswordFields
          fieldId={fieldId}
          password={password}
          confirm={confirm}
          submitted={submitted}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
        />

        <ConsentField
          id={`${fieldId}-consent`}
          checked={consent}
          error={consentError}
          onChange={setConsent}
          onShowPrivacy={() => setPrivacyOpen(true)}
        />
        <PrivacyPolicyModal open={privacyOpen} onOpenChange={setPrivacyOpen} />

        <Button type="submit" size="lg" block loading={register.isPending}>
          {register.isPending ? t('actions.createAccountLoading') : t('actions.createAccount')}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        {t('forms.register.haveAccount')}{' '}
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center font-bold text-accent hover:underline"
        >
          {t('forms.register.signIn')}
        </Link>
      </p>
    </form>
  );
}

function RegisterErrorAlert({ error }: Readonly<{ error: unknown }>) {
  const { t } = useTranslation('auth');
  const isConflict = error instanceof ApiError && error.status === 409;
  const mappedMessage = error instanceof ApiError ? error.view.message : null;
  return (
    <AuthAlert
      open={error != null}
      title={isConflict ? t('alerts.register.conflict.title') : t('alerts.register.failure.title')}
      className="mt-4"
    >
      {isConflict ? (
        <Trans
          ns="auth"
          i18nKey="alerts.register.conflict.body"
          components={{
            login: <Link to="/login" className="font-semibold text-accent hover:underline" />,
          }}
        />
      ) : (
        (mappedMessage ?? t('alerts.register.failure.body'))
      )}
    </AuthAlert>
  );
}

function ConsentField({
  id,
  checked,
  error,
  onChange,
  onShowPrivacy,
}: Readonly<{
  id: string;
  checked: boolean;
  error: boolean;
  onChange: (value: boolean) => void;
  onShowPrivacy: () => void;
}>) {
  const { t } = useTranslation('auth');
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={ariaInvalid(error)}
          aria-describedby={error ? `${id}-feedback` : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className="size-5 shrink-0 accent-primary"
        />
        <span className="text-sm leading-relaxed text-fg">
          <Trans
            ns="auth"
            i18nKey="consent.label"
            components={{
              privacy: (
                <button
                  type="button"
                  onClick={(event) => {
                    // Evita que el clic dentro del label alterne el checkbox
                    event.preventDefault();
                    event.stopPropagation();
                    onShowPrivacy();
                  }}
                  className="font-semibold text-accent hover:underline"
                />
              ),
            }}
          />
        </span>
      </label>
      <FieldFeedback id={`${id}-feedback`} error={error ? t('consent.required') : undefined} />
    </div>
  );
}
