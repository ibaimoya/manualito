import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  ScanText,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { ScreenTopBar } from '@/app/Topbar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { ConversationsSection } from '@/features/conversations/ConversationsSection';
import { GameCover } from '@/features/games/GameCover';
import { RatingStars } from '@/features/games/RatingStars';
import { RateGameDialog } from '@/features/games/RateGameDialog';
import { gameDetailQueryOptions, gameExplanationQueryOptions } from '@/features/games/use-games';
import { ApiError } from '@/shared/api/client';
import type { GameDetail, GamePoolManual } from '@/shared/api/games';
import { Markdown } from '@/shared/components/Markdown';
import { gameColor } from '@/shared/lib/gameColor';

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
        back={
          <Link
            to="/history"
            className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface"
            aria-label="Volver al historial"
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </Link>
        }
      />
      {detail.isPending ? <HubSkeleton /> : null}
      {detail.isError ? <HubError /> : null}
      {detail.data ? <GameHubLoaded game={detail.data} /> : null}
    </div>
  );
}

function GameHubLoaded({ game }: Readonly<{ game: GameDetail }>) {
  const [rateOpen, setRateOpen] = useState(false);
  const ownManual = game.manuals.find((manual) => manual.is_own) ?? game.manuals[0];
  const totalPages = game.manuals.reduce((sum, manual) => sum + manual.page_count, 0);

  return (
    <>
      <div className="flex-1">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 py-5 md:px-6 md:py-8">
          <GameHeader game={game} onRate={() => setRateOpen(true)} />
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
}: Readonly<{ game: GameDetail; onRate: () => void }>) {
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
            <Badge tone="neutral" size="sm" icon={<Users strokeWidth={2} />}>
              {players}
            </Badge>
          ) : null}
          {game.playing_time_minutes === null ? null : (
            <Badge tone="neutral" size="sm" icon={<Clock strokeWidth={2} />}>
              {game.playing_time_minutes} min
            </Badge>
          )}
          <Tooltip content="Generado por IA: puede equivocarse. Si algo no cuadra, contrástalo con el manual original.">
            <Badge tone="neutral" size="sm" tabIndex={0} className="cursor-help">
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

const EXPLANATION_BLOCKS = [
  { key: 'setup', title: 'Preparación', icon: Flag, chipClass: 'bg-primary-100 text-primary-700' },
  {
    key: 'turns',
    title: '¿Cómo van los turnos?',
    icon: RefreshCw,
    chipClass: 'bg-accent-100 text-accent',
  },
  {
    key: 'victory',
    title: '¿Cómo se gana?',
    icon: Sparkles,
    chipClass: 'bg-warning-bg text-warning',
  },
] as const;

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
  return (
    <section aria-label="Explicación del juego" className="space-y-3">
      {sections.summary ? (
        <Card className="bg-surface p-4">
          <p className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            Resumen rápido
          </p>
          <Markdown className="text-base leading-relaxed text-fg">
            {sections.summary.answer}
          </Markdown>
        </Card>
      ) : null}
      <Accordion type="multiple" defaultValue={['setup']} className="space-y-3">
        {EXPLANATION_BLOCKS.map(({ key, title, icon: Icon, chipClass }) => {
          const section = sections[key];
          if (!section) return null;
          return (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger headingLevel={2}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${chipClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Markdown className="text-base leading-relaxed text-fg">
                  {section.answer}
                </Markdown>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}

function formatManualDate(iso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(iso));
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
        <Button asChild variant="ghost" size="sm">
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

function ManualCard({ manual }: Readonly<{ manual: GamePoolManual }>) {
  const label = manual.title ?? (manual.source_type === 'pdf' ? 'Manual en PDF' : 'Manual en fotos');
  const body = (
    <>
      <span
        aria-hidden="true"
        className="flex h-[54px] w-[42px] shrink-0 flex-col gap-[3px] rounded-lg p-2 pt-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.25)]"
        style={{ backgroundColor: gameColor(label) }}
      >
        {[90, 65, 80, 50].map((width) => (
          <span
            key={width}
            className="h-[2.5px] rounded-full bg-[#FFF8F0]/55"
            style={{ width: `${width}%` }}
          />
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold text-fg">{label}</p>
        <p className="mono mt-0.5 text-[11px] text-fg-3">
          {manual.page_count} {manual.page_count === 1 ? 'página' : 'páginas'} ·{' '}
          {formatManualDate(manual.created_at)}
        </p>
        {manual.is_own ? (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-accent group-hover:underline">
            <ScanText size={13} strokeWidth={2} aria-hidden="true" />
            Ver texto extraído
          </span>
        ) : (
          <p className="mt-1 text-xs text-fg-3">compartido por la comunidad</p>
        )}
      </div>
    </>
  );

  // El manual propio se abre clicando la tarjeta entera, no un mini-enlace.
  if (manual.is_own) {
    return (
      <Card className="transition-colors hover:border-border-strong">
        <Link
          to="/manual/$manualId"
          params={{ manualId: manual.id }}
          aria-label={`Ver texto extraído de ${label}`}
          className="group flex items-center gap-3 p-3"
        >
          {body}
          <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-fg-3" aria-hidden="true" />
        </Link>
      </Card>
    );
  }
  return <Card className="flex items-center gap-3 p-3">{body}</Card>;
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
