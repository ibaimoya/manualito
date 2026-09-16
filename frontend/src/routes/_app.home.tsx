import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, PlusIcon, GearSixIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Meeple, Monogram } from '@/shared/components/Brand';
import { Avatar } from '@/shared/components/Avatar';
import { RecoveryNotice } from '@/shared/components/recovery/RecoveryNotice';
import { Card } from '@/components/ui/card';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Button } from '@/components/ui/button';
import { ManualCard } from '@/features/manual/ManualCard';
import { manualsQueryOptions } from '@/features/manual/use-manuals';
import { DiscoverGames } from '@/features/games/DiscoverGames';
import { HomeGreeting } from '@/features/home/HomeGreeting';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { tourTarget } from '@/features/tutorial/targets';
import { useAuth } from '@/features/auth/use-auth';
import { formatRelative } from '@/shared/lib/relativeDate';
import { type ManualSummary } from '@/shared/api/client';

export const Route = createFileRoute('/_app/home')({
  component: HomeScreen,
});

function HomeScreen() {
  const { user } = useAuth();
  const { t } = useTranslation('home');
  const manuals = useQuery(manualsQueryOptions());
  const recentManuals = manuals.data?.slice(0, 6) ?? [];
  const recentUnavailable = manuals.data === undefined && manuals.errorUpdateCount > 0;
  const loadingManuals = manuals.isPending && !recentUnavailable;
  const firstName = user?.username?.split(/\s+/)[0];
  return (
    <div className="page-frame page-stack">
      {/* En escritorio la marca ya aparece en el menú lateral. */}
      <header className="flex items-center justify-between md:hidden">
        <div className="flex items-center gap-3">
          <Monogram size={36} radius={10} />
          <span className="font-display text-xl font-bold tracking-tight">Manualito</span>
        </div>
        <div className="flex items-center gap-1">
          <HelpMenuButton />
          <Link
            to="/settings"
            className="grid size-11 place-items-center rounded-xl text-fg-2"
            aria-label={t('account.ariaLabel')}
          >
            {user ? (
              <Avatar name={user.username || user.email} size={36} />
            ) : (
              <GearSixIcon data-icon-motion="rotate" aria-hidden="true" size={20} />
            )}
          </Link>
        </div>
      </header>

      <section
        aria-labelledby="home-hello"
        className="md:flex md:items-start md:justify-between md:gap-8"
      >
        <div className="md:max-w-xl">
          <HomeGreeting firstName={firstName} />
          <p className="mt-2 text-base leading-relaxed text-fg-2 md:text-lg">
            {t('greeting.description')}
          </p>
        </div>
      </section>

      <HeroCta />

      {/* El objetivo permanece montado durante la carga y cuando no hay manuales. */}
      <div {...tourTarget('home-activity')}>
        <SkeletonSwap pending={loadingManuals} skeleton={<RecentSkeleton />}>
          {recentUnavailable ? (
            <RecoveryNotice
              title={t('error.title')}
              description={t('error.manuals')}
              onRetry={() => void manuals.refetch()}
              retrying={manuals.isFetching}
            />
          ) : recentManuals.length > 0 ? (
            <RecentManuals manuals={recentManuals} />
          ) : (
            <EmptyRecents />
          )}
        </SkeletonSwap>
      </div>

      {!loadingManuals && (
        <DiscoverGames excludedGameIds={recentManuals.map((manual) => manual.game_id)} />
      )}
    </div>
  );
}

function HeroCta() {
  const { t } = useTranslation('home');

  // @container. El HeroCta se adapta a su contenedor, no al viewport.
  return (
    <Card
      className="@container relative overflow-hidden border-0 p-5 text-fg-inv shadow-md"
      style={{
        background: 'linear-gradient(160deg, var(--m-primary-500) 0%, var(--m-primary-600) 100%)',
      }}
    >
      <div className="relative flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div className="@md:max-w-md">
          <h2 className="font-display text-lg font-bold @md:text-xl">{t('hero.title')}</h2>
          <p className="mt-1 text-sm opacity-90">{t('hero.description')}</p>
        </div>
        <Button
          asChild
          block
          size="md"
          variant="secondary"
          className="bg-bg text-primary-700 @md:w-auto @md:shrink-0 @md:px-6"
        >
          <Link to="/capture/source" {...tourTarget('nav-new-manual')}>
            <PlusIcon data-icon-motion="plus" aria-hidden="true" size={18} />
            {t('hero.newManual')}
            <ArrowRightIcon
              data-icon-motion="forward"
              aria-hidden="true"
              size={16}
              className="ml-auto @md:ml-2"
            />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function RecentManuals({ manuals }: Readonly<{ manuals: ManualSummary[] }>) {
  const { t } = useTranslation('home');

  return (
    <section aria-labelledby="home-recent">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="home-recent" className="font-display text-xl font-bold tracking-tight text-fg">
          {t('recent.heading')}
        </h2>
        <Link
          to="/history"
          aria-label={t('recent.viewAllAriaLabel')}
          className="hit-area group/all inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-accent transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/25"
        >
          <span className="underline-offset-4 group-hover/all:underline">
            {t('recent.viewAll')}
          </span>
          <ArrowRightIcon
            data-icon-motion="forward"
            size={15}
            aria-hidden="true"
            className="transition-[translate] duration-150 ease-[var(--ease-mn)] group-hover/all:translate-x-0.5"
          />
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 @xl/app:grid-cols-2 @xl/app:gap-3 @4xl/app:grid-cols-3">
        {manuals.map((m) => (
          <li key={m.id}>
            <ManualCard manual={m} meta={formatRelative(m.created_at)} className="p-4" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="mb-3 h-5 w-24 animate-pulse rounded bg-surface-2" />
      <ul className="grid grid-cols-1 gap-2.5 @xl/app:grid-cols-2 @xl/app:gap-3 @4xl/app:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-[82px] animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </ul>
    </section>
  );
}

function EmptyRecents() {
  const { t } = useTranslation('home');
  return (
    <section className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/60 px-6 py-8 text-center">
      <div
        className="grid size-14 place-items-center rounded-full bg-primary-100 text-primary-700"
        aria-hidden="true"
      >
        <Meeple size={28} color="currentColor" />
      </div>
      <p className="max-w-sm text-sm leading-relaxed text-fg-2">{t('empty.description')}</p>
      <Button asChild variant="ghost" size="sm">
        <Link to="/explore">
          {t('empty.explore')}
          <ArrowRightIcon aria-hidden="true" size={16} />
        </Link>
      </Button>
    </section>
  );
}
