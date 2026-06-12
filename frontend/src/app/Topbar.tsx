import { Link, type LinkOptions } from '@tanstack/react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/use-auth';
import { Avatar } from '@/shared/components/Avatar';
import { cn } from '@/shared/lib/cn';

/**
 * Barra superior del shell, con la misma base visual en todas las pantallas.
 * DesktopTopbar: pantallas con navegación (md+; en móvil manda la bottom-nav).
 * ScreenTopBar: pantallas inmersivas — breadcrumb en md+, cabecera clásica
 * con volver + título centrado en móvil.
 */

// Misma base visual en md+: las dos barras "pegan" al cambiar de pantalla.
const TOPBAR_CHROME =
  'sticky top-0 z-30 h-14 items-center gap-4 border-b border-border bg-bg/95 px-4 backdrop-blur md:px-8';

const TITLES: Record<string, string> = {
  '/home': 'Inicio',
  '/history': 'Historial',
  '/settings': 'Ajustes',
  '/profile': 'Perfil',
  '/security': 'Cuenta y seguridad',
  '/about': 'Cómo funciona',
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
  if (!user || !label) return null;
  return (
    <Link
      to="/profile"
      aria-label="Tu perfil"
      title={label}
      className="shrink-0 rounded-full transition-opacity hover:opacity-80"
    >
      <Avatar name={label} size={36} color={user.avatar_color} figure={user.avatar_figure} />
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
      {/* Sin leading-none: con truncate (overflow hidden) recortaba la j/g/y. */}
      <nav aria-label="Ruta de navegación" className="flex min-w-0 flex-1 items-center gap-1.5">
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

/**
 * Tramo intermedio del breadcrumb. `link` se construye con `linkOptions()`
 * en el callsite: destino y params quedan validados por el router en compile.
 */
interface CrumbLink {
  label: string;
  link: LinkOptions;
}

/** Botón «atrás» estándar de las pantallas inmersivas (slot `back`). */
export function BackLink({ label, link }: Readonly<{ label: string; link: LinkOptions }>) {
  return (
    <Link
      {...link}
      aria-label={label}
      className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface"
    >
      <ArrowLeft size={22} strokeWidth={2} />
    </Link>
  );
}

function CrumbSeparator() {
  return (
    <ChevronRight size={15} strokeWidth={2.25} className="shrink-0 text-fg-3" aria-hidden="true" />
  );
}

export function ScreenTopBar({
  crumb,
  trail,
  back,
  actions,
}: Readonly<{
  crumb: string;
  /** Tramos navegables entre «Manualito» y la página actual. */
  trail?: readonly CrumbLink[];
  back?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <header className={cn(TOPBAR_CHROME, 'flex')}>
      {back ? <div className="shrink-0 md:hidden">{back}</div> : null}

      {/* md+: breadcrumb. */}
      <nav
        aria-label="Ruta de navegación"
        className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex"
      >
        <HomeCrumb />
        {trail?.map((item) => (
          <Fragment key={item.label}>
            <CrumbSeparator />
            <Link
              {...item.link}
              className="max-w-44 shrink-0 truncate font-display text-sm font-semibold text-fg-2 transition-colors hover:text-fg"
            >
              {item.label}
            </Link>
          </Fragment>
        ))}
        <CrumbSeparator />
        <span
          aria-current="page"
          className="truncate font-display text-[15px] font-bold tracking-tight text-fg"
        >
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
