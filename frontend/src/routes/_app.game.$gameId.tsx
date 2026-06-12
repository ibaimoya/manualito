import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  Plus,
  RotateCw,
  ScanText,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { BackLink, ScreenTopBar } from '@/app/Topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { ConversationsSection } from '@/features/conversations/ConversationsSection';
import { ExplanationBlocks } from '@/features/games/ExplanationBlocks';
import { GameCover } from '@/features/games/GameCover';
import { RatingStars } from '@/features/games/RatingStars';
import { RateGameDialog } from '@/features/games/RateGameDialog';
import { gameDetailQueryOptions, gameExplanationQueryOptions } from '@/features/games/use-games';
import { ApiError } from '@/shared/api/client';
import type { GameDetail, GamePoolManual } from '@/shared/api/games';
import { QUESTION_MAX } from '@/shared/api/conversations';
import { Markdown } from '@/shared/components/Markdown';
import { gameColor } from '@/shared/lib/gameColor';
import { formatShortDate } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/game/$gameId')({
  component: GameHubScreen,
});

const SUGGESTED_QUESTIONS = [
  '¿Quién empieza?',
  '¿Se puede pasar el turno?',
  '¿Y si empatamos?',
  '¿Cuándo acaba la partida?',
];

function GameHubScreen() {
  const { gameId } = Route.useParams();
  const detail = useQuery(gameDetailQueryOptions(gameId));

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={detail.data?.name ?? 'Juego'}
        trail={[{ label: 'Historial', link: linkOptions({ to: '/history' }) }]}
        back={<BackLink label="Volver al historial" link={linkOptions({ to: '/history' })} />}
      />
      {detail.isPending ? <HubSkeleton /> : null}
      {/* Un refetch fallido deja isError con data en cache: mejor lo cacheado. */}
      {detail.isError && detail.data === undefined ? <HubError /> : null}
      {detail.data ? <GameHubLoaded game={detail.data} /> : null}
    </div>
  );
}

