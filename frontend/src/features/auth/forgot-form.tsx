import { type SyntheticEvent, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/shared/api/auth';
import { AuthField } from './auth-controls';

export function ForgotForm() {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: (value: string) => authApi.forgotPassword(value) });

  if (forgot.isSuccess) {
    return (
      <div className="flex flex-col">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
          Revisa tu correo
        </h1>
        <p className="mt-1.5 text-sm text-fg-2">
          Si existe una cuenta con ese email, te hemos enviado instrucciones para crear una nueva
          contraseña.
        </p>
        <Link
          to="/login"
          className="mt-5 text-center text-sm font-bold text-accent hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </div>
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
        Recuperar contraseña
      </h1>
      <p className="mt-1.5 text-sm text-fg-2">Te enviaremos un enlace para crear una nueva.</p>

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
          {forgot.isPending ? 'Enviando…' : 'Enviar instrucciones'}
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
