import { Link, Outlet, createFileRoute, redirect, useLocation } from '@tanstack/react-router';
import { BookOpen, Home, Settings } from 'lucide-react';
import { type ReactNode } from 'react';
import { Sidebar } from '@/app/Sidebar';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';
import { VerifyEmailBanner } from '@/features/auth/verify-email-banner';

// Rutas inmersivas: sin barra de navegación (ocupan toda la pantalla).
const IMMERSIVE_PREFIXES = ['/capture', '/processing', '/result', '/chat'];

function showsNav(pathname: string): boolean {
  return !IMMERSIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Área autenticada: redirige a login si no hay sesión y monta el shell. */
export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.user) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

export function AppLayout() {
  const location = useLocation();
  const showNav = showsNav(location.pathname);
  const isDesktop = useNamedMediaQuery('desktop');

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      {/* Skip-link (WCAG 2.4.1): oculto hasta recibir foco con Tab. */}
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-xl bg-primary px-4 py-2 font-semibold text-fg-inv shadow-md transition-transform duration-200 ease-[var(--ease-mn)] focus-visible:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        Saltar al contenido
      </a>

      {showNav ? <Sidebar pathname={location.pathname} /> : null}

      <main
        id="main-content"
        className={cn('flex-1 overflow-y-auto', showNav ? 'pb-[72px] md:pb-0 md:pl-60' : 'pb-0')}
      >
        {showNav ? <VerifyEmailBanner /> : null}
        <Outlet />
      </main>

      {showNav && !isDesktop ? <BottomNav pathname={location.pathname} /> : null}
    </div>
  );
}

function BottomNav({ pathname }: Readonly<{ pathname: string }>) {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-md justify-around">
        <NavItem to="/home" pathname={pathname} icon={<Home size={22} strokeWidth={1.75} />}>
          Inicio
        </NavItem>
        <NavItem to="/history" pathname={pathname} icon={<BookOpen size={22} strokeWidth={1.75} />}>
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
          'flex min-h-[44px] flex-col items-center justify-center gap-1 px-6 py-2 text-xs font-semibold transition-colors',
          active ? 'text-primary' : 'text-fg-3 hover:text-fg-2',
        )}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{children}</span>
      </Link>
    </li>
  );
}
