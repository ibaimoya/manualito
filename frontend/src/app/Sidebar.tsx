import { Link } from '@tanstack/react-router';
import { Home, BookOpen, Settings as SettingsIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { LockUp } from '@/shared/components/Brand';
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

export function Sidebar({ pathname }: Props) {
  return (
    <aside
      aria-label="Navegación principal"
      className={cn(
        'hidden md:flex',
        'fixed inset-y-0 left-0 z-20 w-60 flex-col',
        'border-r border-border bg-bg',
      )}
    >
      <div className="px-5 pb-5 pt-6">
        <Link to="/home" aria-label="Manualito · ir al inicio">
          <LockUp scale={0.85} withTagline={false} />
        </Link>
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

      <footer className="border-t border-border px-5 py-4">
        <p className="mono text-[10px] tracking-[0.1em] text-fg-3">
          v 0.1.0 · phi4 · ChromaDB · FastAPI
        </p>
      </footer>
    </aside>
  );
}
