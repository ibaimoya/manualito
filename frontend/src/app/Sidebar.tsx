import { Link } from '@tanstack/react-router';
import {
  BookOpenIcon,
  QuestionIcon,
  HouseIcon,
  PlusIcon,
  GearSixIcon,
  type Icon,
} from '@phosphor-icons/react';
import { type ReactNode, useId, useState } from 'react';
import { motion, type TargetAndTransition } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { AvatarColor, AvatarFigure } from '@/shared/api/auth';
import { Tooltip } from '@/components/ui/tooltip';
import { HelpDisclosure, HelpMenu, HelpMenuTrigger } from '@/features/tutorial/HelpMenu';
import { tourTarget } from '@/features/tutorial/targets';
import type { TourTarget } from '@/features/tutorial/types';
import { Avatar } from '@/shared/components/Avatar';
import { LockUp, Monogram } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';
import { NAVIGATION_SPRING } from '@/shared/lib/navigationMotion';
import { elideEmail } from '@/shared/lib/elideEmail';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { ExploreIcon, SidebarToggleIcon } from './navigation-icons';

type NavTo = '/home' | '/history' | '/explore' | '/settings';

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

type NavLinkItem = {
  kind: 'link';
  to: NavTo;
  icon: Icon;
  label: NavKey;
  hover?: TargetAndTransition;
  tour?: TourTarget;
};

type NavMenuItem = { kind: 'help'; icon: Icon; label: NavKey; hover?: TargetAndTransition };

type NavItem = NavLinkItem | NavMenuItem;

const NAV_ITEMS: NavItem[] = [
  { kind: 'link', to: '/home', icon: HouseIcon, label: 'navigation.home' },
  {
    kind: 'link',
    to: '/history',
    icon: BookOpenIcon,
    label: 'navigation.library',
    tour: 'nav-library',
  },
  {
    kind: 'link',
    to: '/explore',
    icon: ExploreIcon,
    label: 'navigation.explore',
    tour: 'nav-explore',
    hover: {
      transform: 'rotate(0deg) scale(1)',
    },
  },
  {
    kind: 'help',
    icon: QuestionIcon,
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
    kind: 'link',
    to: '/settings',
    icon: GearSixIcon,
    label: 'navigation.settings',
    hover: {
      transform: [null, 'rotate(360deg) scale(1)'],
      transition: { duration: 0.5, ease: 'easeInOut' },
      transitionEnd: { transform: 'rotate(0deg) scale(1)' },
    },
  },
];

export function Sidebar({ pathname, user, collapsed = false, onToggle }: Props) {
  const { t } = useTranslation('shell');
  const indicatorId = useId();
  const [help, setHelp] = useState<{
    pathname: string;
    open: boolean;
    selected: 'help' | 'faq';
  } | null>(null);
  const helpActive = help?.pathname === pathname;
  const helpOpen = !collapsed && helpActive && help.open;
  const highlighted = helpActive ? help.selected : pathname;
  const setHelpOpen = (open: boolean) => {
    setHelp({ pathname, open, selected: 'help' });
  };
  const openFaq = () => setHelp({ pathname: '/about', open: true, selected: 'faq' });
  const resetHelp = () => setHelp(null);

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
      {/* Cabecera de altura fija. La columna no salta verticalmente al plegar. */}
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
          onClick={() => {
            resetHelp();
            onToggle?.();
          }}
          aria-expanded={!collapsed}
          aria-label={t(collapsed ? 'sidebar.toggle.expand' : 'sidebar.toggle.collapse')}
          className={cn(
            'sidebar-toggle group relative grid size-11 shrink-0 place-items-center transition-colors',
            collapsed ? 'rounded-xl' : 'rounded-lg text-fg-3 hover:text-fg',
          )}
        >
          {collapsed && (
            <span
              aria-hidden="true"
              className="transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
            >
              <Monogram size={34} radius={10} />
            </span>
          )}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 grid place-items-center transition-opacity duration-150',
              collapsed &&
                'text-fg-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            <SidebarToggleIcon />
          </span>
        </button>
      </div>

      <div className={cn('shrink-0 pb-4', collapsed ? 'px-2' : 'px-3')}>
        <Button asChild block aria-label={collapsed ? t('navigation.newManual') : undefined}>
          <Link to="/capture/source" {...tourTarget('nav-new-manual')}>
            <PlusIcon data-icon-motion="plus" aria-hidden="true" size={18} />
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
          pathname={pathname}
          collapsed={collapsed}
          indicatorId={indicatorId}
          helpOpen={helpOpen}
          setHelpOpen={setHelpOpen}
          highlighted={highlighted}
          onOpenFaq={openFaq}
          onNavigate={resetHelp}
        />
      </motion.nav>

      {user ? (
        <footer className="grid min-h-[var(--chat-composer-height,0px)] shrink-0 items-end border-t border-border p-3">
          <UserCard user={user} collapsed={collapsed} />
        </footer>
      ) : null}
    </motion.aside>
  );
}

