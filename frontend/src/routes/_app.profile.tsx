import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useInView } from 'motion/react';
import NumberFlow, { continuous } from '@number-flow/react';
import {
  WarningIcon,
  SealCheckIcon,
  DiceFiveIcon,
  EnvelopeSimpleIcon,
  ChatsIcon,
  PencilSimpleIcon,
  ScrollIcon,
} from '@phosphor-icons/react';
import { AccountIcon, LogOutIcon } from '@/shared/components/action-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { HelpIndicator } from '@/components/ui/help-indicator';
import { useAuth, useLogout } from '@/features/auth/use-auth';
import { useResendVerification } from '@/features/auth/use-resend-verification';
import { EditProfileDialog } from '@/features/profile/EditProfileDialog';
import { accountStatsQueryOptions } from '@/features/profile/use-account';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { tourTarget } from '@/features/tutorial/targets';
import type { AuthUser } from '@/shared/api/auth';
import i18n from '@/app/i18n';
import { Avatar } from '@/shared/components/Avatar';
import { SectionHead } from '@/shared/components/SectionHead';
import { elideEmail } from '@/shared/lib/elideEmail';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useTextWave } from '@/shared/hooks/useTextWave';

export const Route = createFileRoute('/_app/profile')({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(accountStatsQueryOptions());
  },
  component: ProfileScreen,
});

function activeLocale(): string {
  return i18n.language === 'en' ? 'en-US' : 'es-ES';
}

function memberSince(iso: string): string {
  return new Intl.DateTimeFormat(activeLocale(), { month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );
}

function ProfileScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return <ProfileLoaded user={user} />;
}

function ProfileLoaded({ user }: Readonly<{ user: AuthUser }>) {
  const { t } = useTranslation('profile');
  const logout = useLogout();
  const [editOpen, setEditOpen] = useState(false);
  const displayName = user.username || user.email;
  const nameWave = useTextWave<HTMLHeadingElement>();

  return (
    <div className="page-frame page-stack mx-auto max-w-5xl">
      <Card
        className="bg-surface p-5 shadow-none @md/app:p-6 @3xl/app:p-8"
        {...tourTarget('profile-identity')}
      >
        <div className="flex flex-col gap-6 @3xl/app:flex-row @3xl/app:items-center @3xl/app:gap-8">
          <div className="flex min-w-0 flex-1 flex-col items-start gap-4 @md/app:flex-row @md/app:items-center @md/app:gap-5">
            <Avatar
              name={displayName}
              size={96}
              color={user.avatar_color}
              figure={user.avatar_figure}
            />
            <div className="min-w-0 w-full flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h1
                  {...nameWave}
                  aria-label={displayName}
                  className="-my-1 min-w-0 truncate py-1 font-display text-2xl font-extrabold tracking-tight text-fg md:text-3xl"
                >
                  <span aria-hidden="true">
                    {Array.from(displayName, (letter, index) => (
                      <span key={`${letter}-${index}`} data-text-wave className="inline-block">
                        {letter}
                      </span>
                    ))}
                  </span>
                </h1>
                {user.email_verified_at === null ? null : (
                  <HelpIndicator
                    icon={SealCheckIcon}
                    tone="success"
                    label={t('verification.verified')}
                    iconClassName="translate-y-px"
                  />
                )}
                <HelpMenuButton className="ml-auto -mr-2 md:hidden" />
              </div>
              <p className="mono mt-0.5 truncate text-sm text-fg-3">@{user.username}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-fg-2">
                  <EnvelopeSimpleIcon size={18} aria-hidden="true" className="shrink-0 text-fg-3" />
                  <span className="truncate">{elideEmail(user.email)}</span>
                </span>
                <VerificationBadge user={user} />
              </div>
              <p className="mono mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
                {t('memberSince', { date: memberSince(user.created_at) })}
              </p>
            </div>
          </div>
          <div
            className="grid grid-cols-2 gap-2 border-t border-border pt-4 @3xl/app:w-44 @3xl/app:shrink-0 @3xl/app:grid-cols-1 @3xl/app:border-l @3xl/app:border-t-0 @3xl/app:pl-5 @3xl/app:pt-0"
            {...tourTarget('profile-actions')}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-10 justify-start gap-2 rounded-lg px-2 text-fg"
              onClick={() => setEditOpen(true)}
            >
              <PencilSimpleIcon
                data-icon-motion="tilt"
                aria-hidden="true"
                size={18}
                className="shrink-0"
              />
              {t('actions.edit')}
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-10 justify-start gap-2 rounded-lg px-2 text-fg"
            >
              <Link to="/security">
                <AccountIcon size={16} className="shrink-0" />
                {t('actions.security')}
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="col-span-2 h-10 justify-start gap-2 rounded-lg px-2 text-error hover:text-error @3xl/app:col-span-1"
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOutIcon size={16} className="shrink-0" />
              {t('actions.logout')}
            </Button>
          </div>
        </div>
      </Card>

      <section aria-label={t('activity.section')} {...tourTarget('profile-activity')}>
        <SectionHead eyebrow={t('activity.section')} title={t('activity.title')} />
        <StatCards />
      </section>

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} user={user} />
    </div>
  );
}

