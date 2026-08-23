import {
  Link,
  linkOptions,
  useCanGoBack,
  useRouter,
  type LinkOptions,
} from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';

/**
 * Barra superior del shell, con la misma base visual en todas las pantallas.
 * DesktopTopbar: pantallas con navegación (md+; en móvil manda la bottom-nav).
 * ScreenTopBar: pantallas inmersivas — breadcrumb en md+, cabecera clásica
 * con volver + título centrado en móvil.
 */

// Misma base visual en md+: las dos barras "pegan" al cambiar de pantalla.
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

// Tramos intermedios para rutas que cuelgan de otra: Seguridad vive bajo Perfil,
// así que su ruta es Inicio › Perfil › Cuenta y seguridad.
const PARENT_KEYS: Record<string, readonly ParentKey[]> = {
  '/security': [{ labelKey: 'topbar.titles.profile', link: linkOptions({ to: '/profile' }) }],
};

// Mismo cuerpo en todos los tramos: con tamaños mezclados los baselines no casan.
const CRUMB_LINK_CLASS =
  'shrink-0 font-display text-sm font-semibold text-fg-2 transition-colors hover:text-fg';
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
      {/* Sin leading-none: con truncate (overflow hidden) recortaba la j/g/y. */}
      {/* En la raíz no hay breadcrumb (sería "Inicio > Inicio"): solo el título. */}
      {pathname === '/home' ? (
        <span className={cn('min-w-0 flex-1', CRUMB_CURRENT_CLASS)}>{title}</span>
      ) : (
        <nav
          aria-label={t('topbar.aria.breadcrumb')}
          className="flex min-w-0 flex-1 items-center gap-1.5"
        >
          <HomeCrumb />
          {parents.map((item) => (
            <Fragment key={item.label}>
              <CrumbSeparator />
              <Link {...item.link} className={cn(CRUMB_LINK_CLASS, 'max-w-44 truncate')}>
                {item.label}
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
 * en el callsite: destino y params quedan validados por el router en compile.
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
 * se muestra apagado y no clicable: la salida es por las migajas o el menú.
 */
export function BackButton() {
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
        'grid size-8 shrink-0 place-items-center rounded-full transition-[background-color,color,translate]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
        canGoBack
          ? 'text-fg-2 hover:bg-surface-2 hover:text-fg active:-translate-x-px'
          : 'cursor-not-allowed text-fg-3 opacity-40',
      )}
    >
      <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
    </button>
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
  actions,
}: Readonly<{
  crumb: string;
  /** Tramos navegables entre "Manualito" y la página actual. */
  trail?: readonly CrumbLink[];
  actions?: ReactNode;
}>) {
  const { t } = useTranslation('shell');

  return (
    <header className={cn(TOPBAR_CHROME, 'flex')}>
      <div className="flex shrink-0 items-center gap-3">
        <BackButton />
        {/* Divisor entre el botón y las migajas (solo en md, donde hay migajas). */}
        <span className="hidden h-[22px] w-px bg-border md:block" aria-hidden="true" />
      </div>

      {/* md+: breadcrumb. */}
      <nav
        aria-label={t('topbar.aria.breadcrumb')}
        className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex"
      >
        <HomeCrumb />
        {trail?.map((item) => (
          <Fragment key={item.label}>
            <CrumbSeparator />
            <Link {...item.link} className={cn(CRUMB_LINK_CLASS, 'max-w-44 truncate')}>
              {item.label}
            </Link>
          </Fragment>
        ))}
        <CrumbSeparator />
        <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
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
