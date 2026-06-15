import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/shared/api/auth';
import { AuthField } from './auth-controls';
import { AuthStatus } from './auth-status';

export function ForgotForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: (value: string) => authApi.forgotPassword(value) });

  if (forgot.isSuccess) {
    return (
      <AuthStatus
        tone="accent"
        icon={Mail}
        title="Revisa tu correo"
        body="Si existe una cuenta con ese email, te hemos enviado un enlace para crear una contraseña nueva."
        footnote="¿No llega? Mira en spam · espera 1–2 min"
      >
        <Button asChild size="lg" block variant="secondary">
          <Link to="/login">Volver a entrar</Link>
        </Button>
      </AuthStatus>
    );
  }

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    forgot.mutate(email.trim());
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
        ¿Olvidaste tu contraseña?
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">
        Escribe tu email y te enviamos un enlace para crear una nueva.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <AuthField label="Email" htmlFor={`${fieldId}-email`}>
          <Input
            id={`${fieldId}-email`}
            preset="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </AuthField>
        <Button type="submit" size="lg" block loading={forgot.isPending}>
          {forgot.isPending ? 'Enviando…' : 'Enviar enlace'}
        </Button>
      </div>

      <p className="mt-5 border-t border-border pt-4 text-center text-sm text-fg-2">
        ¿Recuerdas tu contraseña?{' '}
        <Link to="/login" className="font-bold text-accent hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
