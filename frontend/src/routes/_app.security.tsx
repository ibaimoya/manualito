import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Lock, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { dropSessionCaches } from '@/features/auth/auth-queries';
import { AuthAlert } from '@/features/auth/auth-alert';
import {
  AuthField,
  MIN_PASSWORD,
  NewPasswordFields,
  PasswordInput,
} from '@/features/auth/auth-controls';
import { accountStatsQueryOptions } from '@/features/profile/use-account';
import { useAuth } from '@/features/auth/use-auth';
import { accountApi } from '@/shared/api/account';
import { ApiError } from '@/shared/api/http';
import { SectionHead } from '@/shared/components/SectionHead';

export const Route = createFileRoute('/_app/security')({
  component: SecurityScreen,
});

function SecurityScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 pb-10 pt-5 md:px-8 md:pt-8">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Cuenta y seguridad
        </h1>
      </header>
      <ChangePasswordSection />
      <DangerZone username={user.username} />
    </div>
  );
}

function currentPasswordError(
  wrongCurrent: boolean,
  submitted: boolean,
  current: string,
): string | undefined {
  if (wrongCurrent) return 'La contraseña actual no es correcta';
  if (submitted && current.length === 0) return 'Escribe tu contraseña actual';
  return undefined;
}

function ChangePasswordSection() {
  const fieldId = useId();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const change = useMutation({
    mutationFn: () =>
      accountApi.changePassword({ current_password: current, new_password: password }),
    onSuccess: () => {
      setCurrent('');
      setPassword('');
      setConfirm('');
      setSubmitted(false);
      toast.success('Contraseña actualizada', {
        id: 'password-change',
        description: 'Hemos cerrado la sesión en tus otros dispositivos.',
      });
    },
  });

  const wrongCurrent = change.error instanceof ApiError && change.error.status === 401;

  function submit(event: { preventDefault: () => void }): void {
    event.preventDefault();
    setSubmitted(true);
    const valid =
      current.length > 0 && password.length >= MIN_PASSWORD && confirm === password;
    if (valid) change.mutate();
  }

  return (
    <section aria-label="Cambiar contraseña">
      <SectionHead eyebrow="Acceso" title="Cambiar contraseña" />
      <Card className="p-5">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <AuthField
            label="Contraseña actual"
            htmlFor={`${fieldId}-current`}
            error={currentPasswordError(wrongCurrent, submitted, current)}
          >
            <PasswordInput
              id={`${fieldId}-current`}
              autoComplete="current-password"
              placeholder="Tu contraseña de ahora"
              value={current}
              invalid={wrongCurrent}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </AuthField>

          <NewPasswordFields
            fieldId={fieldId}
            label="Contraseña nueva"
            password={password}
            confirm={confirm}
            submitted={submitted}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
          />

          {change.isError && !wrongCurrent ? (
            <AuthAlert title="No hemos podido cambiar la contraseña">
              Inténtalo de nuevo en un momento.
            </AuthAlert>
          ) : null}

          <div>
            <Button type="submit" loading={change.isPending}>
              <Lock size={16} strokeWidth={2} />
              Cambiar contraseña
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}

function DangerZone({ username }: Readonly<{ username: string }>) {
  const qc = useQueryClient();
  const router = useRouter();
  const stats = useQuery(accountStatsQueryOptions());
  const confirmId = useId();
  const [confirmation, setConfirmation] = useState('');
  const matches = confirmation.trim().toLowerCase() === username.toLowerCase();

  const remove = useMutation({
    mutationFn: () => accountApi.deleteAccount(confirmation.trim()),
    onSuccess: async () => {
      toast.success('Cuenta eliminada', {
        id: 'account-delete',
        description: 'Gracias por probar Manualito.',
      });
      await dropSessionCaches(qc);
      await router.invalidate();
    },
    onError: () =>
      toast.error('No hemos podido eliminar la cuenta', {
        id: 'account-delete',
        description: 'Inténtalo de nuevo en un momento.',
      }),
  });

  const summary = stats.data
    ? `tu perfil, tus ${stats.data.games_count} juegos, ${stats.data.conversations_count} conversaciones y ${stats.data.manuals_count} manuales`
    : 'tu perfil, tus juegos, conversaciones y manuales';

  return (
    <section aria-label="Eliminar cuenta">
      <SectionHead eyebrow="Zona de peligro" title="Eliminar cuenta" />
      <div className="rounded-2xl border border-error bg-error-bg p-5">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-fg">
            Se borrarán <strong>para siempre</strong> {summary}. Los manuales que compartiste
            saldrán del pool. No hay vuelta atrás ni copia de seguridad.
          </p>
        </div>
        <div className="mt-4">
          <label htmlFor={confirmId} className="mb-1.5 block text-sm font-semibold text-fg">
            Escribe tu usuario (@{username}) para confirmar
          </label>
          <Input
            id={confirmId}
            preset="username"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={username}
            className="bg-bg"
          />
        </div>
        <div className="mt-4">
          <Button
            variant="destructive"
            disabled={!matches}
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 size={16} strokeWidth={2} />
            Eliminar mi cuenta
          </Button>
        </div>
      </div>
    </section>
  );
}
