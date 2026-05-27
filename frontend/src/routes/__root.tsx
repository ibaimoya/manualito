import { Outlet, createRootRoute, Link, useLocation } from '@tanstack/react-router';
import { Home, BookOpen, Settings } from 'lucide-react';
import { Suspense, type ReactNode } from 'react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { Sidebar } from '@/app/Sidebar';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';

/**
 * Layout raíz — `<Outlet />` con bottom navigation condicional.
 *
 * Rutas sin bottom nav (immersivas): /onboarding, /capture, /processing/*.
 * Las demás muestran la barra inferior (móvil-first).
 */

const HIDDEN_BOTTOM_NAV_PREFIXES = ['/onboarding', '/capture', '/processing', '/result', '/chat'];

function shouldShowBottomNav(pathname: string): boolean {
  return !HIDDEN_BOTTOM_NAV_PREFIXES.some((p) => pathname.startsWith(p));
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ({ error }) => (
    <ErrorBoundary>
      <div className="grid min-h-screen place-items-center bg-bg p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Algo ha fallado</h1>
          <p className="mt-2 text-fg-2">{error.message}</p>
        </div>
      </div>
    </ErrorBoundary>
  ),
});

function RootComponent() {
  const location = useLocation();
  const showNav = shouldShowBottomNav(location.pathname);
  const isDesktop = useIsDesktop();

  return (
    <ErrorBoundary>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        {/* Skip-to-main link (WCAG 2.4.1) con transición suave:
            invisible por defecto (translate-y-20 lo sube fuera del
            viewport), aparece deslizando desde arriba al recibir foco
            con Tab.  Permite al usuario de teclado saltar la navegación
            y llegar directo al contenido principal.
            Catálogo bugs #16 (a11y skip-link) + #35 (transición suave). */}
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-xl bg-primary px-4 py-2 font-semibold text-fg-inv shadow-md transition-transform duration-200 ease-[var(--ease-mn)] focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
        >
          Saltar al contenido
        </a>

        {/* Sidebar persistente en md+ (oculta en móvil vía Tailwind).
            Solo aparece en rutas no inmersivas. */}
        {showNav ? <Sidebar pathname={location.pathname} /> : null}

        <main
          className={cn(
            'flex-1 overflow-y-auto',
            showNav ? 'pb-[72px] md:pb-0 md:pl-60' : 'pb-0',
          )}
          id="main-content"
        >
          {/* Suspense boundary: si una ruta lazy tarda en cargar su chunk,
              evitamos el flash de blanco con un fallback (catálogo bug #14). */}
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet />
          </Suspense>
        </main>

        {/* BottomNav SOLO en móvil — en desktop la sidebar la sustituye y
            tenerla en DOM con `display:none` confundía a screen readers
            (catálogo bug #8). */}
        {showNav && !isDesktop ? <BottomNav pathname={location.pathname} /> : null}
      </div>
    </ErrorBoundary>
  );
}

function RouteLoadingFallback() {
  return (
    <div
      aria-live="polite"
      aria-label="Cargando contenido"
      className="grid min-h-[50vh] place-items-center"
    >
      <div className="flex flex-col items-center gap-3">
        <span
          aria-hidden="true"
          className="block h-8 w-8 rounded-full border-4 border-primary-100 border-t-primary"
          style={{ animation: 'mn-spin 0.9s linear infinite' }}
        />
        <span className="mono text-xs text-fg-3">Cargando…</span>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-6 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg">Página no encontrada</h1>
        <p className="mt-2 text-fg-2">
          La URL que has intentado abrir no existe en Manualito.
        </p>
        <Link
          to="/home"
          className="mt-6 inline-block rounded-full bg-primary px-6 py-3 font-semibold text-fg-inv shadow-sm hover:bg-primary-600"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

function BottomNav({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <nav
      // BottomNav solo se monta cuando NO es desktop (ver RootComponent).
      // En desktop la Sidebar es la nav principal — sin duplicar regiones.
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        <NavItem to="/home" pathname={pathname} icon={<Home size={22} strokeWidth={1.75} />}>
          Inicio
        </NavItem>
        <NavItem
          to="/history"
          pathname={pathname}
          icon={<BookOpen size={22} strokeWidth={1.75} />}
        >
          Historial
        </NavItem>
        <NavItem
          to="/settings"
          pathname={pathname}
          icon={<Settings size={22} strokeWidth={1.75} />}
        >
          Ajustes
        </NavItem>
      </ul>
    </nav>
  );
}

function NavItem({
  to,
  pathname,
  icon,
  children,
}: Readonly<{
  to: '/home' | '/history' | '/settings';
  pathname: string;
  icon: ReactNode;
  children: string;
}>) {
  const active = pathname === to;
  return (
    <li>
      <Link
        to={to}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-col items-center justify-center gap-1 px-6 py-2 text-xs font-semibold',
          'transition-colors min-h-[44px]',
          active ? 'text-primary' : 'text-fg-3 hover:text-fg-2',
        )}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{children}</span>
      </Link>
    </li>
  );
}
