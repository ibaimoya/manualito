import { Link } from '@tanstack/react-router';
import { Home, BookOpen, Plus, Settings as SettingsIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/shared/components/Avatar';
import { LockUp } from '@/shared/components/Brand';
import { APP_VERSION } from '@/shared/lib/appVersion';
import { cn } from '@/shared/lib/cn';

/**
 * Sidebar persistente para desktop (`md+`).
 *
 * En móvil queda oculta (display: none vía `hidden md:flex` del __root).
 *
 * Decisión: la sidebar no se monta condicionalmente con JS: eso provocaría
 * rerenders al redimensionar. Se monta siempre y Tailwind decide su visibilidad.
 */
type Props = Readonly<{
  pathname: string;
  user?: Readonly<{ username: string; email: string }>;
}>;

const NAV_ITEMS: Array<{
  to: '/home' | '/history' | '/settings';
  icon: ReactNode;
  label: string;
}> = [
  { to: '/home', icon: <Home size={18} strokeWidth={1.75} />, label: 'Inicio' },
  { to: '/history', icon: <BookOpen size={18} strokeWidth={1.75} />, label: 'Historial' },
  {
    to: '/settings',
    icon: <SettingsIcon size={18} strokeWidth={1.75} />,
    label: 'Ajustes',
  },
];

export function Sidebar({ pathname, user }: Props) {
  return (
    <aside
      aria-label="Navegación principal"
      className={cn(
        'hidden md:flex',
        'fixed inset-y-0 left-0 z-20 w-60 flex-col',
        'border-r border-border bg-surface',
      )}
    >
      <div className="px-5 pb-4 pt-6">
        <Link to="/home" aria-label="Manualito · ir al inicio">
          <LockUp scale={0.85} withTagline={false} />
        </Link>
      </div>

      <div className="px-3 pb-4">
        <Button asChild className="w-full">
          <Link to="/capture/source">
            <Plus size={18} strokeWidth={2} />
            Nuevo manual
          </Link>
        </Button>
      </div>

      <nav className="flex-1 px-3" aria-label="Secciones de la app">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.to;
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    'min-h-11',
                    active
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-fg-2 hover:bg-surface hover:text-fg',
                  )}
                >
                  <span aria-hidden="true" className="grid h-6 w-6 place-items-center">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="border-t border-border p-3">
        {user ? (
          <Link
            to="/settings"
            aria-label="Tu cuenta y ajustes"
            className="mb-2 flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface-2"
          >
            <Avatar name={user.username || user.email} size={34} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-fg">{user.username}</span>
              <span className="block truncate text-xs text-fg-3">{user.email}</span>
            </span>
          </Link>
        ) : null}
        <p className="mono px-2 text-[10px] tracking-[0.1em] text-fg-3">
          v {APP_VERSION} · phi4 · ChromaDB
        </p>
      </footer>
    </aside>
  );
}
