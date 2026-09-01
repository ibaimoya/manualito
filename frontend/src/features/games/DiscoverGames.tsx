import { type ReactNode, useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CircleAlert, Loader2, RotateCcw, Shuffle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { type GameSearchItem } from '@/shared/api/client';
import { GameCover } from './GameCover';
import { discoverGamesQueryOptions } from './use-discover-games';

export function DiscoverGames({ emptyState }: Readonly<{ emptyState?: ReactNode }>) {
  const { t } = useTranslation('explore');
  const headingId = useId();
  const {
    data: games = [],
    isPending,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery(discoverGamesQueryOptions());
  if (isSuccess && games.length === 0) return emptyState ?? null;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="font-display text-lg font-semibold text-fg">
          {t('discovery.heading')}
        </h2>
        {games.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('discovery.shuffle')}
            className="rounded-full transition-[color,transform] hover:bg-transparent hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-600 active:scale-95 disabled:opacity-100 motion-reduce:transform-none"
            disabled={isFetching}
            aria-busy={isFetching || undefined}
            onClick={() => void refetch()}
          >
            {isFetching ? (
              <PendingShuffleIcon />
            ) : (
              <Shuffle size={20} strokeWidth={1.75} aria-hidden="true" />
            )}
          </Button>
        )}
      </div>

      {isPending ? (
        <div
          role="status"
          aria-label={t('discovery.loading')}
          className="grid gap-3 @2xl/app:grid-cols-2 @4xl/app:grid-cols-3"
        >
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-[90px] animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : (
        games.length > 0 && (
          <ul className="grid gap-3 @2xl/app:grid-cols-2 @4xl/app:grid-cols-3">
            {games.map((game) => (
              <li key={game.id} className="min-w-0">
                <DiscoverGameCard game={game} />
              </li>
            ))}
          </ul>
        )
      )}

      {isError && (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-4 rounded-2xl border border-border bg-card p-4 @xl/app:grid-cols-[auto_1fr_auto] @xl/app:p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-100 text-primary-700">
            <CircleAlert size={20} aria-hidden="true" />
          </span>
          <p role="alert" className="min-w-0 text-sm font-medium leading-relaxed text-fg-2">
            {t('discovery.error')}
          </p>
          <Button
            variant="secondary"
            className="col-start-2 justify-self-start @xl/app:col-start-3"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            <RotateCcw size={16} aria-hidden="true" />
            {t('typeahead.error.retry')}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Solo se monta durante la petición, así cada carga empieza sin parpadeos. */
function PendingShuffleIcon() {
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), 200);
    return () => clearTimeout(timer);
  }, []);

  return showSpinner ? (
    <Loader2 size={20} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
  ) : (
    <Shuffle size={20} strokeWidth={1.75} aria-hidden="true" />
  );
}

function DiscoverGameCard({ game }: Readonly<{ game: GameSearchItem }>) {
  const { t } = useTranslation('explore');
  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: game.id }}
      aria-label={t('discovery.openGame', { name: game.name })}
      className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
    >
      <GameCover name={game.name} size={64} radius={14} />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 break-words font-display text-base font-semibold text-fg">
          {game.name}
        </h3>
        <p className="mt-0.5 text-xs text-fg-3">
          {t('typeahead.sharedManuals', { count: game.manuals_count })}
        </p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-fg-3" aria-hidden="true" />
    </Link>
  );
}
