import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  CircleHelp,
  Compass,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AvatarColor, AvatarFigure } from '@/shared/api/auth';
import { Tooltip } from '@/components/ui/tooltip';
import { Avatar } from '@/shared/components/Avatar';
import { LockUp, Monogram } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';
import { elideEmail } from '@/shared/lib/elideEmail';

/**
 * Sidebar de escritorio. Siempre montada (Tailwind la oculta en móvil;
 * condicionar con JS daría rerenders al redimensionar). Plegada queda en
 * iconos con label sr-only + tooltip; el estado lo gobierna el shell (_app)
 * para ajustar a la vez el padding del contenido.
 */
type NavTo = '/home' | '/history' | '/explore' | '/settings' | '/about';

type SidebarUser = Readonly<{
  username: string;
  email: string;
  avatar_color?: AvatarColor | null;
  avatar_figure?: AvatarFigure | null;
}>;

type Props = Readonly<{
  pathname: string;
  user?: SidebarUser;
  collapsed?: boolean;
  onToggle?: () => void;
}>;

type NavKey =
  | 'navigation.explore'
  | 'navigation.help'
  | 'navigation.home'
  | 'navigation.library'
  | 'navigation.settings';

type NavItem = { to: NavTo; icon: ReactNode; label: NavKey };

const NAV_MAIN: NavItem[] = [
  { to: '/home', icon: <Home size={18} strokeWidth={1.75} />, label: 'navigation.home' },
  { to: '/history', icon: <BookOpen size={18} strokeWidth={1.75} />, label: 'navigation.library' },
  { to: '/explore', icon: <Compass size={18} strokeWidth={1.75} />, label: 'navigation.explore' },
];

// Utilidades de soporte, ancladas abajo junto al perfil.
const NAV_FOOTER: NavItem[] = [
  { to: '/about', icon: <CircleHelp size={18} strokeWidth={1.75} />, label: 'navigation.help' },
  {
    to: '/settings',
    icon: <SettingsIcon size={18} strokeWidth={1.75} />,
    label: 'navigation.settings',
  },
];

export function Sidebar({ pathname, user, collapsed = false, onToggle }: Props) {
  const { t } = useTranslation('shell');

  return (
    <aside
      aria-label={t('navigation.aria.main')}
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
          <Tooltip content={t('sidebar.tooltip.expand')} side="right">
            <button
              type="button"
              onClick={onToggle}
              aria-label={t('sidebar.toggle.expand')}
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
            <Link to="/home" aria-label={t('sidebar.aria.brandHome')}>
              <LockUp scale={0.85} withTagline={false} />
            </Link>
            <Tooltip content={t('sidebar.tooltip.collapse')} side="right">
              <button
                type="button"
                onClick={onToggle}
                aria-label={t('sidebar.toggle.collapse')}
                className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <PanelLeftClose size={18} strokeWidth={1.75} />
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className={cn('pb-4', collapsed ? 'px-2' : 'px-3')}>
        <Button asChild block aria-label={collapsed ? t('navigation.newManual') : undefined}>
          <Link to="/capture/source" title={collapsed ? t('navigation.newManual') : undefined}>
            <Plus size={18} strokeWidth={2} />
            {collapsed ? null : t('navigation.newManual')}
          </Link>
        </Button>
      </div>

      <nav
        className={cn('flex flex-1 flex-col', collapsed ? 'px-2' : 'px-3')}
        aria-label={t('navigation.aria.sections')}
      >
        <NavList items={NAV_MAIN} pathname={pathname} collapsed={collapsed} />
        <NavList
          items={NAV_FOOTER}
          pathname={pathname}
          collapsed={collapsed}
          className="mt-auto pb-3"
        />
      </nav>

      {user ? (
        <footer className="border-t border-border p-3">
          <UserCard user={user} collapsed={collapsed} />
        </footer>
      ) : null}
    </aside>
  );
}

function NavList({
  items,
  pathname,
  collapsed,
  className,
}: Readonly<{ items: NavItem[]; pathname: string; collapsed: boolean; className?: string }>) {
  const { t } = useTranslation('shell');

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {items.map((item) => {
        const label = t(item.label);
        return (
          <li key={item.to}>
            <MaybeTip show={collapsed} label={label}>
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
                <span className={cn(collapsed && 'sr-only')}>{label}</span>
              </Link>
            </MaybeTip>
          </li>
        );
      })}
    </ul>
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

function UserCard({ user, collapsed }: Readonly<{ user: SidebarUser; collapsed: boolean }>) {
  const { t } = useTranslation('shell');
  const name = user.username || user.email;
  const avatar = (
    <Avatar name={name} size={34} color={user.avatar_color} figure={user.avatar_figure} />
  );

  if (collapsed) {
    return (
      <Tooltip content={name} side="right">
        <Link
          to="/profile"
          aria-label={t('sidebar.aria.profile')}
          className="mx-auto grid size-11 place-items-center rounded-xl transition-colors hover:bg-surface-2"
        >
          {avatar}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Link
      to="/profile"
      aria-label={t('sidebar.aria.profile')}
      className="flex items-center gap-2.5 rounded-xl p-2 transition-colors hover:bg-surface-2"
    >
      {avatar}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-semibold text-fg">{user.username}</span>
        <span className="block truncate text-xs text-fg-3">{elideEmail(user.email, 8)}</span>
      </span>
    </Link>
  );
}
