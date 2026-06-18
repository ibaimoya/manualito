import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleCheck,
  Clock,
  Dice5,
  FileText,
  Image as ImageIcon,
  Lock,
  Plus,
  RotateCw,
  ScrollText,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Fragment, useState, type ReactElement, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Meeple } from '@/shared/components/Brand';
import { GameCover } from '@/features/games/GameCover';
import { GameJumpSearch } from '@/features/games/GameJumpSearch';
import { myGamesQueryOptions } from '@/features/games/use-games';
import {
  manualsQueryOptions,
  useDeleteManual,
  useManualProgress,
  useProcessingManuals,
} from '@/features/manual/use-manuals';
import { DuplicatePagesBadge } from '@/features/manual/DuplicatePagesBadge';
import { Spinner } from '@/components/ui/spinner';
import { type ManualStatus, type ManualSummary } from '@/shared/api/client';
import { type MyGame, type MyGamesResponse } from '@/shared/api/games';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/history')({
  component: HistoryScreen,
});

type View = 'games' | 'manuals';

const GAME_GRID = 'grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(208px,1fr))]';
const MANUAL_GRID = 'grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]';

function HistoryScreen() {
  const [view, setView] = useState<View>('games');
  const [manualQuery, setManualQuery] = useState('');
  const games = useQuery(myGamesQueryOptions());
  const manuals = useQuery(manualsQueryOptions());

  const gameItems = games.data?.games ?? [];
  const manualItems = manuals.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-12 pt-4 md:px-8 md:pt-8">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg md:text-3xl">
        Mi biblioteca
      </h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <SegmentedControl
          value={view}
          onChange={setView}
          ariaLabel="Cambiar entre juegos y manuales"
          options={[
            { value: 'games', label: 'Juegos', icon: <Dice5 strokeWidth={2} />, count: games.data?.games.length },
            { value: 'manuals', label: 'Manuales', icon: <ScrollText strokeWidth={2} />, count: manuals.data?.length },
          ]}
        />
        <div className="sm:ml-auto sm:w-80">
          {view === 'games' && gameItems.length > 0 ? <GameJumpSearch games={gameItems} /> : null}
          {view === 'manuals' && manualItems.length > 0 ? (
            <ManualFilter value={manualQuery} onChange={setManualQuery} />
          ) : null}
        </div>
      </div>

      {view === 'games' ? (
        <GamesView query={games} />
      ) : (
        <ManualsView query={manuals} filter={manualQuery} />
      )}
    </div>
  );
}

