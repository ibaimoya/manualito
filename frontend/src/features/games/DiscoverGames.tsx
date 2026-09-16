import { type ReactNode, useEffect, useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import {
  CaretRightIcon,
  WarningCircleIcon,
  CircleNotchIcon,
  ArrowCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { tourTarget } from '@/features/tutorial/targets';
import { type GameSearchItem } from '@/shared/api/client';
import { GameCover } from './GameCover';
import { ShuffleGlyph } from './ShuffleGlyph';
import { discoverGamesQueryOptions } from './use-discover-games';

export function DiscoverGames({
  emptyState,
  excludedGameIds = [],
}: Readonly<{ emptyState?: ReactNode; excludedGameIds?: readonly string[] }>) {
  const { t } = useTranslation('explore');
  const headingId = useId();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const {
    data: games = [],
    isPending,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useQuery(discoverGamesQueryOptions(excludedGameIds));
  if (isSuccess && games.length === 0) return emptyState ?? null;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3"
      {...tourTarget('explore-suggestions')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="font-display text-lg font-semibold text-fg">
          {t('discovery.heading')}
        </h2>
        {games.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('discovery.shuffle')}
            className="shuffle-button hit-area rounded-full transition-[color,scale] hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-600 motion-safe:enabled:active:scale-95 disabled:opacity-100"
            disabled={isFetching}
            aria-busy={isFetching || undefined}
            onClick={() => void refetch()}
          >
            <ShuffleFeedbackGlyph pending={isFetching} />
          </Button>
        )}
      </div>

      <SkeletonSwap
        pending={isPending}
        skeleton={
          <div
            role="status"
            aria-label={t('discovery.loading')}
            className="grid gap-3 @2xl/app:grid-cols-2 @4xl/app:grid-cols-3"
          >
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-[90px] animate-pulse rounded-2xl bg-surface" />
            ))}
          </div>
        }
      >
        {games.length > 0 && (
          <ul className="grid gap-3 @2xl/app:grid-cols-2 @4xl/app:grid-cols-3">
            {games.map((game) => (
              <motion.li
                key={game.id}
                layout={reducedMotion ? false : 'position'}
                transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                className="min-w-0"
              >
                <DiscoverGameCard game={game} />
              </motion.li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-4 rounded-2xl border border-border bg-card p-4 @xl/app:grid-cols-[auto_1fr_auto] @xl/app:p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-primary-100 text-primary-700">
              <WarningCircleIcon size={20} aria-hidden="true" />
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
              <ArrowCounterClockwiseIcon
                data-icon-motion="rotate-back"
                size={18}
                aria-hidden="true"
              />
              {t('typeahead.error.retry')}
            </Button>
          </div>
        )}
      </SkeletonSwap>
    </section>
  );
}

/** Conserva ambos iconos y espera 200 ms en cada petición antes de mostrar la carga. */
function ShuffleFeedbackGlyph({ pending }: Readonly<{ pending: boolean }>) {
  const [spinner, setSpinner] = useState({ pending, visible: false });

  if (pending !== spinner.pending) {
    setSpinner({ pending, visible: false });
  }

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setSpinner({ pending, visible: true }), 200);
    return () => clearTimeout(timer);
  }, [pending]);

  const spinnerVisible = pending && spinner.visible;

  return (
    <span className="state-icon" data-active={spinnerVisible} aria-hidden="true">
      <span>
        <ShuffleGlyph />
      </span>
      <span>
        <CircleNotchIcon
          size={20}
          data-icon="spinner"
          className="motion-safe:animate-spin"
          style={{ animationPlayState: spinnerVisible ? 'running' : 'paused' }}
        />
      </span>
    </span>
  );
}

function DiscoverGameCard({ game }: Readonly<{ game: GameSearchItem }>) {
  const { t } = useTranslation('explore');
  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: game.id }}
      aria-label={t('discovery.openGame', { name: game.name })}
      className="game-preview flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3 hover:border-border-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
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
      <CaretRightIcon
        data-icon-motion="forward"
        size={16}
        className="shrink-0 text-fg-3"
        aria-hidden="true"
      />
    </Link>
  );
}
