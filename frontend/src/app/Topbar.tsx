import {
  Link,
  linkOptions,
  useCanGoBack,
  useRouter,
  type LinkOptions,
} from '@tanstack/react-router';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { cn } from '@/shared/lib/cn';

/**
 * Barra superior del shell, con la misma base visual en todas las pantallas.
 * DesktopTopbar muestra la cabecera de escritorio.
 * ScreenTopBar usa migas de navegación en escritorio y título centrado en móvil.
 */

// Misma base visual en md+. Las dos barras "pegan" al cambiar de pantalla.
const TOPBAR_CHROME =
  'sticky top-0 z-30 h-14 items-center gap-4 border-b border-border bg-bg/95 px-4 backdrop-blur md:pl-5 md:pr-8';

const TITLES = {
  '/home': 'navigation.home',
  '/history': 'navigation.library',
  '/explore': 'navigation.explore',
  '/settings': 'navigation.settings',
  '/profile': 'topbar.titles.profile',
  '/security': 'topbar.titles.security',
  '/about': 'navigation.help',
  '/privacy': 'topbar.titles.privacy',
} as const;

// Tramos intermedios para rutas que cuelgan de otra. Seguridad vive bajo Perfil,
// así que su ruta es Inicio › Perfil › Cuenta y seguridad.
const PARENT_KEYS: Record<string, readonly ParentKey[]> = {
  '/security': [{ labelKey: 'topbar.titles.profile', link: linkOptions({ to: '/profile' }) }],
};

// Mismo cuerpo en todos los tramos. Con tamaños mezclados los baselines no casan.
const CRUMB_LINK_CLASS =
  'hit-area inline-flex shrink-0 items-center rounded-sm font-display text-sm font-semibold text-fg-2 transition-colors hover:text-fg';
const CRUMB_CURRENT_CLASS = 'truncate font-display text-sm font-bold tracking-tight text-fg';

function HomeCrumb() {
  const { t } = useTranslation('shell');

  return (
    <Link to="/home" className={CRUMB_LINK_CLASS}>
      {t('navigation.home')}
    </Link>
  );
}

export function DesktopTopbar({
  pathname,
  actions,
}: Readonly<{ pathname: string; actions?: ReactNode }>) {
  const { t } = useTranslation('shell');
  const title = t(TITLES[pathname as keyof typeof TITLES] ?? 'navigation.home');
  const parents = (PARENT_KEYS[pathname] ?? []).map(({ labelKey, link }) => ({
    label: t(labelKey),
    link,
  }));

  return (
    <div className={cn(TOPBAR_CHROME, 'hidden md:flex')}>
      <div className="flex shrink-0 items-center gap-3">
        <BackButton />
        <span className="h-[22px] w-px bg-border" aria-hidden="true" />
      </div>
      {/* Sin leading-none. Con truncate (overflow hidden) recortaba la j/g/y. */}
      {/* En la raíz no hay breadcrumb (sería "Inicio > Inicio"). Solo el título. */}
      {pathname === '/home' ? (
        <span className={cn('min-w-0 flex-1', CRUMB_CURRENT_CLASS)}>{title}</span>
      ) : (
        <nav
          aria-label={t('topbar.aria.breadcrumb')}
          className="breadcrumb-trail flex min-w-0 flex-1 items-center gap-1.5"
        >
          <HomeCrumb />
          {parents.map((item, index) => (
            <Fragment key={item.label}>
              <CrumbSeparator remaining={parents.length - index} />
              <Link {...item.link} className={cn(CRUMB_LINK_CLASS, 'max-w-44')}>
                <span className="truncate">{item.label}</span>
              </Link>
            </Fragment>
          ))}
          <CrumbSeparator />
          <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
            {title}
          </span>
        </nav>
      )}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/**
 * Tramo intermedio del breadcrumb. "link" se construye con "linkOptions()"
 * en el callsite. Destino y params quedan validados por el router en compile.
 */
interface CrumbLink {
  label: string;
  link: LinkOptions;
}

interface ParentKey {
  labelKey: 'topbar.titles.profile';
  link: LinkOptions;
}

/**
 * Botón atrás del topbar, antes de las migajas. Se apoya en la pila del router
 * ("history.back"). Si entraste directo (deep-link o recarga) y no hay nada detrás,
 * se muestra apagado y no clicable. La salida es por las migajas o el menú.
 */
function BackButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <button
      type="button"
      onClick={canGoBack ? () => router.history.back() : undefined}
      disabled={!canGoBack}
      aria-label={t('actions.back')}
      className={cn(
        'hit-area icon-feedback grid size-8 shrink-0 place-items-center rounded-full transition-colors pointer-coarse:size-11',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
        canGoBack ? 'text-fg-2 hover:text-fg' : 'cursor-not-allowed text-fg-3 opacity-40',
      )}
    >
      <CaretLeftIcon data-icon-motion="back" size={18} aria-hidden="true" />
    </button>
  );
}

function CrumbSeparator({ remaining = 0 }: Readonly<{ remaining?: number }>) {
  return (
    <CaretRightIcon
      data-icon-motion="forward"
      size={15}
      className="shrink-0 text-fg-3"
      style={{ '--crumb-delay': `${remaining * 50}ms` } as CSSProperties}
      aria-hidden="true"
    />
  );
}

export function ScreenTopBar({
  crumb,
  trail,
  actions,
}: Readonly<{
  crumb: string;
  /** Tramos navegables entre "Manualito" y la página actual. */
  trail?: readonly CrumbLink[];
  actions?: ReactNode;
}>) {
  const { t } = useTranslation('shell');

  return (
    <header
      className={cn(
        TOPBAR_CHROME,
        'flex max-md:grid max-md:grid-cols-[44px_minmax(0,1fr)_44px] max-md:gap-2',
      )}
    >
      <div className="flex shrink-0 items-center gap-3">
        <BackButton />
        {/* Divisor entre el botón y las migajas (solo en md, donde hay migajas). */}
        <span className="hidden h-[22px] w-px bg-border md:block" aria-hidden="true" />
      </div>

      {/* md+. Breadcrumb. */}
      <nav
        aria-label={t('topbar.aria.breadcrumb')}
        className="breadcrumb-trail hidden min-w-0 flex-1 items-center gap-1.5 md:flex"
      >
        <HomeCrumb />
        {trail?.map((item, index) => (
          <Fragment key={item.label}>
            <CrumbSeparator remaining={trail.length - index} />
            <Link {...item.link} className={cn(CRUMB_LINK_CLASS, 'max-w-44')}>
              <span className="truncate">{item.label}</span>
            </Link>
          </Fragment>
        ))}
        <CrumbSeparator />
        <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
          {crumb}
        </span>
      </nav>

      {/* móvil. Título centrado. */}
      <h1 className="min-w-0 flex-1 truncate text-center max-md:col-start-2 font-display text-lg font-bold tracking-tight md:hidden">
        {crumb}
      </h1>

      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <HelpMenuButton className="md:hidden" />
      </div>
    </header>
  );
}
