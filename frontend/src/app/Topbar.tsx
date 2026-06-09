import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { useAuth } from '@/features/auth/use-auth';
import { Avatar } from '@/shared/components/Avatar';
import { cn } from '@/shared/lib/cn';

/**
 * Barra superior única del shell. Da "cierre" superior y contexto de
 * navegación (breadcrumb) a TODAS las pantallas con la MISMA base visual
 * (alto, padding, borde, fondo) para que peguen entre sí.
 *
 * - `DesktopTopbar`: pantallas con navegación (home/history/settings).
 *   Solo `md+`; en móvil la navegación vive en la bottom-nav. Muestra la
 *   cuenta a la derecha.
 * - `ScreenTopBar`: pantallas inmersivas (result/chat/processing/capture).
 *   En `md+` muestra el breadcrumb; en móvil, una cabecera clásica con
 *   botón de volver + título centrado. Las acciones de la pantalla viven
 *   a la derecha y se renderizan una sola vez.
 */

// Base compartida: en `md+` ambas barras quedan idénticas (mismo alto,
// padding, borde y fondo) → "pegan" al cambiar de pantalla.
const TOPBAR_CHROME =
  'sticky top-0 z-30 h-14 items-center gap-4 border-b border-border bg-bg/95 px-4 backdrop-blur md:px-8';

const TITLES: Record<string, string> = {
  '/home': 'Inicio',
  '/history': 'Historial',
  '/settings': 'Ajustes',
};

function HomeCrumb() {
  return (
    <Link
      to="/home"
      className="shrink-0 font-display text-sm font-semibold text-fg-2 transition-colors hover:text-fg"
    >
      Manualito
    </Link>
  );
}

function AccountAvatar() {
  const { user } = useAuth();
  const label = user?.username ?? user?.email ?? '';
  if (!label) return null;
  return (
    <Link
      to="/settings"
      aria-label="Tu cuenta"
      title={label}
      className="shrink-0 rounded-full transition-opacity hover:opacity-80"
    >
      <Avatar name={label} size={36} />
    </Link>
  );
}

export function DesktopTopbar({
  pathname,
  crumb,
  actions,
}: Readonly<{ pathname?: string; crumb?: string; actions?: ReactNode }>) {
  const title = crumb ?? (pathname ? TITLES[pathname] : undefined) ?? 'Manualito';

  return (
    <div className={cn(TOPBAR_CHROME, 'hidden md:flex')}>
      <nav
        aria-label="Ruta de navegación"
        className="flex min-w-0 flex-1 items-center gap-1.5 leading-none"
      >
        <HomeCrumb />
        <ChevronRight size={15} strokeWidth={2.25} className="shrink-0 text-fg-3" aria-hidden="true" />
        <span className="truncate font-display text-[15px] font-bold tracking-tight text-fg">
          {title}
        </span>
      </nav>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <AccountAvatar />
      </div>
    </div>
  );
}

export function ScreenTopBar({
  crumb,
  back,
  actions,
}: Readonly<{ crumb: string; back?: ReactNode; actions?: ReactNode }>) {
  return (
    <header className={cn(TOPBAR_CHROME, 'flex')}>
      {back ? <div className="shrink-0 md:hidden">{back}</div> : null}

      {/* md+: breadcrumb. */}
      <nav
        aria-label="Ruta de navegación"
        className="hidden min-w-0 flex-1 items-center gap-1.5 leading-none md:flex"
      >
        <HomeCrumb />
        <ChevronRight size={15} strokeWidth={2.25} className="shrink-0 text-fg-3" aria-hidden="true" />
        <span className="truncate font-display text-[15px] font-bold tracking-tight text-fg">
          {crumb}
        </span>
      </nav>

      {/* móvil: título centrado. */}
      <h1 className="min-w-0 flex-1 truncate text-center font-display text-lg font-bold tracking-tight md:hidden">
        {crumb}
      </h1>

      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}