function NavList({
  pathname,
  collapsed,
  indicatorId,
  helpOpen,
  setHelpOpen,
  highlighted,
  onOpenFaq,
  onNavigate,
}: Readonly<{
  pathname: string;
  collapsed: boolean;
  indicatorId: string;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  highlighted: string;
  onOpenFaq: () => void;
  onNavigate: () => void;
}>) {
  const { t } = useTranslation('shell');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canAnimate = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  return (
    <ul className="flex flex-1 flex-col gap-1 pb-3">
      {NAV_ITEMS.map((item) => {
        const label = t(item.label);
        const active = item.kind === 'link' && pathname === item.to;
        const selected =
          item.kind === 'help'
            ? ['help', 'faq', '/about'].includes(highlighted)
            : highlighted === item.to;
        const itemClass = cn(
          'navigation-link relative flex min-h-11 items-center rounded-xl text-sm font-semibold',
          collapsed ? 'justify-center px-0' : 'gap-3 px-3 py-2.5',
          selected ? 'text-primary-700' : 'text-fg-2 hover:text-fg',
        );
        const indicator = selected ? (
          <motion.span
            key={reducedMotion ? 'static' : 'animated'}
            layoutId={reducedMotion ? undefined : indicatorId}
            initial={false}
            aria-hidden="true"
            data-navigation-indicator=""
            className="pointer-events-none absolute inset-0 -z-10 bg-primary-100"
            style={{ borderRadius: 12 }}
            transition={NAVIGATION_SPRING}
          />
        ) : null;
        const content = (
          <>
            <motion.span
              aria-hidden="true"
              className="navigation-icon grid h-6 w-6 shrink-0 place-items-center"
              variants={{
                static: { transform: 'rotate(0deg) scale(1)', transition: { duration: 0 } },
                rest: {
                  transform: 'rotate(0deg) scale(1)',
                  transition: { duration: 0.12 },
                },
                hover: item.hover ?? {
                  transform: [
                    null,
                    'rotate(-12deg) scale(1)',
                    'rotate(8deg) scale(1)',
                    'rotate(-4deg) scale(1)',
                    'rotate(0deg) scale(1)',
                  ],
                  transition: { duration: 0.32, ease: 'easeInOut' },
                },
              }}
            >
              <item.icon size={20} weight={active ? 'duotone' : undefined} aria-hidden="true" />
            </motion.span>
            <span className={cn(collapsed && 'sr-only')}>{label}</span>
          </>
        );
        return (
          <motion.li
            key={item.kind === 'link' ? item.to : item.kind}
            className={item.kind === 'help' ? 'mt-auto' : undefined}
            initial={false}
            animate={canAnimate ? 'rest' : 'static'}
            whileHover={canAnimate ? 'hover' : undefined}
          >
            {item.kind === 'help' && !collapsed ? (
              <HelpDisclosure
                className={itemClass}
                open={helpOpen}
                onOpenChange={setHelpOpen}
                indicator={indicator}
                highlighted={helpOpen && highlighted === 'faq' ? 'faq' : 'help'}
                onOpenFaq={onOpenFaq}
              >
                {content}
              </HelpDisclosure>
            ) : item.kind === 'help' ? (
              <HelpMenu side="top" align="start">
                <MaybeTip show={collapsed} label={label}>
                  <HelpMenuTrigger asChild>
                    <button
                      type="button"
                      {...tourTarget('nav-help')}
                      className={cn(
                        itemClass,
                        'w-full text-left data-[state=open]:bg-primary-100 data-[state=open]:text-primary-700',
                      )}
                    >
                      {indicator}
                      {content}
                    </button>
                  </HelpMenuTrigger>
                </MaybeTip>
              </HelpMenu>
            ) : (
              <MaybeTip show={collapsed} label={label}>
                <Link
                  to={item.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  {...(item.tour ? tourTarget(item.tour) : {})}
                  className={itemClass}
                >
                  {indicator}
                  {content}
                </Link>
              </MaybeTip>
            )}
          </motion.li>
        );
      })}
    </ul>
  );
}

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