// ── Vistas ────────────────────────────────────────────────────────────────
function GamesView({ query }: Readonly<{ query: UseQueryResult<MyGamesResponse> }>) {
  if (query.isPending) {
    return (
      <div className={GAME_GRID}>
        {[0, 1, 2, 3].map((i) => (
          <GameSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (query.isError && query.data === undefined) {
    return (
      <LibError
        tab="games"
        onRetry={() => {
          query.refetch().catch(() => undefined);
        }}
      />
    );
  }
  const games = query.data?.games ?? [];
  if (games.length === 0) return <LibEmpty tab="games" />;
  return (
    <div className={GAME_GRID}>
      {games.map((game) => (
        <GameShelfCard key={game.id} game={game} />
      ))}
    </div>
  );
}

function ManualsView({
  query,
  filter,
}: Readonly<{ query: UseQueryResult<ManualSummary[]>; filter: string }>) {
  const del = useDeleteManual();
  if (query.isPending) {
    return (
      <div className={MANUAL_GRID}>
        {[0, 1, 2, 3].map((i) => (
          <ManualSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (query.isError && query.data === undefined) {
    return (
      <LibError
        tab="manuals"
        onRetry={() => {
          query.refetch().catch(() => undefined);
        }}
      />
    );
  }
  const manuals = query.data ?? [];
  if (manuals.length === 0) return <LibEmpty tab="manuals" />;

  const term = filter.trim().toLowerCase();
  const shown = term
    ? manuals.filter((m) => (m.title ?? m.game_name).toLowerCase().includes(term))
    : manuals;
  if (shown.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-fg-2">
        Ningún manual coincide con «{filter.trim()}».
      </p>
    );
  }
  return (
    <div className={MANUAL_GRID}>
      {shown.map((manual) => (
        <ManualDocCard key={manual.id} manual={manual} onDelete={() => del.mutate(manual.id)} />
      ))}
    </div>
  );
}

// ── Tarjeta de juego — estantería (portada arriba) ──────────────────────────
function GameShelfCard({ game }: Readonly<{ game: MyGame }>) {
  const { gameIds, processingByGame } = useProcessingManuals();
  const processing = gameIds.has(game.id);
  const progress = useManualProgress(processingByGame.get(game.id));
  return (
    <Link
      to="/game/$gameId"
      params={{ gameId: game.id }}
      aria-label={`Abrir ${game.name}${processing ? ' (procesando un manual)' : ''}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-[18px] border border-border bg-card text-left shadow-xs',
        'transition-[translate,box-shadow,border-color] duration-150 ease-[var(--ease-mn)]',
        'hover:-translate-y-[3px] hover:border-border-strong hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
      )}
    >
      <div className="flex justify-center px-5 pt-5">
        <div className="transition-[rotate,scale] duration-150 ease-[var(--ease-mn)] group-hover:-rotate-2 group-hover:scale-[1.02]">
          <GameCover name={game.name} size={132} radius={16} processing={processing} />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-[18px] pb-[18px] pt-4">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-[19px] font-extrabold tracking-[-0.02em] text-fg">
            {game.name}
          </span>
          {game.year_published === null ? null : (
            <span className="mono shrink-0 text-[11px] text-fg-3">{game.year_published}</span>
          )}
        </div>
        {processing ? (
          <div className="mt-1 flex flex-col gap-[7px]">
            <div className="flex items-center gap-2">
              <Spinner size={14} className="text-primary" />
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg" aria-live="polite">
                Leyendo el manual
              </span>
              <span className="mono text-[11px] font-bold tabular-nums text-primary-700">
                {progress?.pct ?? 0}%
              </span>
            </div>
            <ProgressBar pct={progress?.pct ?? 0} />
            <span className="mono text-[10.5px] tracking-[0.06em] text-fg-3">
              {progress
                ? `PÁGINA ${progress.page} DE ${progress.total} · DISPONIBLE EN UNOS SEGUNDOS`
                : 'DISPONIBLE EN UNOS SEGUNDOS'}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1 text-[13px] text-fg-2">
              <span className="inline-flex items-center gap-[5px]">
                <ScrollText size={13} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
                {game.manuals_count} {game.manuals_count === 1 ? 'manual' : 'manuales'}
              </span>
              <Dot />
              <span className="inline-flex items-center gap-[5px]">
                <Sparkles size={13} strokeWidth={2} className="text-fg-3" aria-hidden="true" />
                {game.conversations_count} {game.conversations_count === 1 ? 'chat' : 'chats'}
              </span>
            </div>
            <div className="mono mt-1.5 text-[10.5px] uppercase tracking-[0.08em] text-fg-3">
              Actividad · {formatRelative(game.last_activity_at)}
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

// ── Tarjeta de manual — fila tipo documento (estado prominente) ─────────────
function ManualDocCard({
  manual,
  onDelete,
}: Readonly<{ manual: ManualSummary; onDelete: () => void }>) {
  const [confirming, setConfirming] = useState(false);
  const st = manualStatusView(manual.status);
  const indexing = manual.status === 'indexing';
  const progress = useManualProgress(indexing ? manual.id : undefined);
  const isPdf = manual.source_type === 'pdf';
  const name = manual.title ?? manual.game_name;

  const meta: ReactElement[] = [
    <span key="format" className="inline-flex items-center gap-1 uppercase">
      {isPdf ? <FileText size={12} aria-hidden="true" /> : <ImageIcon size={12} aria-hidden="true" />}
      {isPdf ? 'PDF' : 'Fotos'}
    </span>,
    <span key="pages">{manual.page_count} pág.</span>,
    ...(manual.status === 'active'
      ? [<span key="chunks">{manual.chunks_indexed} fragmentos</span>]
      : []),
    <span key="date">{formatDate(manual.created_at)}</span>,
    ...(manual.language ? [<span key="lang" className="uppercase">{manual.language}</span>] : []),
  ];

  return (
    <div
      className={cn(
        'group relative flex gap-3.5 rounded-2xl border border-border bg-card p-3.5 shadow-xs',
        'transition-[translate,box-shadow,border-color] duration-150 ease-[var(--ease-mn)]',
        'hover:-translate-y-px hover:border-border-strong hover:shadow-sm',
      )}
    >
      <ManualThumb pdf={isPdf} processing={indexing} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={st.tone} icon={indexing ? <Spinner size={11} /> : st.icon}>
            {st.label}
          </Badge>
          <Badge
            tone={manual.visibility === 'shared' ? 'accent' : 'neutral'}
            icon={manual.visibility === 'shared' ? <Users /> : <Lock />}
          >
            {manual.visibility === 'shared' ? 'Compartido' : 'Privado'}
          </Badge>
        </div>
        <Link
          to={indexing ? '/processing/$manualId' : '/manual/$manualId'}
          params={{ manualId: manual.id }}
          search={indexing ? { name } : undefined}
          aria-label={`Abrir ${name}`}
          className="mt-[7px] truncate font-display text-[15.5px] font-bold text-fg outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:shadow-[var(--m-shadow-ring-primary)]"
        >
          {name}
        </Link>
        <div className="mt-px text-xs text-fg-3">Manual de {manual.game_name}</div>
        {manual.duplicate_page_count > 0 ? (
          <div className="mt-2">
            <DuplicatePagesBadge count={manual.duplicate_page_count} openHint />
          </div>
        ) : null}
        {indexing ? (
          <div className="mt-auto pt-[10px]">
            <div className="mb-[5px] flex items-center justify-between">
              <span
                className="mono text-[10.5px] font-semibold tracking-[0.04em] text-fg-2"
                aria-live="polite"
              >
                LEYENDO PÁGINA {progress?.page ?? 1} DE {manual.page_count}
              </span>
              <span className="mono text-[10.5px] font-bold tabular-nums text-primary-700">
                {progress?.pct ?? 0}%
              </span>
            </div>
            <ProgressBar pct={progress?.pct ?? 0} />
          </div>
        ) : (
          <div className="mono mt-auto flex flex-wrap items-center gap-2 pt-[9px] text-[10.5px] tracking-[0.04em] text-fg-3">
            {meta.map((node, i) => (
              <Fragment key={node.key}>
                {i > 0 ? <Dot /> : null}
                {node}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Borrar ${name}`}
        className="relative z-10 grid size-[30px] shrink-0 self-start place-items-center rounded-lg text-fg-3 transition-colors hover:bg-error-bg hover:text-error"
      >
        <Trash2 size={15} strokeWidth={2} />
      </button>

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirmar borrado"
          className="absolute inset-0 z-20 flex items-center gap-3 rounded-2xl border border-error bg-error-bg px-4"
        >
          <AlertTriangle size={18} strokeWidth={2} className="shrink-0 text-error" aria-hidden="true" />
          <span className="flex-1 text-[13.5px] font-medium text-fg">
            ¿Borrar este manual de {manual.game_name}?
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            Borrar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Miniatura de hoja con el formato (PDF/fotos) en una esquina. Indexándose,
 *  un barrido recorre la hoja (el sello de formato queda fuera del recorte). */
function ManualThumb({ pdf, processing = false }: Readonly<{ pdf: boolean; processing?: boolean }>) {
  return (
    <span aria-hidden="true" className="relative h-[66px] w-[52px] shrink-0 self-start">
      <span className="absolute inset-0 flex flex-col gap-1 overflow-hidden rounded-[9px] border border-border-strong bg-surface px-[9px] pb-[9px] pt-[11px] shadow-xs">
        {[88, 64, 80, 54].map((w) => (
          <span
            key={w}
            className="h-[2.5px] rounded-sm bg-border-strong"
            style={{ width: `${w}%` }}
          />
        ))}
        {processing ? <span className="proc-scan" /> : null}
      </span>
      <span
        className={cn(
          'absolute -right-[7px] -top-[7px] z-[1] grid size-6 place-items-center rounded-[7px] text-fg-inv shadow-sm',
          pdf ? 'bg-primary' : 'bg-accent',
        )}
      >
        {pdf ? <FileText size={12} /> : <ImageIcon size={12} />}
      </span>
    </span>
  );
}

// ── Filtro de manuales (filtra la lista, no navega) ─────────────────────────
function ManualFilter({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (next: string) => void }>) {
  return (
    <div className="flex h-11 w-full items-center gap-2.5 rounded-2xl border border-border-strong bg-bg px-3.5 shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20">
      <Search size={18} className="shrink-0 text-fg-3" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar entre tus manuales…"
        aria-label="Filtrar tus manuales"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar filtro"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg-2"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

// ── Estados vacío / error / carga ───────────────────────────────────────────
function LibEmpty({ tab }: Readonly<{ tab: View }>) {
  const copy =
    tab === 'games'
      ? {
          title: 'Aún no sigues ningún juego',
          hint: 'Sigue juegos desde Explorar; también empiezas a seguir uno al subir su manual, abrir un chat o valorarlo.',
        }
      : {
          title: 'Aún no has subido manuales',
          hint: 'Sube el PDF o las fotos de las reglas de un juego y Manualito las leerá por ti.',
        };
  return (
    <div className="mt-2 flex flex-col items-center gap-1.5 rounded-[20px] border-[1.5px] border-dashed border-border-strong bg-surface px-6 py-[52px] text-center">
      <div className="mb-2 flex items-end gap-1.5">
        <span className="rotate-[-12deg] opacity-30">
          <Meeple size={28} color="var(--m-text-3)" />
        </span>
        <span className="grid size-14 place-items-center rounded-[15px] bg-primary text-fg-inv shadow-md">
          <Meeple size={30} color="#FFF8F0" />
        </span>
        <span className="rotate-[12deg] opacity-30">
          <Meeple size={28} color="var(--m-text-3)" />
        </span>
      </div>
      <h2 className="font-display text-[19px] font-bold text-fg">{copy.title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-fg-2">{copy.hint}</p>
      {/* Juegos se nutre de seguir (Explorar); subir manual va solo en Manuales. */}
      {tab === 'games' ? (
        <Button asChild size="lg" className="mt-3.5">
          <Link to="/explore">
            <Search size={18} strokeWidth={2} />
            Explorar juegos
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg" className="mt-3.5">
          <Link to="/capture/source">
            <Plus size={18} strokeWidth={2} />
            Subir un manual
          </Link>
        </Button>
      )}
    </div>
  );
}

function LibError({ tab, onRetry }: Readonly<{ tab: View; onRetry: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-[18px] bg-error-bg text-error">
        <AlertTriangle size={26} />
      </span>
      <h2 className="mt-2.5 font-display text-[19px] font-bold text-fg">
        No pudimos cargar tu biblioteca
      </h2>
      <p className="max-w-sm text-sm leading-relaxed text-fg-2">
        Hubo un problema de conexión. Tus {tab === 'games' ? 'juegos' : 'manuales'} están a salvo.
      </p>
      <Button className="mt-3.5" onClick={onRetry}>
        <RotateCw size={16} strokeWidth={2} />
        Reintentar
      </Button>
    </div>
  );
}

function GameSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card px-[18px] pb-[18px] pt-5">
      <div className="mx-auto size-[132px] animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-[19px] w-3/5 animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-surface-2" />
      <div className="h-2.5 w-2/5 animate-pulse rounded bg-surface-2" />
    </div>
  );
}

function ManualSkeleton() {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-border bg-card p-3.5">
      <div className="h-[66px] w-[52px] shrink-0 animate-pulse rounded-[9px] bg-surface-2" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex gap-1.5">
          <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
        </div>
        <div className="h-[15px] w-1/2 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
        <div className="h-2.5 w-3/4 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}

// ── Utilidades de presentación ──────────────────────────────────────────────
function Dot() {
  return (
    <span aria-hidden="true" className="text-border-strong">
      ·
    </span>
  );
}

/** Barra de progreso de indexado, relleno degradado. Decorativa: el progreso
 *  real lo anuncia el texto "LEYENDO PÁGINA X DE Y · %" (con aria-live) al lado,
 *  así que la barra es solo visual y no duplica el rol progressbar. */
function ProgressBar({ pct }: Readonly<{ pct: number }>) {
  return (
    <div aria-hidden="true" className="h-[5px] overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary-600 to-primary-500 transition-[width] duration-[120ms] ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function manualStatusView(
  status: ManualStatus,
): { tone: 'success' | 'warning' | 'error' | 'neutral'; label: string; icon: ReactNode } {
  switch (status) {
    case 'active':
      return { tone: 'success', label: 'Listo', icon: <CircleCheck /> };
    case 'indexing':
      return { tone: 'warning', label: 'Procesando…', icon: <Clock /> };
    case 'failed':
      return { tone: 'error', label: 'Error', icon: <AlertTriangle /> };
    case 'pending_review':
      // OCR dudoso en alguna página (fallo o baja confianza): no es moderación,
      // avisa de que conviene repasar el texto. Ámbar + triángulo = "algo pasa".
      return { tone: 'warning', label: 'Revisar', icon: <AlertTriangle /> };
    default:
      return { tone: 'neutral', label: 'Oculto', icon: <Clock /> };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
