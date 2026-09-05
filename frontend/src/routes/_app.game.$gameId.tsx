import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, RotateCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ScreenTopBar } from '@/app/Topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Tooltip } from '@/components/ui/tooltip';
import { ConversationsSection } from '@/features/conversations/ConversationsSection';
import { MessageComposer } from '@/features/conversations/MessageComposer';
import { ExplanationBlocks } from '@/features/games/ExplanationBlocks';
import { FollowButton } from '@/features/games/FollowButton';
import { GameHeroCover } from '@/features/games/GameHeroCover';
import { DuplicatePagesBadge } from '@/features/manual/DuplicatePagesBadge';
import { ManualThumbnail } from '@/features/manual/ManualThumbnail';
import { useProcessingManuals } from '@/features/manual/use-manuals';
import { RatingStars } from '@/features/games/RatingStars';
import { RateGameDialog } from '@/features/games/RateGameDialog';
import { SuggestedQuestions } from '@/features/games/SuggestedQuestions';
import { gameDetailQueryOptions, gameExplanationQueryOptions } from '@/features/games/use-games';
import { ApiError } from '@/shared/api/client';
import { AddManualIcon, ExtractedTextIcon } from '@/shared/components/action-icons';
import {
  type ExplanationSectionKey,
  type GameDetail,
  type GamePoolManual,
} from '@/shared/api/games';
import { QUESTION_MAX } from '@/shared/api/conversations';
import { gameColor } from '@/shared/lib/gameColor';
import { formatShortDate } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/game/$gameId')({
  component: GameHubScreen,
});

function GameHubScreen() {
  const { t } = useTranslation('game');
  const { gameId } = Route.useParams();
  const detail = useQuery(gameDetailQueryOptions(gameId));

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={detail.data?.name ?? t('navigation.game')}
        trail={[{ label: t('navigation.library'), link: linkOptions({ to: '/history' }) }]}
      />
      <SkeletonSwap pending={detail.isPending} skeleton={<HubSkeleton />} className="grow">
        {/* Un refetch fallido deja isError con data en cache: mejor lo cacheado. */}
        {detail.isError && detail.data === undefined ? <HubError /> : null}
        {detail.data ? <GameHubLoaded key={detail.data.id} game={detail.data} /> : null}
      </SkeletonSwap>
    </div>
  );
}

