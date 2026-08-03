import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ParseKeys } from 'i18next';
import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

type ProfileKey = ParseKeys<'profile'>;

const COLORS: ReadonlyArray<{ value: AvatarColor; className: string; key: ProfileKey }> = [
  { value: 'accent', className: 'bg-accent', key: 'avatar.colors.accent' },
  { value: 'primary', className: 'bg-primary', key: 'avatar.colors.primary' },
  { value: 'contrast', className: 'bg-primary-700', key: 'avatar.colors.contrast' },
  { value: 'success', className: 'bg-success', key: 'avatar.colors.success' },
  { value: 'warning', className: 'bg-warning', key: 'avatar.colors.warning' },
];

const FIGURES: ReadonlyArray<{ value: AvatarFigure; key: ProfileKey }> = [
  { value: 'initials', key: 'avatar.figures.initials' },
  { value: 'meeple', key: 'avatar.figures.meeple' },
  { value: 'dice', key: 'avatar.figures.dice' },
  { value: 'crown', key: 'avatar.figures.crown' },
  { value: 'flag', key: 'avatar.figures.flag' },
  { value: 'sparkle', key: 'avatar.figures.sparkle' },
  { value: 'book', key: 'avatar.figures.book' },
  { value: 'bulb', key: 'avatar.figures.bulb' },
  { value: 'zap', key: 'avatar.figures.zap' },
  { value: 'hourglass', key: 'avatar.figures.hourglass' },
  { value: 'trophy', key: 'avatar.figures.trophy' },
  { value: 'puzzle', key: 'avatar.figures.puzzle' },
  { value: 'swords', key: 'avatar.figures.swords' },
  { value: 'ghost', key: 'avatar.figures.ghost' },
  { value: 'shield', key: 'avatar.figures.shield' },
  { value: 'rocket', key: 'avatar.figures.rocket' },
];

export function EditProfileDialog({
  open,
  onOpenChange,
  user,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; user: AuthUser }>) {
  const { t } = useTranslation('profile');

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('edit.title')}
      description={t('edit.description')}
      contentClassName="max-w-lg"
      bodyClassName="max-h-[70dvh] overflow-y-auto"
    >
      <EditProfileForm user={user} onClose={() => onOpenChange(false)} />
    </ResponsiveModal>
  );
}

function updateError(error: unknown, takenMessage: string, fallbackMessage: string): string {
  if (error instanceof ApiError && error.status === 409) return takenMessage;
  if (error instanceof ApiError) return error.view.message;
  return fallbackMessage;
}

function EditProfileForm({
  user,
  onClose,
}: Readonly<{ user: AuthUser; onClose: () => void }>) {
  const { t } = useTranslation('profile');
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
      toast.success(t('edit.success'), {
        id: 'profile-update',
        description: emailChanged ? t('edit.emailChangeSuccess') : undefined,
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
        <legend className="mb-1.5 text-sm font-semibold text-fg">{t('edit.avatar')}</legend>
        <div className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-3.5">
          <Avatar name={username || user.username} size={64} color={color} figure={figure} />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <fieldset aria-label={t('edit.avatarColor')} className="flex gap-2">
              {COLORS.map((option) => {
                const label = t(option.key);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={color === option.value}
                    aria-label={label}
                    onClick={() => setColor(option.value)}
                    className={cn(
                      'size-8 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.25)] transition-transform',
                      option.className,
                      color === option.value
                        ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg'
                        : 'hover:scale-110',
                    )}
                  />
                );
              })}
            </fieldset>
            <fieldset aria-label={t('edit.avatarFigure')} className="flex flex-wrap gap-1.5">
              {FIGURES.map((option) => {
                const selected = figure === option.value;
                const label = t(option.key);
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    aria-label={label}
                    title={label}
                    onClick={() => setFigure(option.value)}
                    className={cn(
                      'grid size-9 place-items-center rounded-full border border-border-strong bg-bg text-fg-2 transition-colors',
                      selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg' : 'hover:bg-surface-2',
                    )}
                  >
                    {option.value === 'initials' ? (
                      <span className="font-display text-xs font-extrabold">
                        {(username || user.username).trim().charAt(0).toUpperCase()}
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
          {t('edit.username')}
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
          {t('edit.email')}
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
            {t('edit.emailChangeNotice')}
          </p>
        ) : null}
      </div>

      {save.isError ? (
        <AuthAlert title={t('edit.saveError')}>
          {updateError(save.error, t('edit.usernameTaken'), t('edit.updateError'))}
        </AuthAlert>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
          {t('edit.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          {t('edit.save')}
        </Button>
      </div>
    </form>
  );
}