function VerificationBadge({ user }: Readonly<{ user: AuthUser }>) {
  const { t } = useTranslation('profile');
  const { cooldown, resend } = useResendVerification(user.email);

  if (user.email_verified_at !== null) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning">
        <WarningIcon size={18} aria-hidden="true" />
        {t('verification.unverified')}
      </span>
      {cooldown > 0 ? (
        <span className="text-xs font-semibold text-fg-3">
          {t('verification.resent', { count: cooldown })}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="hit-area rounded-sm text-xs font-semibold text-accent hover:underline disabled:opacity-60"
        >
          {resend.isPending ? t('verification.resending') : t('verification.resend')}
        </button>
      )}
    </span>
  );
}

function StatCards() {
  const { t } = useTranslation('profile');
  const stats = useQuery(accountStatsQueryOptions());
  const items: ReadonlyArray<{
    id: string;
    label: string;
    value: number | undefined;
    icon: ReactNode;
    chipClass: string;
  }> = [
    {
      id: 'games',
      label: t('activity.games'),
      value: stats.data?.games_count,
      icon: <DiceFiveIcon aria-hidden="true" size={17} />,
      chipClass: 'bg-primary-100 text-primary-700',
    },
    {
      id: 'conversations',
      label: t('activity.conversations'),
      value: stats.data?.conversations_count,
      icon: <ChatsIcon aria-hidden="true" size={17} />,
      chipClass: 'bg-accent-100 text-accent',
    },
    {
      id: 'manuals',
      label: t('activity.manuals'),
      value: stats.data?.manuals_count,
      icon: <ScrollIcon aria-hidden="true" size={17} />,
      chipClass: 'bg-primary-100 text-primary-700',
    },
  ];

  return (
    <div className="grid gap-3 @md/app:grid-cols-3" aria-busy={stats.isPending}>
      {items.map((item) => (
        <Card key={item.id} className="flex items-center gap-4 p-4 @md/app:block @md/app:p-5">
          <span
            aria-hidden="true"
            className={`grid size-9 shrink-0 place-items-center rounded-xl @md/app:mb-3 ${item.chipClass}`}
          >
            {item.icon}
          </span>
          <div className="min-w-0">
            <div className="flex h-9 items-center font-display text-3xl font-extrabold leading-9 tabular-nums tracking-tight text-fg">
              {!stats.isPending && item.value === undefined ? (
                <span aria-label={t('activity.unavailable')}>–</span>
              ) : (
                <ActivityCount value={item.value} />
              )}
            </div>
            <span className="block text-sm text-fg-3 @md/app:mt-0.5 @md/app:text-xs">
              {item.label}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ActivityCount({ value }: Readonly<{ value: number | undefined }>) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, amount: 'all' });
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [started, setStarted] = useState(reducedMotion);
  const loaded = value !== undefined;
  const revealed = loaded && started;

  // Una vez visible el total, cambiar la preferencia no debe devolverlo a cero.
  if (reducedMotion && !started) setStarted(true);

  useEffect(() => {
    if (!loaded || !visible || started) return;
    // Mantén el placeholder mientras termina de entrar el perfil.
    const timer = setTimeout(() => setStarted(true), 350);
    return () => clearTimeout(timer);
  }, [loaded, started, visible]);

  return (
    <span className="relative inline-flex h-9 items-center">
      <span className="sr-only">{value}</span>
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(
          'inline-flex h-9 items-center transition-opacity duration-200 motion-reduce:transition-none',
          revealed ? 'opacity-100' : 'opacity-0',
        )}
      >
        <NumberFlow
          value={revealed ? value : 0}
          animated={!reducedMotion}
          plugins={[continuous]}
          format={{ useGrouping: false }}
          transformTiming={{ duration: 1100, easing: 'ease-out' }}
          className="leading-none [--number-flow-mask-height:0.1em]"
        />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-0 h-7 w-10 rounded-lg bg-surface-2 transition-opacity duration-200 motion-reduce:transition-none',
          revealed ? 'opacity-0' : 'opacity-100',
        )}
      />
    </span>
  );
}