function GameHubLoaded({ game }: Readonly<{ game: GameDetail }>) {
  const [rateOpen, setRateOpen] = useState(false);
  // Estrella pulsada en la cabecera: se precarga en el diálogo, no se guarda.
  const [presetScore, setPresetScore] = useState<number | null>(null);
  const ownManual = game.manuals.find((manual) => manual.is_own) ?? game.manuals[0];
  const totalPages = game.manuals.reduce((sum, manual) => sum + manual.page_count, 0);

  function openRating(score?: number): void {
    setPresetScore(score ?? null);
    setRateOpen(true);
  }

  return (
    <>
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 py-5 md:px-6 md:py-8">
          <GameHeader game={game} onRate={openRating} />
          <ExplanationSection gameId={game.id} hasManuals={game.manuals.length > 0} />
          {ownManual ? (
            <ConversationsSection manualId={ownManual.id} gameId={game.id} showViewAll />
          ) : null}
          <ManualsSection game={game} />
          {game.manuals.length > 0 ? (
            <p className="flex items-center gap-2 text-xs text-fg-3">
              <FileText size={14} strokeWidth={2} aria-hidden="true" />
              Explicación generada de {game.manuals.length}{' '}
              {game.manuals.length === 1 ? 'manual' : 'manuales'} ·{' '}
              <span className="mono">
                {totalPages} {totalPages === 1 ? 'página' : 'páginas'}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <HubComposer game={game} chatManualId={ownManual?.id ?? null} />

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

function playersLabel(game: GameDetail): string | null {
  if (game.min_players === null && game.max_players === null) return null;
  if (game.min_players !== null && game.max_players !== null) {
    return game.min_players === game.max_players
      ? `${game.min_players} jugadores`
      : `${game.min_players}–${game.max_players} jugadores`;
  }
  return `${game.min_players ?? game.max_players} jugadores`;
}

function GameHeader({
  game,
  onRate,
}: Readonly<{ game: GameDetail; onRate: (score?: number) => void }>) {
  const players = playersLabel(game);
  const yearSuffix = game.year_published === null ? '' : ` · ${game.year_published}`;
  return (
    <header className="flex items-center gap-5 md:gap-6">
      <GameCover name={game.name} size={120} />
      <div className="min-w-0 flex-1">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          Juego de mesa{yearSuffix}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl">
          {game.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {players ? (
            <Badge tone="neutral" icon={<Users strokeWidth={2} />}>
              {players}
            </Badge>
          ) : null}
          {game.playing_time_minutes === null ? null : (
            <Badge tone="neutral" icon={<Clock strokeWidth={2} />}>
              {game.playing_time_minutes} min
            </Badge>
          )}
          <Tooltip content="Generado por IA: puede equivocarse. Si algo no cuadra, contrástalo con el manual original.">
            <Badge tone="neutral" tabIndex={0} className="cursor-help">
              <Sparkles size={12} strokeWidth={2} aria-hidden="true" />
              Generado con IA
            </Badge>
          </Tooltip>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center">
          <RatingStars value={game.my_rating?.score ?? 0} size={26} align="start" onSelect={onRate} />
        </div>
      </div>
    </header>
  );
}

function ExplanationSection({
  gameId,
  hasManuals,
}: Readonly<{ gameId: string; hasManuals: boolean }>) {
  const explanation = useQuery({
    ...gameExplanationQueryOptions(gameId),
    enabled: hasManuals,
  });

  if (!hasManuals) {
    return (
      <Card className="border-dashed border-border-strong bg-surface p-6 text-center">
        <h2 className="font-display text-lg font-bold text-fg">Aún no hay manuales</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg-2">
          Sube el manual de este juego y te lo explicamos en claro: preparación, turnos y cómo se
          gana.
        </p>
        <Button asChild className="mt-4">
          <Link to="/capture/source">
            <Plus size={16} strokeWidth={2} />
            Subir manual
          </Link>
        </Button>
      </Card>
    );
  }

  if (explanation.isPending) return <ExplanationSkeleton />;

  if (explanation.isError) {
    const notFound = explanation.error instanceof ApiError && explanation.error.status === 404;
    return (
      <Card className="bg-surface p-5">
        <p className="text-sm leading-relaxed text-fg">
          {notFound
            ? 'El manual aún se está indexando: la explicación estará lista en un momento.'
            : 'No hemos podido generar la explicación. Tus manuales y conversaciones están a salvo.'}
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
          Reintentar
        </Button>
      </Card>
    );
  }

  if (explanation.data.status === 'generating' || explanation.data.sections === null) {
    return (
      <Card className="flex items-center gap-3 bg-surface p-5" role="status">
        <Loader2 size={18} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-fg">
          Estamos leyendo tus manuales y preparando la explicación… puede tardar un momento.
        </p>
      </Card>
    );
  }

  const sections = explanation.data.sections;
  const body = (section: { answer: string } | null | undefined) =>
    section ? (
      <Markdown className="text-base leading-relaxed text-fg">{section.answer}</Markdown>
    ) : null;
  return (
    <section aria-label="Explicación del juego" className="space-y-3">
      <ExplanationBlocks
        summary={body(sections.summary)}
        content={{
          setup: body(sections.setup),
          turns: body(sections.turns),
          victory: body(sections.victory),
        }}
      />
    </section>
  );
}

function ManualsSection({ game }: Readonly<{ game: GameDetail }>) {
  return (
    <section aria-labelledby="game-manuals">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            De dónde sale la explicación
          </span>
          <h2 id="game-manuals" className="font-display text-lg font-bold tracking-tight text-fg">
            Manuales · fuentes
          </h2>
        </div>
        <Button asChild variant="ghost">
          <Link to="/capture/source">
            <Plus size={15} strokeWidth={2} />
            Añadir manual
          </Link>
        </Button>
      </div>
      {game.manuals.length === 0 ? (
        <Card className="bg-surface/60 p-4">
          <p className="text-sm text-fg-2">Todavía no hay manuales de {game.name}.</p>
        </Card>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {game.manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Hoja de papel en miniatura: lomo del color del juego, esquina doblada y,
 * si el manual tiene varias páginas, una segunda hoja asomando detrás.
 */
function ManualThumb({ color, stacked }: Readonly<{ color: string; stacked: boolean }>) {
  return (
    <span aria-hidden="true" className="relative h-[58px] w-[46px] shrink-0">
      {stacked ? (
        <span className="absolute inset-0 translate-x-[3px] translate-y-[2px] rotate-3 rounded-md border border-border bg-surface-2" />
      ) : null}
      <span className="relative block size-full overflow-hidden rounded-md border border-border bg-gradient-to-b from-bg to-surface shadow-sm transition-transform group-hover:-rotate-2">
        <span className="absolute inset-y-0 left-0 w-[4px]" style={{ backgroundColor: color }} />
        <span
          className="absolute right-0 top-0 size-3.5 bg-surface-2 shadow-[-1px_1px_2px_rgba(53,28,12,0.12)]"
          style={{ clipPath: 'polygon(0 0, 100% 100%, 0 100%)' }}
        />
        <span className="absolute inset-x-2 top-3.5 flex flex-col gap-[4px] pl-[3px]">
          {[88, 64, 78, 50, 70].map((width) => (
            <span
              key={width}
              className="h-[2.5px] rounded-full bg-fg/15"
              style={{ width: `${width}%` }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}

function ManualCard({ manual }: Readonly<{ manual: GamePoolManual }>) {
  const label = manual.title ?? (manual.source_type === 'pdf' ? 'Manual en PDF' : 'Manual en fotos');
  const body = (
    <>
      <ManualThumb color={gameColor(label)} stacked={manual.page_count > 1} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold leading-tight text-fg">{label}</p>
        <p className="mono mt-1 text-[11px] text-fg-3">
          {manual.page_count} {manual.page_count === 1 ? 'página' : 'páginas'} ·{' '}
          {formatShortDate(manual.created_at)}
        </p>
        {manual.is_own ? (
          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
            <ScanText size={13} strokeWidth={2} aria-hidden="true" />
            Texto extraído
          </span>
        ) : (
          <p className="mt-1.5 text-xs text-fg-3">Compartido por la comunidad</p>
        )}
      </div>
    </>
  );

  // El manual propio se abre clicando la tarjeta entera, no un mini-enlace.
  if (manual.is_own) {
    return (
      <Card className="transition-all hover:-translate-y-px hover:border-border-strong hover:shadow-sm">
        <Link
          to="/manual/$manualId"
          params={{ manualId: manual.id }}
          aria-label={`Ver texto extraído de ${label}`}
          className="group flex items-center gap-3.5 p-3.5"
        >
          {body}
          <ChevronRight
            size={18}
            strokeWidth={2}
            className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </Card>
    );
  }
  return <Card className="flex items-center gap-3.5 p-3.5 opacity-90">{body}</Card>;
}

function HubComposer({
  game,
  chatManualId,
}: Readonly<{ game: GameDetail; chatManualId: string | null }>) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');

  function ask(q: string): void {
    const trimmed = q.trim();
    if (trimmed.length === 0 || chatManualId === null) return;
    navigate({
      to: '/chat/$manualId',
      params: { manualId: chatManualId },
      search: { q: trimmed, g: game.id },
    }).catch(() => undefined);
  }

  if (chatManualId === null) return null;

  return (
    <div
      className="sticky bottom-0 z-10 border-t border-border bg-bg/95 px-4 pt-2.5 backdrop-blur md:px-6"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <div
          className="flex snap-x gap-2 overflow-x-auto pb-2"
          aria-label="Preguntas sugeridas"
        >
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => ask(q)}
              className="h-8 shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-surface px-3 text-xs font-semibold text-fg hover:bg-surface-2"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
          className="flex items-center gap-2"
        >
          <Input
            preset="chat-message"
            value={question}
            maxLength={QUESTION_MAX}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={`Pregunta sobre ${game.name}…`}
            aria-label="Pregunta sobre el juego"
            className="flex-1 rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={question.trim().length === 0}
            aria-label="Enviar pregunta"
          >
            {/* Centrado óptico: la masa del avión cae arriba-derecha (centroide medido). */}
            <Send size={17} strokeWidth={2} style={{ transform: 'translate(-1.3px, 1.3px)' }} />
          </Button>
        </form>
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
    <div aria-hidden="true" className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 md:px-6">
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
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-xl font-bold text-fg">No hemos encontrado este juego</h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-2">
        Puede que se haya retirado del catálogo. Vuelve al historial para ver tus juegos.
      </p>
      <Button asChild className="mt-5">
        <Link to="/history">Ir al historial</Link>
      </Button>
    </div>
  );
}
