import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Dice5, Info, RotateCw, Search, WifiOff, X } from 'lucide-react';
import { api, type GameSearchItem } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { highlightMatch } from '@/shared/components/highlightMatch';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

type Props = Readonly<{
  onSelect: (game: GameSearchItem) => void;
  focusOnMount?: boolean;
}>;

type Status = 'idle' | 'typing' | 'loading' | 'results' | 'empty' | 'error';

/**
 * Typeahead de juegos contra el catálogo (BoardGameGeek vía el gateway).
 * Combobox accesible (WAI-ARIA): flechas para navegar, Enter para elegir,
 * Esc para limpiar. Muestra la atribución BGG que exige su ToU.
 */
export function GameTypeahead({ onSelect, focusOnMount }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = query.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const enabled = debounced.length >= MIN_CHARS;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['games', debounced],
    queryFn: ({ signal }) => api.searchGames(debounced, signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  const games = data?.games ?? [];
  const settling = term.length >= MIN_CHARS && term !== debounced;
  const status = resolveStatus({
    term,
    enabled,
    isError,
    isFetching,
    settling,
    count: games.length,
  });
  const open =
    status === 'loading' || status === 'results' || status === 'empty' || status === 'error';

  // Índice activo saneado: si los resultados encogen, no apunta fuera de rango.
  const activeIndex = games.length > 0 ? Math.min(highlight, games.length - 1) : 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    handleSearchKeyDown({
      event,
      canReset: query.length > 0,
      status,
      games,
      activeIndex,
      onReset: reset,
      onHighlight: setHighlight,
      onSelect,
    });
  }

  function reset(): void {
    setQuery('');
    setDebounced('');
    inputRef.current?.focus();
  }

  const activeId = status === 'results' ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 border bg-bg px-3.5 transition-colors',
          open ? 'rounded-t-2xl border-primary' : 'rounded-2xl border-border-strong',
        )}
      >
        <Search size={20} className="shrink-0 text-fg-3" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="words"
          enterKeyHint="search"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={focusOnMount}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escribe el nombre del juego…"
          aria-label="Buscar juego"
          className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3"
        />
        {status === 'loading' ? (
          <span
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-surface-2 border-t-primary"
            aria-hidden="true"
          />
        ) : null}
        {query.length > 0 && status !== 'loading' ? (
          <button
            type="button"
            onClick={reset}
            aria-label="Limpiar búsqueda"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg-2"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <SearchHint status={status} />

      {open ? (
        <ResultsDropdown
          status={status}
          games={games}
          listId={listId}
          query={debounced}
          activeIndex={activeIndex}
          onPick={onSelect}
          onHover={setHighlight}
          onRetry={() => {
            refetch().catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}

/** Pista bajo el input mientras aún no hay búsqueda lanzada. */
function SearchHint({ status }: Readonly<{ status: Status }>) {
  if (status !== 'idle' && status !== 'typing') return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 pl-1 text-xs text-fg-3">
      <Info size={13} aria-hidden="true" />
      {status === 'idle'
        ? 'Escribe al menos 3 letras para buscar en el catálogo.'
        : 'Sigue escribiendo… (mínimo 3 letras)'}
    </p>
  );
}

/** Desplegable anclado al input: skeleton, resultados, vacío o error. */
function ResultsDropdown({
  status,
  games,
  listId,
  query,
  activeIndex,
  onPick,
  onHover,
  onRetry,
}: Readonly<{
  status: Status;
  games: GameSearchItem[];
  listId: string;
  query: string;
  activeIndex: number;
  onPick: (game: GameSearchItem) => void;
  onHover: (index: number) => void;
  onRetry: () => void;
}>) {
  return (
    <div className="absolute inset-x-0 top-full z-20 overflow-hidden rounded-b-2xl border border-t-0 border-primary bg-bg shadow-lg">
      <ul id={listId} aria-label="Resultados" className="max-h-64 overflow-y-auto">
        {status === 'loading' ? <ResultSkeleton /> : null}

        {status === 'results'
          ? games.map((game, index) => (
              <ResultRow
                key={game.id}
                id={`${listId}-opt-${index}`}
                game={game}
                query={query}
                active={index === activeIndex}
                onPick={() => onPick(game)}
                onHover={() => onHover(index)}
              />
            ))
          : null}

        {status === 'empty' ? <EmptyResult /> : null}
        {status === 'error' ? <ErrorResult onRetry={onRetry} /> : null}
      </ul>
      <BggAttribution />
    </div>
  );
}

function EmptyResult() {
  return (
    <li className="px-4 py-6 text-center">
      <span className="mx-auto mb-2.5 grid size-11 place-items-center rounded-full bg-surface text-fg-3">
        <Search size={20} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-fg">No encontramos ese juego</p>
      <p className="mt-1 text-xs text-fg-3">
        Revisa la ortografía o prueba con el nombre original.
      </p>
    </li>
  );
}

function ErrorResult({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <li className="flex items-start gap-3 px-4 py-4">
      <WifiOff size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">No pudimos buscar</p>
        <p className="mt-0.5 text-xs text-fg-3">Revisa tu conexión e inténtalo de nuevo.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface"
        >
          <RotateCw size={14} aria-hidden="true" /> Reintentar
        </button>
      </div>
    </li>
  );
}

function handleSearchKeyDown({
  event,
  canReset,
  status,
  games,
  activeIndex,
  onReset,
  onHighlight,
  onSelect,
}: {
  event: KeyboardEvent<HTMLInputElement>;
  canReset: boolean;
  status: Status;
  games: GameSearchItem[];
  activeIndex: number;
  onReset: () => void;
  onHighlight: (index: number) => void;
  onSelect: (game: GameSearchItem) => void;
}): void {
  if (event.key === 'Escape' && canReset) {
    event.preventDefault();
    onReset();
    return;
  }
  if (status !== 'results') return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    onHighlight(Math.min(games.length - 1, activeIndex + 1));
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    onHighlight(Math.max(0, activeIndex - 1));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const game = games[activeIndex];
    if (game) onSelect(game);
  }
}

function resolveStatus({
  term,
  enabled,
  isError,
  isFetching,
  settling,
  count,
}: {
  term: string;
  enabled: boolean;
  isError: boolean;
  isFetching: boolean;
  settling: boolean;
  count: number;
}): Status {
  if (term.length === 0) return 'idle';
  if (term.length < MIN_CHARS) return 'typing';
  if (settling || (isFetching && count === 0)) return 'loading';
  if (!enabled) return 'typing';
  if (isError) return 'error';
  return count > 0 ? 'results' : 'empty';
}

function ResultRow({
  id,
  game,
  query,
  active,
  onPick,
  onHover,
}: Readonly<{
  id: string;
  game: GameSearchItem;
  query: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}>) {
  return (
    <li>
      <button
        id={id}
        type="button"
        // mousedown (no click): elige antes de que el input pierda foco.
        onMouseDown={(event) => {
          event.preventDefault();
          onPick();
        }}
        onMouseMove={onHover}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left transition-colors',
          active ? 'border-l-primary bg-surface' : 'border-l-transparent hover:bg-surface',
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary-700">
          <Dice5 size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
          {highlightMatch(game.name, query, MIN_CHARS)}
        </span>
        <span className="mono shrink-0 text-xs text-fg-3">{game.year_published ?? 's/f'}</span>
      </button>
    </li>
  );
}

function ResultSkeleton() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex items-center gap-3 px-3.5 py-2.5" aria-hidden="true">
          <span className="size-9 shrink-0 animate-pulse rounded-lg bg-surface" />
          <span className="h-3 flex-1 animate-pulse rounded bg-surface" />
          <span className="h-2.5 w-8 animate-pulse rounded bg-surface" />
        </li>
      ))}
    </>
  );
}

function BggAttribution() {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-surface px-3.5 py-2.5">
      <span className="mono grid size-[22px] shrink-0 place-items-center rounded-md bg-accent text-[10px] font-bold tracking-tight text-fg-inv">
        BGG
      </span>
      <span className="text-[11.5px] font-medium text-fg-3">
        Powered by <strong className="font-semibold text-fg-2">BoardGameGeek</strong>
      </span>
    </div>
  );
}

/** Chip del juego ya elegido, con opción de cambiarlo. */
export function SelectedGameChip({
  game,
  onChange,
}: Readonly<{ game: GameSearchItem; onChange: () => void }>) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-strong bg-bg p-3.5 shadow-xs">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-fg-inv">
        <Dice5 size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-base font-bold text-fg">{game.name}</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-xs font-bold text-success">
            <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Elegido
          </span>
        </div>
        <p className="mono mt-0.5 text-[11.5px] text-fg-3">{game.year_published ?? 's/f'}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="h-9 shrink-0 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg-2 hover:bg-surface hover:text-fg"
      >
        Cambiar
      </button>
    </div>
  );
}
