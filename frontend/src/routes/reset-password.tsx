import { type SyntheticEvent, useId, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { AuthShell } from '@/features/auth/auth-shell';
import { AuthStatus } from '@/features/auth/auth-status';
import {
  ariaInvalid,
  AuthField,
  confirmPasswordError,
  MIN_PASSWORD,
  PasswordInput,
  passwordScore,
  PasswordStrength,
  passwordTooShortError,
} from '@/features/auth/auth-controls';

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
  return (
    <AuthStatus
      tone="warning"
      icon={ShieldAlert}
      title="Enlace no válido"
      body="Pide un enlace nuevo para restablecer tu contraseña."
    >
      <Button asChild size="lg" block>
        <Link to="/forgot">Pedir otro enlace</Link>
      </Button>
      <Button asChild size="lg" block variant="ghost">
        <Link to="/login">Volver a entrar</Link>
      </Button>
    </AuthStatus>
  );
}

function ResetForm({ token }: Readonly<{ token: string }>) {
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
        title="Contraseña actualizada"
        body="Ya puedes entrar con tu nueva contraseña. La anterior ha dejado de funcionar."
      >
        <Button asChild size="lg" block>
          <Link to="/login">Entrar a Manualito</Link>
        </Button>
      </AuthStatus>
    );
  }

  if (reset.isError) {
    return (
      <AuthStatus
        tone="warning"
        icon={ShieldAlert}
        title="Este enlace ya no vale"
        body="Por seguridad los enlaces caducan. Pide uno nuevo y te lo enviamos al momento."
      >
        <Button asChild size="lg" block>
          <Link to="/forgot">Pedir otro enlace</Link>
        </Button>
        <Button asChild size="lg" block variant="ghost">
          <Link to="/login">Volver a entrar</Link>
        </Button>
      </AuthStatus>
    );
  }

  const passwordError = passwordTooShortError(password, submitted);
  const confirmError = confirmPasswordError(confirm, password, submitted);
  const passwordShort = submitted && password.length < MIN_PASSWORD;

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
        Crea una contraseña nueva
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">Elige una que no uses en otros sitios.</p>

      <div className="mt-5 flex flex-col gap-4">
        <AuthField
          label="Nueva contraseña"
          htmlFor={`${fieldId}-pw`}
          hint={passwordError ? undefined : `Mínimo ${MIN_PASSWORD} caracteres`}
          error={passwordError}
        >
          <PasswordInput
            id={`${fieldId}-pw`}
            autoComplete="new-password"
            placeholder="Crea una contraseña"
            value={password}
            invalid={passwordShort}
            aria-invalid={ariaInvalid(passwordShort)}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {password ? <PasswordStrength score={passwordScore(password)} /> : null}
        </AuthField>

        <AuthField label="Repite la contraseña" htmlFor={`${fieldId}-pw2`} error={confirmError}>
          <PasswordInput
            id={`${fieldId}-pw2`}
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            value={confirm}
            invalid={Boolean(confirmError)}
            aria-invalid={ariaInvalid(Boolean(confirmError))}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </AuthField>

        <Button type="submit" size="lg" block loading={reset.isPending}>
          {reset.isPending ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </div>
    </form>
  );
}
