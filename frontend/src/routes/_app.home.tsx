import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus, Settings as SettingsIcon } from 'lucide-react';
import { Meeple, Monogram } from '@/shared/components/Brand';
import { Avatar } from '@/shared/components/Avatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ManualCard } from '@/features/manual/ManualCard';
import { manualsQueryOptions } from '@/features/manual/use-manuals';
import { RecommendedSection } from '@/features/recommend/RecommendedSection';
import { useAuth } from '@/features/auth/use-auth';
import { formatRelative } from '@/shared/lib/relativeDate';
import { type ManualSummary } from '@/shared/api/client';

export const Route = createFileRoute('/_app/home')({
  component: HomeScreen,
});

function HomeScreen() {
  const { user } = useAuth();
  const firstName = user?.username?.split(/\s+/)[0];
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
          className="grid size-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          aria-label="Tu cuenta"
        >
          {user ? (
            <Avatar name={user.username || user.email} size={36} />
          ) : (
            <SettingsIcon size={20} strokeWidth={1.75} />
          )}
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
            {firstName ? `Hola, ${firstName}` : 'Hola'} <span aria-hidden="true">👋</span>
            <br />
            ¿Qué juego vamos a aprender?
          </h1>
          <p className="mt-2 text-base leading-relaxed text-fg-2 md:text-lg">
            Saca foto al manual y te lo explico paso a paso, sin tener que leerlo entero.
          </p>
        </div>
      </section>

      <HeroCta />

      <RecentSection />

      <RecommendedSection />
    </div>
  );
}

function HeroCta() {
  // @container: el HeroCta se adapta a su contenedor, no al viewport.
  return (
    <Card
      className="@container relative overflow-hidden border-0 p-5 text-fg-inv shadow-md"
      style={{
        background: 'linear-gradient(160deg, var(--m-primary-500) 0%, var(--m-primary-600) 100%)',
      }}
    >
      <div className="relative flex flex-col gap-4 @md:flex-row @md:items-center @md:justify-between">
        <div className="@md:max-w-md">
          <h2 className="font-display text-lg font-bold @md:text-xl">Aprende un juego nuevo</h2>
          <p className="mt-1 text-sm opacity-90">
            Sube las páginas del manual desde la cámara, la galería o un PDF, y yo te lo explico.
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

/** Sección de recientes: resuelve la query y elige estado (carga/error/vacío/lista). */
function RecentSection() {
  const { data: manuals, isPending, isError } = useQuery(manualsQueryOptions());
  if (isPending) return <RecentSkeleton />;
  if (isError) return <RecentError />;
  if (!manuals || manuals.length === 0) return <EmptyRecents />;
  return <RecentManuals manuals={manuals} />;
}

function RecentManuals({ manuals }: Readonly<{ manuals: ManualSummary[] }>) {
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
          <li key={m.id}>
            <ManualCard manual={m} meta={formatRelative(m.created_at)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="mb-3 h-5 w-24 animate-pulse rounded bg-surface-2" />
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-[72px] animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </ul>
    </section>
  );
}

function RecentError() {
  return (
    <section className="rounded-2xl border border-border bg-surface/60 p-6 text-center">
      <p className="text-sm text-fg-2">
        No hemos podido cargar tus manuales. Reintenta en un momento.
      </p>
    </section>
  );
}

function EmptyRecents() {
  return (
    <section className="mt-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/60 px-6 py-8 text-center">
      <div
        className="grid size-14 place-items-center rounded-full bg-primary-100 text-primary-700"
        aria-hidden="true"
      >
        <Meeple size={28} color="currentColor" />
      </div>
      <p className="max-w-xs text-sm text-fg-2">
        Aún no has consultado ningún manual. Pulsa <strong>Nuevo manual</strong> para empezar.
      </p>
    </section>
  );
}
