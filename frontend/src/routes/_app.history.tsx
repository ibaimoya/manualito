import { createFileRoute, Link } from '@tanstack/react-router';
import { Plus, Search, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Meeple } from '@/shared/components/Brand';
import { ManualCard } from '@/features/manual/ManualCard';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import { storage, type ManualRecord } from '@/shared/lib/storage';

export const Route = createFileRoute('/_app/history')({
  component: HistoryScreen,
});

function HistoryScreen() {
  const [manuals, setManuals] = useState<ManualRecord[]>(() => storage.listManuals());
  // El input es controlado al instante (UI reactivo) pero la query
  // usada para filtrar se actualiza debounced para evitar rerender por
  // cada tecla con 50 manuales en la lista.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const setDebouncedQuerySoon = useDebouncedCallback(setDebouncedQuery, 150);

  function refresh(): void {
    setManuals(storage.listManuals());
  }

  function deleteManual(id: string): void {
    storage.removeManual(id);
    refresh();
  }

  const filtered =
    debouncedQuery.trim().length === 0
      ? manuals
      : manuals.filter((m) => m.name.toLowerCase().includes(debouncedQuery.toLowerCase().trim()));

  let content: ReactNode;
  if (filtered.length > 0) {
    content = (
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        {filtered.map((m) => (
          <li key={m.manual_id} className="group">
            <ManualListItem manual={m} onDelete={() => deleteManual(m.manual_id)} />
          </li>
        ))}
      </ul>
    );
  } else if (manuals.length === 0) {
    content = <EmptyState />;
  } else {
    content = (
      <p className="mt-4 text-center text-sm text-fg-3">Ningún manual coincide con «{query}».</p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-10 pt-4 md:max-w-5xl md:px-8 md:pt-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Tus manuales</h1>
        <div className="relative md:w-80">
          <Search
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
          />
          <Input
            preset="search"
            placeholder="Buscar por nombre…"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setDebouncedQuerySoon(v);
            }}
            aria-label="Buscar manuales"
            className="pl-10"
          />
        </div>
      </header>

      {content}
    </div>
  );
}

function ManualListItem({
  manual,
  onDelete,
}: Readonly<{
  manual: ManualRecord;
  onDelete: () => void;
}>) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-bg">
      <div className="flex items-stretch gap-2 pr-2">
        <div className="flex-1">
          <ManualCard
            manual={manual}
            meta={formatDate(manual.last_opened_at)}
            className="rounded-none border-0 shadow-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="my-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg-3 hover:bg-error-bg hover:text-error"
          aria-label={`Borrar ${manual.name}`}
        >
          <Trash2 size={18} strokeWidth={2} />
        </button>
      </div>
      {confirming ? (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-error-bg p-3">
          <span className="mr-auto text-sm text-error">¿Borrar {manual.name}?</span>
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

function EmptyState() {
  return (
    <section className="mt-8 grid place-items-center gap-4 px-6 text-center">
      <div className="relative h-32 w-36">
        <div
          className="absolute left-3 top-5 h-24 w-24 rotate-[-9deg] rounded-2xl bg-surface-2 shadow-xs"
          aria-hidden="true"
        />
        <div
          className="absolute left-8 top-3 h-24 w-24 rotate-[4deg] rounded-2xl border border-border bg-surface shadow-sm"
          aria-hidden="true"
        />
        <div className="absolute left-14 top-0 rotate-[-6deg] text-primary" aria-hidden="true">
          <Meeple size={64} color="currentColor" />
        </div>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight text-fg">
          Aún no hay manuales por aquí
        </h2>
        <p className="mt-2 text-base leading-relaxed text-fg-2">
          Saca foto a las páginas de tu primer juego y aparecerá aquí, listo para preguntarle lo que
          sea.
        </p>
      </div>
      <Button asChild size="lg">
        <Link to="/capture/source">
          <Plus size={18} strokeWidth={2} />
          Subir mi primer manual
        </Link>
      </Button>
    </section>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
