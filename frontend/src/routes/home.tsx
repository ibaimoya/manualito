import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { Monogram } from '@/shared/components/Brand';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ManualCard } from '@/features/manual/ManualCard';
import { storage, type ManualRecord } from '@/shared/lib/storage';

export const Route = createFileRoute('/home')({
  component: HomeScreen,
});

function HomeScreen() {
  // Lista local de manuales: viene de localStorage hasta que el backend persista el índice.
  // Lazy initializer evita el flash de "empty state" mientras un useEffect
  // sincronizaba la lista en el primer mount (50 ms visible y feo).
  // Catálogo bug #33.
  const [manuals] = useState<ManualRecord[]>(() => storage.listManuals());

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-10 pt-4 md:max-w-5xl md:px-8 md:pt-10">
      {/* Header de móvil — oculto en md+ porque la Sidebar ya muestra Brand. */}
      <header className="flex items-center justify-between md:hidden">
        <div className="flex items-center gap-3">
          <Monogram size={36} radius={10} />
          <span className="font-display text-xl font-bold tracking-tight">Manualito</span>
        </div>
        <Link
          to="/settings"
          className="grid h-11 w-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          aria-label="Abrir ajustes"
        >
          <SettingsIcon size={20} strokeWidth={1.75} />
        </Link>
      </header>

      <section
        aria-labelledby="home-hello"
        className="md:flex md:items-start md:justify-between md:gap-8"
      >
        <div className="md:max-w-xl">
          <h1
            id="home-hello"
            className="font-display text-3xl font-bold leading-tight tracking-tight text-fg md:text-4xl"
          >
            Hola <span aria-hidden="true">👋</span>
            <br />
            ¿Qué juego vamos a aprender?
          </h1>
          <p className="mt-2 text-base leading-relaxed text-fg-2 md:text-lg">
            Saca foto al manual y te lo explico — paso a paso, sin tener que leerlo entero.
          </p>
        </div>
      </section>

      <HeroCta />

      {manuals.length > 0 ? (
        <RecentManuals manuals={manuals} />
      ) : (
        <EmptyRecents />
      )}
    </div>
  );
}

function HeroCta() {
  // @container permite que el HeroCta se adapte a su contenedor padre
  // (no al viewport).  En columna estrecha (móvil, grid 1col) → layout
  // vertical.  En contenedor ancho (desktop centrado o columna ≥ 32rem)
  // → titular a la izq + botón a la dcha.
  return (
    <Card
      className="@container relative overflow-hidden border-0 p-5 text-fg-inv shadow-md"
      style={{
        background:
          'linear-gradient(160deg, var(--m-primary-500) 0%, var(--m-primary-600) 100%)',
      }}
    >
      <div className="relative flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div className="@md:max-w-md">
          <h2 className="font-display text-lg font-bold @md:text-xl">
            Aprende un juego nuevo
          </h2>
          <p className="mt-1 text-sm opacity-90">
            Sube las páginas del manual desde la cámara, la galería o un PDF — yo te
            lo explico.
          </p>
        </div>
        <Button
          asChild
          block
          size="md"
          variant="secondary"
          className="bg-bg text-primary-700 @md:w-auto @md:shrink-0 @md:px-6"
        >
          <Link to="/capture/source">
            <Plus size={18} strokeWidth={2} />
            Nuevo manual
            <ArrowRight size={16} strokeWidth={2} className="ml-auto @md:ml-2" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function RecentManuals({ manuals }: Readonly<{ manuals: ManualRecord[] }>) {
  return (
    <section aria-labelledby="home-recent">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="home-recent" className="font-display text-base font-bold text-fg md:text-lg">
          Recientes
        </h2>
        <Link to="/history" className="text-sm font-semibold text-accent">
          Ver todo
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {manuals.slice(0, 6).map((m) => (
          <li key={m.manual_id}>
            <ManualCard manual={m} meta={formatRelative(m.last_opened_at)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyRecents() {
  return (
    <section className="mt-2 rounded-2xl border border-dashed border-border-strong bg-surface/60 p-6 text-center">
      <p className="text-sm text-fg-2">
        Aún no has consultado ningún manual. Pulsa <strong>Nuevo manual</strong> para
        empezar.
      </p>
    </section>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