function GameHubLoaded({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  const [rateOpen, setRateOpen] = useState(false);
  // Estrella pulsada en la cabecera: se precarga en el diálogo, no se guarda.
  const [presetScore, setPresetScore] = useState<number | null>(null);
  const canAsk = game.manuals.length > 0;
  const totalPages = game.manuals.reduce((sum, manual) => sum + manual.page_count, 0);

  function openRating(score?: number): void {
    setPresetScore(score ?? null);
    setRateOpen(true);
  }

  return (
    <>
      <div className="flex-1">
        <div className="page-frame page-stack">
          <GameHeader game={game} onRate={openRating} />
          <ExplanationSection gameId={game.id} hasManuals={canAsk} />
          {canAsk || game.conversations_count > 0 ? (
            <ConversationsSection gameId={game.id} canAsk={canAsk} showViewAll />
          ) : null}
          <ManualsSection game={game} />
          {game.manuals.length > 0 ? (
            <p className="flex items-center gap-2 text-xs text-fg-3">
              <FileText size={14} strokeWidth={2} aria-hidden="true" />
              {t('footer.explanation', { count: game.manuals.length })} ·{' '}
              <span className="mono">{t('footer.pages', { count: totalPages })}</span>
            </p>
          ) : null}
        </div>
      </div>

      <HubComposer game={game} />

      <RateGameDialog
        open={rateOpen}
        onOpenChange={setRateOpen}
        gameId={game.id}
        gameName={game.name}
        current={game.my_rating}
        initialScore={presetScore}
      />
    </>
  );
}

function GameHeader({
  game,
  onRate,
}: Readonly<{ game: GameDetail; onRate: (score?: number) => void }>) {
  const { t } = useTranslation('game');
  const { gameIds } = useProcessingManuals();
  return (
    <header className="flex flex-wrap items-center gap-5 @2xl/app:flex-nowrap @2xl/app:gap-6">
      <GameHeroCover name={game.name} processing={gameIds.has(game.id)} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          {game.year_published === null
            ? t('header.boardGame')
            : t('header.boardGameWithYear', { year: game.year_published })}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl">
          {game.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tooltip content={t('header.aiTooltip')}>
            <Badge tone="neutral" tabIndex={0} className="cursor-help">
              <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
              {t('header.aiBadge')}
            </Badge>
          </Tooltip>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <RatingStars
            value={game.my_rating?.score ?? 0}
            size={26}
            align="start"
            onSelect={onRate}
          />
          <FollowButton gameId={game.id} following={game.is_following} />
        </div>
      </div>
    </header>
  );
}

function ExplanationSection({
  gameId,
  hasManuals,
}: Readonly<{ gameId: string; hasManuals: boolean }>) {
  const { t } = useTranslation('game');
  const explanation = useQuery({
    ...gameExplanationQueryOptions(gameId),
    enabled: hasManuals,
  });

  if (!hasManuals) {
    return (
      <Card className="border-dashed border-border-strong bg-surface p-6 text-center">
        <h2 className="font-display text-lg font-bold text-fg">{t('explanation.empty.title')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg-2">
          {t('explanation.empty.description')}
        </p>
        <Button asChild className="mt-4">
          <Link to="/capture/source" search={{ gameId }}>
            <AddManualIcon size={18} strokeWidth={2} />
            {t('manuals.add')}
          </Link>
        </Button>
      </Card>
    );
  }

  // Un sondeo fallido con datos en cache: mejor seguir mostrando lo que haya.
  if (explanation.isError && explanation.data === undefined) {
    const notFound = explanation.error instanceof ApiError && explanation.error.status === 404;
    return (
      <Card className="bg-surface p-5">
        <p className="text-sm leading-relaxed text-fg">
          {notFound ? t('explanation.error.notFound') : t('explanation.error.failed')}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            explanation.refetch().catch(() => undefined);
          }}
        >
          <RotateCw size={14} strokeWidth={2} />
          {t('explanation.retry')}
        </Button>
      </Card>
    );
  }

  // Sin datos aún o generando: el resumen llega primero y el resto se rellena;
  // los huecos pendientes se pintan con spinner. Listo: las 4 secciones están.
  const data = explanation.data;
  const sections = data?.sections ?? {};
  if (data?.status === 'failed' && Object.keys(sections).length === 0) {
    return (
      <Card className="border-error/30 bg-error-bg p-5">
        <p className="text-sm leading-relaxed text-fg">{t('explanation.error.failed')}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            explanation.refetch().catch(() => undefined);
          }}
        >
          <RotateCw size={14} strokeWidth={2} />
          {t('explanation.retry')}
        </Button>
      </Card>
    );
  }
  const live = data?.status === 'generating';
  const busy = data === undefined || live;
  const pick = (key: ExplanationSectionKey) => sections[key]?.answer ?? null;

  return (
    <section
      aria-label={busy ? t('explanation.aria.preparing') : t('explanation.aria.game')}
      aria-busy={busy || undefined}
      className="space-y-3"
    >
      <ExplanationBlocks
        summary={pick('summary')}
        content={{ setup: pick('setup'), turns: pick('turns'), victory: pick('victory') }}
      />
    </section>
  );
}

function ManualsSection({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  return (
    <section aria-labelledby="game-manuals">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            {t('manuals.sourceLabel')}
          </span>
          <h2 id="game-manuals" className="font-display text-lg font-bold tracking-tight text-fg">
            {t('manuals.heading')}
          </h2>
        </div>
        <Button asChild variant="ghost" className="shrink-0 px-0">
          <Link to="/capture/source" search={{ gameId: game.id }}>
            <AddManualIcon size={18} strokeWidth={2} />
            {t('manuals.add')}
          </Link>
        </Button>
      </div>
      {game.manuals.length === 0 ? (
        <Card className="bg-surface/60 p-4">
          <p className="text-sm text-fg-2">{t('manuals.empty', { gameName: game.name })}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {game.manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual} />
          ))}
        </div>
      )}
    </section>
  );
}

