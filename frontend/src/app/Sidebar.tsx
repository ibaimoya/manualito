import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Avatar } from '@/shared/components/Avatar';
import { LockUp, Monogram } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';

/**
 * Sidebar persistente para desktop (`md+`).
 *
 * En móvil queda oculta (display: none vía `hidden md:flex` del __root). Se
 * monta siempre (no condicionalmente con JS, que provocaría rerenders al
 * redimensionar) y Tailwind decide su visibilidad.
 *
 * Plegable: cuando `collapsed`, el rail se estrecha a solo iconos; cada item
 * conserva su nombre accesible (label en `sr-only`) y muestra un tooltip al
 * pasar el ratón. El estado lo gobierna el shell (`_app`) para ajustar a la vez
 * el padding del contenido principal. El control de plegado sigue el patrón de
 * las apps de chat actuales: icono de panel junto a la marca; plegada, el
 * monograma hace de botón de expandir (muestra el icono al hacer hover).
 */
type NavTo = '/home' | '/history' | '/settings';

type Props = Readonly<{
  pathname: string;
  user?: Readonly<{ username: string; email: string }>;
  collapsed?: boolean;
  onToggle?: () => void;
}>;

const NAV_ITEMS: Array<{ to: NavTo; icon: ReactNode; label: string }> = [
  { to: '/home', icon: <Home size={18} strokeWidth={1.75} />, label: 'Inicio' },
  { to: '/history', icon: <BookOpen size={18} strokeWidth={1.75} />, label: 'Historial' },
  { to: '/settings', icon: <SettingsIcon size={18} strokeWidth={1.75} />, label: 'Ajustes' },
];

export function Sidebar({ pathname, user, collapsed = false, onToggle }: Props) {
  return (
    <aside
      aria-label="Navegación principal"
      data-collapsed={collapsed || undefined}
      className={cn(
        'hidden md:flex',
        'fixed inset-y-0 left-0 z-20 flex-col',
        'border-r border-border bg-surface',
        'transition-[width] duration-200 ease-[var(--ease-mn)]',
        collapsed ? 'w-[72px]' : 'w-60',
      )}
    >
      {/* Cabecera de altura fija: la columna no salta verticalmente al plegar. */}
      <div
        className={cn(
          'flex h-[72px] shrink-0 items-center',
          collapsed ? 'justify-center px-2' : 'justify-between pl-5 pr-3',
        )}
      >
        {collapsed ? (
          <Tooltip content="Expandir" side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expandir menú"
              className="group relative grid size-11 place-items-center rounded-xl transition-colors hover:bg-surface-2"
            >
              <span
                aria-hidden="true"
                className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
              >
                <Monogram size={34} radius={10} />
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 grid place-items-center text-fg-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                <PanelLeftOpen size={18} strokeWidth={1.75} />
              </span>
            </button>
          </Tooltip>
        ) : (
          <>
            <Link to="/home" aria-label="Manualito · ir al inicio">
              <LockUp scale={0.85} withTagline={false} />
            </Link>
            <Tooltip content="Contraer" side="right">
              <button
                type="button"
                onClick={onToggle}
                aria-label="Contraer menú"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <PanelLeftClose size={18} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className={cn('pb-4', collapsed ? 'px-2' : 'px-3')}>
        <Button asChild block aria-label={collapsed ? 'Nuevo manual' : undefined}>
          <Link to="/capture/source" title={collapsed ? 'Nuevo manual' : undefined}>
            <Plus size={18} strokeWidth={2} />
            {collapsed ? null : 'Nuevo manual'}
          </Link>
        </Button>
      </div>

      <nav className={cn('flex-1', collapsed ? 'px-2' : 'px-3')} aria-label="Secciones de la app">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <MaybeTip show={collapsed} label={item.label}>
                <Link
                  to={item.to}
                  aria-current={pathname === item.to ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-xl text-sm font-semibold transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3 py-2.5',
                    pathname === item.to
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-fg-2 hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center">
                    {item.icon}
                  </span>
                  <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                </Link>
              </MaybeTip>
            </li>
          ))}
        </ul>
      </nav>

      {user ? (
        <footer className="border-t border-border p-3">
          <UserCard user={user} collapsed={collapsed} />
        </footer>
      ) : null}
    </aside>
  );
}

/** Envuelve el disparador en un tooltip solo cuando la sidebar está plegada. */
function MaybeTip({
  show,
  label,
  children,
}: Readonly<{ show: boolean; label: string; children: ReactNode }>) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  );
}

function UserCard({
  user,
  collapsed,
}: Readonly<{ user: Readonly<{ username: string; email: string }>; collapsed: boolean }>) {
  const name = user.username || user.email;

  if (collapsed) {
    return (
      <Tooltip content={name} side="right">
        <Link
          to="/settings"
          aria-label="Tu cuenta y ajustes"
          className="grid place-items-center rounded-xl p-2 transition-colors hover:bg-surface-2"
        >
          <Avatar name={name} size={34} />
        </Link>
      </Tooltip>
    );
  }

  return (
    <Link
      to="/settings"
      aria-label="Tu cuenta y ajustes"
      className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface-2"
    >
      <Avatar name={name} size={34} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold text-fg">{user.username}</span>
        <span className="block truncate text-xs text-fg-3">{user.email}</span>
      </span>
    </Link>
  );
}
