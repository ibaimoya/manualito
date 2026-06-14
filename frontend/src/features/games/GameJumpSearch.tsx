import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { highlightMatch } from '@/shared/components/highlightMatch';

export type JumpGame = Readonly<{ id: string; name: string }>;

type Props = Readonly<{ games: ReadonlyArray<JumpGame> }>;

const MAX_RESULTS = 8;

/**
 * Buscador de la pestaña Juegos: filtra tus juegos en local y al elegir salta a
 * su hub. Combobox accesible (flechas, Enter, Esc), sin red ni atribución.
 */
export function GameJumpSearch({ games }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (term.length === 0) return [];
    return games.filter((g) => g.name.toLowerCase().includes(term)).slice(0, MAX_RESULTS);
  }, [games, term]);

  const open = term.length > 0;
  const activeIndex = matches.length > 0 ? Math.min(highlight, matches.length - 1) : 0;

  function go(game: JumpGame): void {
    navigate({ to: '/game/$gameId', params: { gameId: game.id } }).catch(() => undefined);
  }

  function reset(): void {
    setQuery('');
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape' && query.length > 0) {
      event.preventDefault();
      reset();
      return;
    }
    if (matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight(Math.min(matches.length - 1, activeIndex + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(Math.max(0, activeIndex - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const match = matches[activeIndex];
      if (match) go(match);
    }
  }

  return (
    <div className="relative w-full md:w-80">
      <div
        className={cn(
          'flex h-11 items-center gap-2.5 border bg-bg px-3.5 transition-colors',
          open
            ? 'rounded-t-2xl border-primary'
            : 'rounded-2xl border-border-strong shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20',
        )}
      >
        <Search size={18} className="shrink-0 text-fg-3" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches.length > 0 ? `${listId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Buscar entre tus juegos…"
          aria-label="Saltar a un juego"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={reset}
            aria-label="Limpiar búsqueda"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-surface hover:text-fg-2"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : (
          <span
            className="mono hidden shrink-0 items-center gap-1 text-[10px] text-fg-3 sm:flex"
            aria-hidden="true"
          >
            <CornerDownLeft size={12} /> saltar
          </span>
        )}
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-20 overflow-hidden rounded-b-2xl border border-t-0 border-primary bg-card shadow-lg">
          <ul id={listId} aria-label="Tus juegos" className="max-h-72 overflow-y-auto">
            {matches.length > 0 ? (
              matches.map((game, index) => (
                <ResultRow
                  key={game.id}
                  id={`${listId}-opt-${index}`}
                  game={game}
                  query={term}
                  active={index === activeIndex}
                  onPick={() => go(game)}
                  onHover={() => setHighlight(index)}
                />
              ))
            ) : (
              <li className="px-4 py-6 text-center text-sm text-fg-3">
                Ningún juego coincide con «{query.trim()}».
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
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
  game: JumpGame;
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
        <span className="mono grid size-9 shrink-0 place-items-center rounded-lg bg-primary-100 text-[11px] font-bold text-primary-700">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {highlightMatch(game.name, query)}
        </span>
      </button>
    </li>
  );
}
