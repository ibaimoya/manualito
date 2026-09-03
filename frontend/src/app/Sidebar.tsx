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
import { type ReactNode, useId } from 'react';
import { motion, type TargetAndTransition } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AvatarColor, AvatarFigure } from '@/shared/api/auth';
import { Tooltip } from '@/components/ui/tooltip';
import { Avatar } from '@/shared/components/Avatar';
import { LockUp, Monogram } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';
import { elideEmail } from '@/shared/lib/elideEmail';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

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

type NavItem = { to: NavTo; icon: ReactNode; label: NavKey; hover?: TargetAndTransition };

const NAV_MAIN: NavItem[] = [
  { to: '/home', icon: <Home size={18} strokeWidth={1.75} />, label: 'navigation.home' },
  { to: '/history', icon: <BookOpen size={18} strokeWidth={1.75} />, label: 'navigation.library' },
  {
    to: '/explore',
    icon: <Compass size={18} strokeWidth={1.75} />,
    label: 'navigation.explore',
    hover: {
      transform: [null, 'rotate(-60deg)', 'rotate(30deg)', 'rotate(0deg)'],
      transition: { duration: 0.5, ease: 'easeInOut' },
    },
  },
];

// Utilidades de soporte, ancladas abajo junto al perfil.
const NAV_FOOTER: NavItem[] = [
  {
    to: '/about',
    icon: <CircleHelp size={18} strokeWidth={1.75} />,
    label: 'navigation.help',
    hover: {
      transform: [
        null,
        'rotate(-18deg) scale(1.18)',
        'rotate(12deg) scale(1.18)',
        'rotate(0deg) scale(1)',
      ],
      transition: { duration: 0.4, ease: 'easeInOut' },
    },
  },
  {
    to: '/settings',
    icon: <SettingsIcon size={18} strokeWidth={1.75} />,
    label: 'navigation.settings',
    hover: {
      transform: [null, 'rotate(360deg)'],
      transition: { duration: 0.5, ease: 'easeInOut' },
      transitionEnd: { transform: 'rotate(0deg)' },
    },
  },
];

export function Sidebar({ pathname, user, collapsed = false, onToggle }: Props) {
  const { t } = useTranslation('shell');
  const indicatorId = useId();

  return (
    <motion.aside
      layoutRoot
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
        {!collapsed && (
          <Link
            to="/home"
            aria-label={t('sidebar.aria.brandHome')}
            className="brand-home inline-flex min-h-11 items-center"
          >
            <LockUp scale={0.85} withTagline={false} />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'sidebar.toggle.expand' : 'sidebar.toggle.collapse')}
          className={cn(
            'icon-feedback group relative grid size-11 shrink-0 place-items-center transition-colors',
            collapsed ? 'rounded-xl' : 'rounded-lg text-fg-3 hover:text-fg',
          )}
        >
          {collapsed ? (
            <>
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
            </>
          ) : (
            <PanelLeftClose size={18} strokeWidth={1.75} />
          )}
        </button>
      </div>

      <div className={cn('shrink-0 pb-4', collapsed ? 'px-2' : 'px-3')}>
        <Button asChild block aria-label={collapsed ? t('navigation.newManual') : undefined}>
          <Link to="/capture/source">
            <Plus size={18} strokeWidth={2} />
            {collapsed ? null : t('navigation.newManual')}
          </Link>
        </Button>
      </div>

      <motion.nav
        layoutScroll
        className={cn(
          'isolate flex min-h-0 flex-1 flex-col overflow-y-auto',
          collapsed ? 'px-2' : 'px-3',
        )}
        aria-label={t('navigation.aria.sections')}
      >
        <NavList
          items={NAV_MAIN}
          pathname={pathname}
          collapsed={collapsed}
          indicatorId={indicatorId}
        />
        <NavList
          items={NAV_FOOTER}
          pathname={pathname}
          collapsed={collapsed}
          indicatorId={indicatorId}
          className="mt-auto pb-3"
        />
      </motion.nav>

      {user ? (
        <footer className="shrink-0 border-t border-border p-3">
          <UserCard user={user} collapsed={collapsed} />
        </footer>
      ) : null}
    </motion.aside>
  );
}

function NavList({
  items,
  pathname,
  collapsed,
  indicatorId,
  className,
}: Readonly<{
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
  indicatorId: string;
  className?: string;
}>) {
  const { t } = useTranslation('shell');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canAnimate = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {items.map((item) => {
        const label = t(item.label);
        return (
          <motion.li
            key={item.to}
            initial={false}
            animate={canAnimate ? 'rest' : 'static'}
            whileHover={canAnimate ? 'hover' : undefined}
          >
            <MaybeTip show={collapsed} label={label}>
              <Link
                to={item.to}
                aria-current={pathname === item.to ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 items-center rounded-xl text-sm font-semibold',
                  collapsed ? 'justify-center px-0' : 'gap-3 px-3 py-2.5',
                  pathname === item.to ? 'text-primary-700' : 'text-fg-2 hover:text-fg',
                )}
              >
                {pathname === item.to && (
                  <motion.span
                    key={reducedMotion ? 'static' : 'animated'}
                    layoutId={reducedMotion ? undefined : indicatorId}
                    initial={false}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 bg-primary-100"
                    style={{ borderRadius: 12 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  />
                )}
                <motion.span
                  aria-hidden="true"
                  className="navigation-icon grid h-6 w-6 shrink-0 place-items-center"
                  variants={{
                    static: { transform: 'rotate(0deg)', transition: { duration: 0 } },
                    rest: {
                      transform: 'rotate(0deg)',
                      transition: { duration: 0.12 },
                    },
                    hover: item.hover ?? {
                      transform: [
                        null,
                        'rotate(-12deg)',
                        'rotate(8deg)',
                        'rotate(-4deg)',
                        'rotate(0deg)',
                      ],
                      transition: { duration: 0.32, ease: 'easeInOut' },
                    },
                  }}
                >
                  {item.icon}
                </motion.span>
                <span className={cn(collapsed && 'sr-only')}>{label}</span>
              </Link>
            </MaybeTip>
          </motion.li>
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

  return (
    <MaybeTip show={collapsed} label={name}>
      <Link
        to="/profile"
        aria-label={t('sidebar.aria.profile')}
        className={cn(
          'group/profile rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700',
          collapsed ? 'mx-auto grid size-11 place-items-center' : 'flex items-center gap-2.5 p-2',
        )}
      >
        <Avatar
          name={name}
          size={34}
          color={user.avatar_color}
          figure={user.avatar_figure}
          className="transition-control pointer-fine:motion-safe:group-hover/profile:scale-[1.08] motion-safe:group-active/profile:scale-95"
        />
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-fg underline decoration-transparent underline-offset-2 transition-colors group-hover/profile:text-primary-700 group-hover/profile:decoration-primary-700">
              {user.username}
            </span>
            <span className="block truncate text-xs text-fg-3">{elideEmail(user.email, 8)}</span>
          </span>
        )}
      </Link>
    </MaybeTip>
  );
}
