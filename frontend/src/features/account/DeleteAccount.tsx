import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { dropSessionCaches } from '@/features/auth/auth-queries';
import { accountStatsQueryOptions } from '@/features/profile/use-account';
import { accountApi, type AccountStats } from '@/shared/api/account';
import { ApiError } from '@/shared/api/http';
import { SectionHead } from '@/shared/components/SectionHead';

type DeleteAccountFormProps = Readonly<{
  username: string;
  stats: AccountStats | undefined;
  submitLabel: string;
}>;

export function DeleteAccountButton({ username }: Readonly<{ username: string }>) {
  const { t } = useTranslation('security');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-error hover:bg-error-bg"
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} strokeWidth={2} />
        {t('delete.button')}
      </Button>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} username={username} />
    </>
  );
}

export function DeleteAccountSection({ username }: Readonly<{ username: string }>) {
  const { t } = useTranslation('security');
  const stats = useQuery(accountStatsQueryOptions());

  return (
    <section aria-label={t('delete.sectionTitle')}>
      <SectionHead eyebrow={t('delete.dangerZone')} title={t('delete.sectionTitle')} />
      <DeleteAccountForm username={username} stats={stats.data} submitLabel={t('delete.submit')} />
    </section>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
  username,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
}>) {
  const { t } = useTranslation('security');
  const stats = useQuery({ ...accountStatsQueryOptions(), enabled: open });

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('delete.button')}
      description={t('delete.description')}
      contentClassName="max-w-lg"
      bodyClassName="max-h-[70dvh] overflow-y-auto"
    >
      <DeleteAccountForm
        username={username}
        stats={stats.data}
        submitLabel={t('delete.submitPermanently')}
      />
    </ResponsiveModal>
  );
}

function DeleteAccountForm({ username, stats, submitLabel }: DeleteAccountFormProps) {
  const { t } = useTranslation('security');
  const qc = useQueryClient();
  const router = useRouter();
  const confirmId = useId();
  const [confirmation, setConfirmation] = useState('');
  const matches = confirmation.trim().toLowerCase() === username.toLowerCase();
  const summary = stats
    ? t('delete.contentsWithStats', {
        games: stats.games_count,
        conversations: stats.conversations_count,
        manuals: stats.manuals_count,
      })
    : t('delete.contentsWithoutStats');

  const remove = useMutation({
    mutationFn: () => accountApi.deleteAccount(confirmation.trim()),
    onSuccess: async () => {
      toast.success(t('delete.success'), {
        id: 'account-delete',
        description: t('delete.successDescription'),
      });
      await dropSessionCaches(qc);
      await router.invalidate();
    },
    onError: (error) => {
      toast.error(t('delete.errorTitle'), {
        id: 'account-delete',
        description: deleteAccountError(error, t('delete.error')),
      });
    },
  });

  function submit(event: { preventDefault: () => void }): void {
    event.preventDefault();
    if (matches) remove.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-error bg-error-bg p-5">
      <div className="flex gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-fg">
          <Trans
            ns="security"
            i18nKey="delete.warning"
            values={{ summary }}
            components={{ strong: <strong /> }}
          />
        </p>
      </div>

      <div className="mt-4">
        <label htmlFor={confirmId} className="mb-1.5 block text-sm font-semibold text-fg">
          {t('delete.confirmUsername', { username })}
        </label>
        <Input
          id={confirmId}
          preset="username"
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={username}
          className="bg-bg"
          disabled={remove.isPending}
        />
      </div>

      <div className="mt-4">
        <Button type="submit" variant="destructive" disabled={!matches} loading={remove.isPending}>
          <Trash2 size={16} strokeWidth={2} />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function deleteAccountError(error: unknown, fallbackMessage: string): string {
  if (error instanceof ApiError) return error.view.message;
  return fallbackMessage;
}
