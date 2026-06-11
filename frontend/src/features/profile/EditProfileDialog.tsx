import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Info } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import { AuthAlert } from '@/features/auth/auth-alert';
import { accountApi, type UpdateProfileInput } from '@/shared/api/account';
import { ApiError } from '@/shared/api/http';
import type { AuthUser, AvatarColor, AvatarFigure } from '@/shared/api/auth';
import { Avatar, AvatarGlyph } from '@/shared/components/Avatar';
import { cn } from '@/shared/lib/cn';

const COLORS: ReadonlyArray<{ value: AvatarColor; className: string; label: string }> = [
  { value: 'accent', className: 'bg-accent', label: 'Azul petróleo' },
  { value: 'primary', className: 'bg-primary', label: 'Ámbar' },
  { value: 'contrast', className: 'bg-primary-700', label: 'Tostado' },
  { value: 'success', className: 'bg-success', label: 'Verde' },
  { value: 'warning', className: 'bg-warning', label: 'Dorado' },
];

const FIGURES: ReadonlyArray<{ value: AvatarFigure; label: string }> = [
  { value: 'initials', label: 'Iniciales' },
  { value: 'meeple', label: 'Meeple' },
  { value: 'dice', label: 'Dado' },
  { value: 'crown', label: 'Corona' },
  { value: 'flag', label: 'Bandera' },
  { value: 'sparkle', label: 'Chispa' },
  { value: 'book', label: 'Libro' },
  { value: 'bulb', label: 'Idea' },
  { value: 'zap', label: 'Rayo' },
  { value: 'hourglass', label: 'Reloj de arena' },
  { value: 'trophy', label: 'Trofeo' },
  { value: 'puzzle', label: 'Puzle' },
  { value: 'swords', label: 'Espadas' },
  { value: 'ghost', label: 'Fantasma' },
  { value: 'shield', label: 'Escudo' },
  { value: 'rocket', label: 'Cohete' },
];

/** Editor de identidad: avatar (color + figura), usuario y email. */
export function EditProfileDialog({
  open,
  onOpenChange,
  user,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; user: AuthUser }>) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Editar perfil"
      description="Tu identidad en Manualito."
      contentClassName="max-w-lg"
      bodyClassName="max-h-[70dvh] overflow-y-auto"
    >
      <EditProfileForm user={user} onClose={() => onOpenChange(false)} />
    </ResponsiveModal>
  );
}

function updateError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return 'Ese email o nombre de usuario ya está en uso — prueba otro.';
  }
  if (error instanceof ApiError) return error.view.message;
  return 'No hemos podido guardar los cambios. Inténtalo de nuevo en un momento.';
}

function EditProfileForm({
  user,
  onClose,
}: Readonly<{ user: AuthUser; onClose: () => void }>) {
  const qc = useQueryClient();
  const usernameId = useId();
  const emailId = useId();
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [color, setColor] = useState<AvatarColor>(user.avatar_color ?? 'accent');
  const [figure, setFigure] = useState<AvatarFigure>(user.avatar_figure ?? 'initials');

  const changes: UpdateProfileInput = {};
  if (username.trim() !== user.username && username.trim().length > 0) {
    changes.username = username.trim();
  }
  if (email.trim() !== user.email && email.trim().length > 0) changes.email = email.trim();
  if (color !== (user.avatar_color ?? 'accent')) changes.avatar_color = color;
  if (figure !== (user.avatar_figure ?? 'initials')) changes.avatar_figure = figure;
  const dirty = Object.keys(changes).length > 0;
  const emailChanged = changes.email !== undefined;

  const save = useMutation({
    mutationFn: () => accountApi.updateProfile(changes),
    onSuccess: (data) => {
      qc.setQueryData(AUTH_ME_KEY, data);
      onClose();
      toast.success('Perfil actualizado', {
        id: 'profile-update',
        description: emailChanged
          ? 'Te hemos enviado un enlace para verificar el email nuevo.'
          : undefined,
      });
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save.mutate();
        else onClose();
      }}
      className="flex flex-col gap-4"
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-fg">Avatar</legend>
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-3.5">
          <Avatar name={username || user.username} size={64} color={color} figure={figure} />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <fieldset aria-label="Color del avatar" className="flex gap-2">
              {COLORS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={color === option.value}
                  aria-label={option.label}
                  onClick={() => setColor(option.value)}
                  className={cn(
                    'size-8 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.25)] transition-transform',
                    option.className,
                    color === option.value
                      ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg'
                      : 'hover:scale-110',
                  )}
                />
              ))}
            </fieldset>
            <fieldset aria-label="Figura del avatar" className="flex flex-wrap gap-1.5">
              {FIGURES.map((option) => {
                const selected = figure === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => setFigure(option.value)}
                    className={cn(
                      'grid size-9 place-items-center rounded-full border text-fg-2 transition-colors',
                      selected
                        ? cn('border-transparent text-[#FFF8F0]', COLORS.find((c) => c.value === color)?.className)
                        : 'border-border-strong bg-bg hover:bg-surface-2',
                    )}
                  >
                    {option.value === 'initials' ? (
                      <span className="font-display text-xs font-extrabold">
                        {(username || user.username).slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      <AvatarGlyph figure={option.value} size={30} />
                    )}
                  </button>
                );
              })}
            </fieldset>
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor={usernameId} className="mb-1.5 block text-sm font-semibold text-fg">
          Nombre de usuario
        </label>
        <Input
          id={usernameId}
          preset="username"
          value={username}
          maxLength={20}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor={emailId} className="mb-1.5 block text-sm font-semibold text-fg">
          Email
        </label>
        <Input
          id={emailId}
          preset="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {emailChanged ? (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-accent-100 px-3 py-2.5 text-xs leading-relaxed text-fg">
            <Info size={14} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
            Si cambias el email tendrás que volver a verificarlo: te enviaremos un enlace a la
            dirección nueva.
          </p>
        ) : null}
      </div>

      {save.isError ? (
        <AuthAlert title="No se han guardado los cambios">{updateError(save.error)}</AuthAlert>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          <Check size={16} strokeWidth={2.4} />
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}
