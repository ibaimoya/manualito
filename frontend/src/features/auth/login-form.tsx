import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/shared/api/http';
import { ariaInvalid, AuthField, PasswordInput } from './auth-controls';
import { AuthAlert } from './auth-alert';
import { useLogin } from './use-auth';

function loginErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'Email o contraseña incorrectos. Revísalos e inténtalo otra vez.';
    return error.view.message;
  }
  return 'No hemos podido entrar. Inténtalo de nuevo.';
}

export function LoginForm({ onAuthenticated }: Readonly<{ onAuthenticated: () => void }>) {
  const login = useLogin();
  const fieldId = useId();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const identifierError =
    submitted && identifier.trim().length === 0 ? 'Escribe tu email o nombre de usuario' : undefined;
  const passwordError = submitted && password.length === 0 ? 'Escribe tu contraseña' : undefined;

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
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">Hola de nuevo</h1>
      <p className="mt-1.5 text-sm text-fg-2">Entra para seguir aprendiendo juegos.</p>

      {login.isError ? (
        <AuthAlert title="No hemos podido entrar" className="mt-4">
          {loginErrorText(login.error)}
        </AuthAlert>
      ) : null}

      <div className="mt-5 flex flex-col gap-4">
        <AuthField label="Email o usuario" htmlFor={`${fieldId}-id`} error={identifierError}>
          <Input
            id={`${fieldId}-id`}
            preset="username"
            placeholder="tu@email.com"
            value={identifier}
            aria-invalid={ariaInvalid(Boolean(identifierError))}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </AuthField>

        <AuthField label="Contraseña" htmlFor={`${fieldId}-pw`} error={passwordError}>
          <PasswordInput
            id={`${fieldId}-pw`}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={password}
            invalid={Boolean(passwordError)}
            aria-invalid={ariaInvalid(Boolean(passwordError))}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <div className="mt-2 flex justify-end">
            <Link to="/forgot" className="text-sm font-semibold text-accent hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </AuthField>

        <Button type="submit" size="lg" block loading={login.isPending} className="mt-1">
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        ¿Aún no tienes cuenta?{' '}
        <Link to="/register" className="font-bold text-accent hover:underline">
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
