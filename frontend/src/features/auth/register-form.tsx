import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PrivacyPolicyModal } from '@/features/legal/PrivacyPolicyModal';
import { ApiError } from '@/shared/api/http';
import { cn } from '@/shared/lib/cn';
import {
  ariaInvalid,
  AuthField,
  emailFieldError,
  isEmail,
  MIN_PASSWORD,
  NewPasswordFields,
} from './auth-controls';
import { AuthAlert } from './auth-alert';
import { useRegister } from './use-auth';

export function RegisterForm({ onAuthenticated }: Readonly<{ onAuthenticated: () => void }>) {
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
    submitted && username.trim().length === 0 ? 'Escribe un nombre de usuario' : undefined;
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
        Crea tu cuenta
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">Gratis. Solo necesitas un email.</p>

      <RegisterErrorAlert error={register.error} />

      <div className="mt-5 flex flex-col gap-4">
        <AuthField label="Email" htmlFor={`${fieldId}-email`} error={emailError}>
          <Input
            id={`${fieldId}-email`}
            preset="email"
            placeholder="tu@email.com"
            value={email}
            aria-invalid={ariaInvalid(Boolean(emailError))}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </AuthField>

        <AuthField label="Nombre de usuario" htmlFor={`${fieldId}-name`} error={usernameError}>
          <Input
            id={`${fieldId}-name`}
            preset="username"
            placeholder="Tu nombre"
            value={username}
            aria-invalid={ariaInvalid(Boolean(usernameError))}
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
          {register.isPending ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-bold text-accent hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}

/**
 * Aviso de error del registro. En un 409 el backend no revela si el duplicado
 * es el email o el usuario (por privacidad), así que el mensaje cubre ambos. El
 * resto reutiliza el mensaje ya mapeado (p. ej. el detalle de un 422 de campo).
 */
function RegisterErrorAlert({ error }: Readonly<{ error: unknown }>) {
  if (error == null) return null;
  const isConflict = error instanceof ApiError && error.status === 409;
  const mappedMessage = error instanceof ApiError ? error.view.message : null;
  return (
    <AuthAlert
      title={isConflict ? 'Ese email o usuario ya está en uso' : 'No hemos podido crear la cuenta'}
      className="mt-4"
    >
      {isConflict ? (
        <>
          Prueba a{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            iniciar sesión
          </Link>{' '}
          o usa otro email o nombre de usuario.
        </>
      ) : (
        (mappedMessage ?? 'Revisa los datos e inténtalo de nuevo en un momento.')
      )}
    </AuthAlert>
  );
}

function consentBoxClass(error: boolean, checked: boolean): string {
  if (error) return 'border-error bg-error-bg';
  if (checked) return 'border-success bg-success-bg';
  return 'border-primary-300 bg-primary-50';
}

/** Casilla de consentimiento con altura de error reservada (sin salto al aparecer). */
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
  return (
    <div>
      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
          consentBoxClass(error, checked),
        )}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={ariaInvalid(error)}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-primary"
        />
        <span className="text-sm leading-relaxed text-fg">
          He leído y acepto la{' '}
          <button
            type="button"
            onClick={(event) => {
              // preventDefault: el click dentro del <label> alternaría el checkbox.
              event.preventDefault();
              event.stopPropagation();
              onShowPrivacy();
            }}
            className="font-semibold text-accent hover:underline"
          >
            Política de privacidad
          </button>
          {'.'}
        </span>
      </label>
      <p className="mt-1.5 min-h-[1.05rem] text-xs text-error" role="alert">
        {error ? 'Debes aceptar la política de privacidad para continuar.' : ''}
      </p>
    </div>
  );
}
