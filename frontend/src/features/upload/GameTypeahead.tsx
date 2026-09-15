import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import {
  CheckIcon,
  DiceFiveIcon,
  FileTextIcon,
  InfoIcon,
  CircleNotchIcon,
  PlusIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  WifiSlashIcon,
  XIcon,
} from '@phosphor-icons/react';
import { api, type GameSearchItem } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { highlightMatch } from '@/shared/components/highlightMatch';
import { toastApiError } from '@/shared/lib/toastApiError';
import { LiveTrans } from '@/shared/components/LiveTrans';
import { HelpIndicator } from '@/components/ui/help-indicator';
import { Tooltip } from '@/components/ui/tooltip';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 250;

type Props = Readonly<{
  onSelect: (game: GameSearchItem) => void;
  focusOnMount?: boolean;
  /** Permite añadir juegos durante la subida. */
  allowCreate?: boolean;
}>;

type Status = 'idle' | 'typing' | 'loading' | 'results' | 'empty' | 'error';

/** Busca juegos en BGG y permite añadir uno al subir un manual. */
export function GameTypeahead({ onSelect, focusOnMount, allowCreate = true }: Props) {
  const { t } = useTranslation('explore');
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

  const createMutation = useMutation({
    mutationFn: (name: string) => api.createGame(name),
    onError: (error) =>
      toastApiError(error, 'create-game', {
        title: <LiveTrans ns="explore" i18nKey="typeahead.error.createTitle" />,
        id: 'create-game-error',
        description: <LiveTrans ns="explore" i18nKey="typeahead.error.createDescription" />,
      }),
  });
  // Evita que una respuesta atrasada cambie la selección.
  const createTokenRef = useRef(0);

  const fetchedGames = data?.games ?? [];
  const settling = term.length >= MIN_CHARS && term !== debounced;
  const status = resolveStatus({
    term,
    enabled,
    isError,
    isFetching,
    settling,
    count: fetchedGames.length,
  });
  const open =
    status === 'loading' || status === 'results' || status === 'empty' || status === 'error';

  // La caché anterior no debe permitir elegir resultados que ya no se ven.
  const games = status === 'results' ? fetchedGames : [];
  const showCreateOption = allowCreate && (status === 'results' || status === 'empty');
  const optionsCount = games.length + (showCreateOption ? 1 : 0);
  const activeIndex = optionsCount > 0 ? Math.min(highlight, optionsCount - 1) : 0;

  function pickGame(game: GameSearchItem): void {
    createTokenRef.current += 1;
    onSelect(game);
  }

  function handleCreate(): void {
    if (createMutation.isPending) return;
    const name = debounced;
    const token = (createTokenRef.current += 1);
    createMutation.mutate(name, {
      onSuccess: (game) => {
        if (createTokenRef.current !== token) return;
        pickGame(game);
      },
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && query.length > 0) {
      event.preventDefault();
      reset();
      return;
    }
    if (optionsCount === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(optionsCount - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      setHighlight(next);
      document
        .getElementById(`${listId}-opt-${next}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (showCreateOption && activeIndex === games.length) {
        handleCreate();
        return;
      }
      const game = games[activeIndex];
      if (game) pickGame(game);
    }
  }

  function reset(): void {
    createTokenRef.current += 1;
    setQuery('');
    setDebounced('');
    inputRef.current?.focus();
  }

  const activeId = optionsCount > 0 ? `${listId}-opt-${activeIndex}` : undefined;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex h-12 items-center gap-2.5 border bg-bg px-3.5 transition-colors',
          open
            ? 'rounded-t-2xl border-primary'
            : 'rounded-2xl border-border-strong focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20',
        )}
      >
        <MagnifyingGlassIcon
          data-icon-motion="search"
          size={20}
          className="shrink-0 text-fg-3"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={optionsCount > 0}
          aria-controls={optionsCount > 0 ? listId : undefined}
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
            createTokenRef.current += 1;
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('typeahead.placeholder')}
          aria-label={t('typeahead.inputAriaLabel')}
          // El foco lo pinta el contenedor. El outline global aquí queda descuadrado.
          className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
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
            aria-label={t('typeahead.clearSearch')}
            className="icon-feedback grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:text-fg-2"
          >
            <XIcon size={16} className="search-clear-icon" aria-hidden="true" />
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
          optionsCount={optionsCount}
          onPick={pickGame}
          onHover={setHighlight}
          onRetry={() => {
            refetch().catch(() => undefined);
          }}
          allowCreate={allowCreate}
          creating={createMutation.isPending}
          onCreate={handleCreate}
        />
      ) : null}
    </div>
  );
}

/** Pista bajo el input mientras aún no hay búsqueda lanzada. */
function SearchHint({ status }: Readonly<{ status: Status }>) {
  const { t } = useTranslation('explore');
  if (status !== 'idle' && status !== 'typing') return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 pl-1 text-xs text-fg-3">
      <InfoIcon size={13} aria-hidden="true" />
      {status === 'idle' ? t('typeahead.searchHint.idle') : t('typeahead.searchHint.typing')}
    </p>
  );
}

/** Desplegable anclado al input. Skeleton, resultados, vacío o error. */
function ResultsDropdown({
  status,
  games,
  listId,
  query,
  activeIndex,
  optionsCount,
  onPick,
  onHover,
  onRetry,
  allowCreate,
  creating,
  onCreate,
}: Readonly<{
  status: Status;
  games: GameSearchItem[];
  listId: string;
  query: string;
  activeIndex: number;
  optionsCount: number;
  onPick: (game: GameSearchItem) => void;
  onHover: (index: number) => void;
  onRetry: () => void;
  allowCreate: boolean;
  creating: boolean;
  onCreate: () => void;
}>) {
  const { t } = useTranslation('explore');
  const showCreateOption = allowCreate && (status === 'results' || status === 'empty');
  return (
    <div className="absolute inset-x-0 top-full z-20 overflow-hidden rounded-b-2xl border border-t-0 border-primary bg-card shadow-lg">
      {/* Solo se desplazan las coincidencias. La opción de añadir queda visible. */}
      <ul
        id={listId}
        role={optionsCount > 0 ? 'listbox' : undefined}
        aria-label={t('typeahead.resultsAriaLabel')}
        className="flex max-h-64 flex-col"
      >
        <li role="presentation" className="min-h-0 flex-1 overflow-y-auto">
          <ul role="presentation">
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
            {status === 'empty' && !allowCreate ? <EmptyResult /> : null}
            {status === 'error' ? <ErrorResult onRetry={onRetry} /> : null}
          </ul>
        </li>
        {showCreateOption ? (
          <CreateGameRow
            id={`${listId}-opt-${games.length}`}
            name={query}
            active={activeIndex === games.length}
            creating={creating}
            onPick={onCreate}
            onHover={() => onHover(games.length)}
          />
        ) : null}
      </ul>
      <BggAttribution />
    </div>
  );
}

function EmptyResult() {
  const { t } = useTranslation('explore');
  return (
    <li className="px-4 py-5 text-center">
      <span className="mx-auto mb-2.5 grid size-11 place-items-center rounded-full bg-surface text-fg-3">
        <MagnifyingGlassIcon data-icon-motion="search" size={20} aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-fg">{t('typeahead.empty.search.title')}</p>
      <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-relaxed text-fg-3">
        {t('typeahead.empty.search.description')}
      </p>
    </li>
  );
}

function CreateGameRow({
  id,
  name,
  active,
  creating,
  onPick,
  onHover,
}: Readonly<{
  id: string;
  name: string;
  active: boolean;
  creating: boolean;
  onPick: () => void;
  onHover: () => void;
}>) {
  const { t } = useTranslation('explore');
  const label = t('typeahead.create.add', { game: name });
  return (
    <li role="none" className="shrink-0">
      <button
        id={id}
        type="button"
        role="option"
        aria-selected={active}
        aria-busy={creating}
        disabled={creating}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onPick}
        onMouseMove={onHover}
        title={label}
        className={cn(
          'flex min-h-12 w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60',
          active ? 'border-l-primary bg-surface' : 'border-l-transparent',
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center text-fg-3">
          {creating ? (
            <CircleNotchIcon size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <PlusIcon data-icon-motion="plus" size={18} aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-fg line-clamp-2 break-words">
          {label}
        </span>
      </button>
    </li>
  );
}

function ErrorResult({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const { t } = useTranslation('explore');
  return (
    <li className="flex items-start gap-3 px-4 py-4">
      <WifiSlashIcon size={20} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">{t('typeahead.error.title')}</p>
        <p className="mt-0.5 text-xs text-fg-3">{t('typeahead.error.description')}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface"
        >
          <ArrowClockwiseIcon data-icon-motion="rotate" size={16} aria-hidden="true" />{' '}
          {t('typeahead.error.retry')}
        </button>
      </div>
    </li>
  );
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
  const { t } = useTranslation('explore');
  const sharedManuals = t('typeahead.sharedManuals', { count: game.manuals_count });
  const option = (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left',
        active ? 'border-l-primary bg-surface' : 'border-l-transparent',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-primary-700">
        <DiceFiveIcon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
        {highlightMatch(game.name, query, MIN_CHARS)}
      </span>
      {game.manuals_count > 0 ? (
        <HelpIndicator
          passive
          icon={FileTextIcon}
          label={sharedManuals}
          className="min-h-6 shrink-0 text-xs font-normal text-fg-2 tabular-nums"
          iconClassName="size-3.5"
        >
          {game.manuals_count}
        </HelpIndicator>
      ) : null}
      <span className="mono shrink-0 text-xs text-fg-3">
        {game.year_published ?? t('typeahead.yearNotAvailable')}
      </span>
    </button>
  );
  return (
    <li role="none">
      {game.manuals_count > 0 ? <Tooltip content={sharedManuals}>{option}</Tooltip> : option}
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
        <Trans
          ns="explore"
          i18nKey="typeahead.attribution"
          components={{ strong: <strong className="font-semibold text-fg-2" /> }}
        />
      </span>
    </div>
  );
}

/** Chip del juego ya elegido, con opción de cambiarlo. */
export function SelectedGameChip({
  game,
  onChange,
}: Readonly<{ game: GameSearchItem; onChange: () => void }>) {
  const { t } = useTranslation('explore');
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-strong bg-bg p-3.5 shadow-xs">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-fg-inv">
        <DiceFiveIcon size={22} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-display text-base font-bold text-fg">{game.name}</span>
          <HelpIndicator icon={CheckIcon} tone="success" label={t('typeahead.selected.help')} />
        </div>
        <p className="mono mt-0.5 text-[11.5px] text-fg-3">
          {game.year_published ?? t('typeahead.yearNotAvailable')}
        </p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className="h-9 shrink-0 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg-2 hover:bg-surface hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        {t('typeahead.selected.change')}
      </button>
    </div>
  );
}