function ManualCard({ manual }: Readonly<{ manual: GamePoolManual }>) {
  const { t } = useTranslation('game');
  const label = manual.title ?? t(manual.source_type === 'pdf' ? 'manuals.pdf' : 'manuals.photos');
  const body = (
    <>
      <ManualThumbnail color={gameColor(label)} stacked={manual.page_count > 1} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight text-fg">{label}</p>
        <p className="mono mt-1 text-[11px] text-fg-3">
          {t('manuals.pages', { count: manual.page_count })} · {formatShortDate(manual.created_at)}
        </p>
        {manual.duplicate_page_count > 0 ? (
          <div className="mt-1.5">
            <DuplicatePagesBadge count={manual.duplicate_page_count} />
          </div>
        ) : null}
        {manual.is_own ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ExtractedTextIcon size={13} strokeWidth={2} />
            {t('manuals.extracted')}
          </span>
        ) : (
          <p className="mt-1.5 text-xs text-fg-3">{t('manuals.shared')}</p>
        )}
      </div>
    </>
  );

  // El manual propio se abre clicando la tarjeta entera, no un mini-enlace.
  if (manual.is_own) {
    return (
      <Card className="manual-interaction transition-none hover:border-border-strong">
        <Link
          to="/manual/$manualId"
          params={{ manualId: manual.id }}
          aria-label={t('manuals.viewExtracted', { label })}
          className="manual-open icon-feedback flex items-center gap-3.5 rounded-2xl p-3.5"
        >
          {body}
          <ChevronRight
            size={18}
            strokeWidth={2}
            className="shrink-0 text-fg-3"
            aria-hidden="true"
          />
        </Link>
      </Card>
    );
  }
  return <Card className="flex items-center gap-3.5 p-3.5 opacity-90">{body}</Card>;
}

function HubComposer({ game }: Readonly<{ game: GameDetail }>) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [writing, setWriting] = useState(false);
  const canAsk = game.manuals.length > 0;

  function ask(q: string): void {
    const trimmed = q.trim();
    if (trimmed.length === 0 || !canAsk) return;
    navigate({
      to: '/chat/$gameId',
      params: { gameId: game.id },
      search: { q: trimmed },
    }).catch(() => undefined);
  }

  if (!canAsk) return null;

  return (
    <div
      className="sticky bottom-0 z-10 border-t border-border bg-bg/95 pt-2.5 backdrop-blur"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div className="page-frame">
        <SuggestedQuestions onSelect={ask} suspended={writing || question.length > 0} />
        <div
          onFocus={() => setWriting(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setWriting(false);
          }}
        >
          <MessageComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => ask(question)}
            placeholder={t('composer.placeholder', { gameName: game.name })}
            maxLength={QUESTION_MAX}
          />
        </div>
      </div>
    </div>
  );
}

function ExplanationSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div aria-hidden="true" className="page-frame page-stack">
      <div className="flex gap-5">
        <div className="size-24 animate-pulse rounded-3xl bg-surface-2" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
          <div className="h-8 w-1/2 animate-pulse rounded-xl bg-surface-2" />
          <div className="h-5 w-2/3 animate-pulse rounded-full bg-surface-2" />
        </div>
      </div>
      <ExplanationSkeleton />
    </div>
  );
}

function HubError() {
  const { t } = useTranslation('game');
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-xl font-bold text-fg">{t('error.notFoundTitle')}</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-2">{t('error.notFoundDescription')}</p>
      <Button asChild className="mt-5">
        <Link to="/history">{t('error.backToHistory')}</Link>
      </Button>
    </div>
  );
}
