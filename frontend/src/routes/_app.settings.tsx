import { createFileRoute, Link } from '@tanstack/react-router';
import { CaretRightIcon, MoonIcon, SunIcon, CircleHalfIcon } from '@phosphor-icons/react';
import { LogOutIcon } from '@/shared/components/action-icons';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme, type AccentVariant, type ThemeMode } from '@/app/theme';
import { DeleteAccountButton } from '@/features/account/DeleteAccount';
import { useAuth, useLogout } from '@/features/auth/use-auth';
import { LanguageCards } from '@/features/language/LanguageCards';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { tourTarget } from '@/features/tutorial/targets';
import type { TourTarget } from '@/features/tutorial/types';
import { Avatar } from '@/shared/components/Avatar';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsScreen,
});

function SettingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation('settings');

  return (
    <div className="page-frame page-stack mx-auto max-w-4xl">
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          {t('heading')}
        </h1>
        <HelpMenuButton className="-mr-2 md:hidden" />
      </header>

      <div className="flex flex-col gap-6">
        <AccountSection />

        <Group title={t('appearance.group')}>
          {/* Hint estático que no cambia al alternar el modo */}
          <Row
            label={t('appearance.theme')}
            hint={t('appearance.themeHint')}
            stacked
            tour="settings-theme"
          >
            <SegmentedControl<ThemeMode>
              value={theme.mode}
              onChange={theme.setMode}
              ariaLabel={t('appearance.themeModeAriaLabel')}
              options={[
                {
                  value: 'light',
                  label: t('appearance.themeModes.light'),
                  icon: (
                    <SunIcon
                      aria-hidden="true"
                      size={16}
                      weight={theme.mode === 'light' ? 'duotone' : undefined}
                    />
                  ),
                },
                {
                  value: 'dark',
                  label: t('appearance.themeModes.dark'),
                  icon: (
                    <MoonIcon
                      aria-hidden="true"
                      size={16}
                      weight={theme.mode === 'dark' ? 'duotone' : undefined}
                    />
                  ),
                },
                {
                  value: 'auto',
                  label: t('appearance.themeModes.auto'),
                  icon: (
                    <CircleHalfIcon
                      aria-hidden="true"
                      size={16}
                      weight={theme.mode === 'auto' ? 'duotone' : undefined}
                    />
                  ),
                },
              ]}
            />
          </Row>
          <Row
            label={t('appearance.accentColor')}
            hint={t('appearance.accentColorHint')}
            tour="settings-accent"
          >
            <SegmentedControl<AccentVariant>
              value={theme.accent}
              onChange={theme.setAccent}
              ariaLabel={t('appearance.accentColorAriaLabel')}
              options={[
                { value: 'amber', label: t('appearance.accentColors.amber') },
                { value: 'blue', label: t('appearance.accentColors.blue') },
              ]}
            />
          </Row>
          <Row
            label={t('appearance.language')}
            hint={t('appearance.languageHint')}
            stacked
            tour="settings-language"
          >
            <LanguageCards />
          </Row>
        </Group>

        <PrivacyDataSection />
      </div>

      <footer className="mt-2 flex justify-center">
        <Link
          to="/privacy"
          className="hit-area rounded-sm text-xs font-medium text-fg-3 underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          {t('footer.privacyPolicy')}
        </Link>
      </footer>
    </div>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const logout = useLogout();
  const { t } = useTranslation('settings');

  if (!user) return null;
  const displayName = user.username || user.email;

  return (
    <Group title={t('account.group')}>
      <Link
        to="/profile"
        {...tourTarget('settings-account')}
        className="icon-feedback flex items-center gap-3.5 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <Avatar
          name={displayName}
          size={52}
          color={user.avatar_color}
          figure={user.avatar_figure}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-fg">{displayName}</p>
          <p className="truncate text-sm text-fg-3">{t('account.description')}</p>
        </div>
        <CaretRightIcon
          data-icon-motion="forward"
          size={18}
          className="shrink-0 text-fg-3"
          aria-hidden="true"
        />
      </Link>

      <Row label={t('account.logout')} hint={t('account.logoutHint')}>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-error hover:text-error"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <LogOutIcon size={16} />
          {t('account.logoutAction')}
        </Button>
      </Row>
    </Group>
  );
}

function PrivacyDataSection() {
  const { user } = useAuth();
  const { t } = useTranslation('settings');

  return (
    <Group title={t('privacy.group')} tour="settings-privacy">
      <Row label={t('privacy.files')} hint={t('privacy.filesHint')} />
      {user ? (
        <Row label={t('privacy.deleteAccount')} hint={t('privacy.deleteAccountHint')}>
          <DeleteAccountButton username={user.username} />
        </Row>
      ) : null}
    </Group>
  );
}

function Group({
  title,
  hint,
  tour,
  children,
}: Readonly<{ title: string; hint?: string; tour?: TourTarget; children: ReactNode }>) {
  return (
    <section aria-label={title} {...(tour ? tourTarget(tour) : {})}>
      <div className="mb-2.5 px-1">
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-fg-3">{hint}</p> : null}
      </div>
      <Card className="divide-y divide-border overflow-hidden">{children}</Card>
    </section>
  );
}

function Row({
  label,
  hint,
  stacked,
  tour,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  /** Control ancho en móvil bajo el label */
  stacked?: boolean;
  tour?: TourTarget;
  children?: ReactNode;
}>) {
  return (
    <div
      {...(tour ? tourTarget(tour) : {})}
      className={cn(
        'gap-[var(--m-space-3)] p-[var(--m-space-4)]',
        stacked ? 'flex flex-col items-end md:flex-row md:items-center' : 'flex items-center',
      )}
    >
      <div className={cn('flex-1', stacked && 'self-stretch')}>
        <div className="font-semibold text-fg">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-fg-3">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}
