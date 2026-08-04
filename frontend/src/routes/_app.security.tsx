import { createFileRoute } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { History, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeleteAccountSection } from '@/features/account/DeleteAccount';
import { AuthAlert } from '@/features/auth/auth-alert';
import {
  AuthField,
  MIN_PASSWORD,
  NewPasswordFields,
  PasswordInput,
} from '@/features/auth/auth-controls';
import { useAuth } from '@/features/auth/use-auth';
import { accountApi } from '@/shared/api/account';
import { ApiError } from '@/shared/api/http';
import { SectionHead } from '@/shared/components/SectionHead';
import i18n from '@/app/i18n';

export const Route = createFileRoute('/_app/security')({
  component: SecurityScreen,
});

function activeLocale(): string {
  return i18n.language === 'en' ? 'en-US' : 'es-ES';
}

function formatLastAccessDate(iso: string): string {
  return new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function SecurityScreen() {
  const { t } = useTranslation('security');
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-7 px-5 pb-10 pt-5 md:px-8 md:pt-8">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {t('heading')}
        </h1>
      </header>
      <LastAccessSection lastLoginAt={user.last_login_at} />
      <ChangePasswordSection />
      <DeleteAccountSection username={user.username} />
    </div>
  );
}

function LastAccessSection({ lastLoginAt }: Readonly<{ lastLoginAt: string | null }>) {
  const { t } = useTranslation('security');
  if (lastLoginAt === null) return null;
  return (
    <section aria-label={t('lastAccess.title')}>
      <SectionHead eyebrow={t('lastAccess.eyebrow')} title={t('lastAccess.title')} />
      <Card className="flex items-center gap-3.5 p-5">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700"
        >
          <History size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{formatLastAccessDate(lastLoginAt)}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{t('lastAccess.description')}</p>
        </div>
      </Card>
    </section>
  );
}

function ChangePasswordSection() {
  const { t } = useTranslation('security');
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
      toast.success(t('password.success'), {
        id: 'password-change',
        description: t('password.successDescription'),
      });
    },
  });

  const wrongCurrent = change.error instanceof ApiError && change.error.status === 401;
  const currentError = wrongCurrent
    ? t('password.currentError')
    : submitted && current.length === 0
      ? t('password.currentRequired')
      : undefined;

  function submit(event: { preventDefault: () => void }): void {
    event.preventDefault();
    setSubmitted(true);
    const valid = current.length > 0 && password.length >= MIN_PASSWORD && confirm === password;
    if (valid) change.mutate();
  }

  return (
    <section aria-label={t('password.title')}>
      <SectionHead eyebrow={t('password.eyebrow')} title={t('password.title')} />
      <Card className="p-5">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <AuthField
            label={t('password.current')}
            htmlFor={`${fieldId}-current`}
            error={currentError}
          >
            <PasswordInput
              id={`${fieldId}-current`}
              autoComplete="current-password"
              placeholder={t('password.currentPlaceholder')}
              value={current}
              invalid={wrongCurrent}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </AuthField>

          <NewPasswordFields
            fieldId={fieldId}
            label={t('password.new')}
            password={password}
            confirm={confirm}
            submitted={submitted}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
          />

          {change.isError && !wrongCurrent ? (
            <AuthAlert title={t('password.errorTitle')}>{t('password.errorBody')}</AuthAlert>
          ) : null}

          <div>
            <Button type="submit" loading={change.isPending}>
              <Lock size={16} strokeWidth={2} />
              {t('password.button')}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
