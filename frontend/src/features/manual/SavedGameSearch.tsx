import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';
import type { ManualSummary } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';

type Props = Readonly<{ manuals: ManualSummary[] }>;

const MAX_RESULTS = 8;

/**
 * Buscador con dropdown (combobox) sobre los juegos ya guardados. Mismo
 * patrón visual que el typeahead de BGG, pero filtra en local y al elegir
 * navega directo al manual; sin atribución externa.
 */
export function SavedGameSearch({ manuals }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (term.length === 0) return [];
    return manuals
      .filter((m) => (m.title ?? m.game_name).toLowerCase().includes(term))
      .slice(0, MAX_RESULTS);
  }, [manuals, term]);

  const open = term.length > 0;
  const activeIndex = matches.length > 0 ? Math.min(highlight, matches.length - 1) : 0;

  function go(manual: ManualSummary): void {
    navigate({ to: '/result/$manualId', params: { manualId: manual.id } }).catch(() => undefined);
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
    <div className="relative md:w-80">
      <div
        className={cn(
          'flex h-11 items-center gap-2.5 border bg-bg px-3.5 transition-colors',
          open ? 'rounded-t-2xl border-primary' : 'rounded-2xl border-border-strong',
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
          aria-label="Buscar tus juegos"
          className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3"
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
        ) : null}
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-20 overflow-hidden rounded-b-2xl border border-t-0 border-primary bg-bg shadow-lg">
          <ul id={listId} aria-label="Tus juegos" className="max-h-72 overflow-y-auto">
            {matches.length > 0 ? (
              matches.map((manual, index) => (
                <ResultRow
                  key={manual.id}
                  id={`${listId}-opt-${index}`}
                  manual={manual}
                  query={term}
                  active={index === activeIndex}
                  onPick={() => go(manual)}
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
  manual,
  query,
  active,
  onPick,
  onHover,
}: Readonly<{
  id: string;
  manual: ManualSummary;
  query: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}>) {
  const name = manual.title ?? manual.game_name;
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
          {name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {highlightMatch(name, query)}
        </span>
        <span className="mono shrink-0 text-[11px] text-fg-3">{manual.chunks_indexed} frag.</span>
      </button>
    </li>
  );
}

function highlightMatch(name: string, query: string): ReactNode {
  const needle = query.trim();
  if (needle.length === 0) return name;
  const index = name.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return name;
  return (
    <>
      {name.slice(0, index)}
      <mark className="rounded-[3px] bg-primary-100 px-px text-primary-700">
        {name.slice(index, index + needle.length)}
      </mark>
      {name.slice(index + needle.length)}
    </>
  );
}
