import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckIcon } from '@phosphor-icons/react';
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
import styles from './entry.module.css';

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
  const [reviewed, setReviewed] = useState({
    email: false,
    username: false,
    password: false,
    confirm: false,
  });
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const reviewField = (field: keyof typeof reviewed) => {
    setReviewed((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
  };
  const emailError = emailFieldError(email.trim(), submitted || reviewed.email);
  const usernameError =
    (submitted || reviewed.username) && username.trim().length === 0
      ? t('validation.username.required')
      : undefined;
  const consentError = submitted && !consent;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (register.isPending) return;
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
    <form onSubmit={submit} noValidate className={styles.form} data-kind="register">
      <h1>{t('forms.register.heading')}</h1>
      <p className={styles.formDescription}>{t('forms.register.description')}</p>

      <RegisterErrorAlert error={register.lastError} />

      <div className={styles.fields}>
        <div className={styles.registrationGrid}>
          <AuthField
            label={t('fields.email')}
            htmlFor={`${fieldId}-email`}
            error={emailError}
            onFocusLeave={() => reviewField('email')}
          >
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

          <AuthField
            label={t('fields.username')}
            htmlFor={`${fieldId}-name`}
            error={usernameError}
            onFocusLeave={() => reviewField('username')}
          >
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
            validation={{
              password: submitted || reviewed.password,
              confirm: submitted || reviewed.confirm,
            }}
            onFieldBlur={reviewField}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
          />
        </div>

        <div className={styles.registrationActions}>
          <ConsentField
            id={`${fieldId}-consent`}
            checked={consent}
            error={consentError}
            onChange={setConsent}
            onShowPrivacy={() => setPrivacyOpen(true)}
          />
          <PrivacyPolicyModal open={privacyOpen} onOpenChange={setPrivacyOpen} />

          <Button
            type="submit"
            size="lg"
            block
            loading={register.isPending}
            className={styles.submit}
          >
            {register.isPending ? t('actions.createAccountLoading') : t('actions.createAccount')}
          </Button>
        </div>
      </div>

      <p className={styles.switch}>
        {t('forms.register.haveAccount')}{' '}
        <Link to="/login" className={styles.textLink}>
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
            login: <Link to="/login" className={styles.textLink} />,
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
      <div className={styles.consent}>
        <span className={styles.consentControl}>
          <input
            id={id}
            type="checkbox"
            checked={checked}
            aria-labelledby={`${id}-label`}
            aria-invalid={ariaInvalid(error)}
            aria-describedby={error ? `${id}-feedback` : undefined}
            onChange={(event) => onChange(event.target.checked)}
          />
          <CheckIcon size={14} weight="bold" aria-hidden="true" />
        </span>
        <span id={`${id}-label`}>
          <label htmlFor={id}>{t('consent.label')}</label>{' '}
          <button type="button" onClick={onShowPrivacy} className={styles.textLink}>
            {t('consent.privacy')}
          </button>
          .
        </span>
      </div>
      <FieldFeedback id={`${id}-feedback`} error={error ? t('consent.required') : undefined} />
    </div>
  );
}
