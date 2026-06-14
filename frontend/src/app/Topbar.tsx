import {
  Link,
  linkOptions,
  useCanGoBack,
  useRouter,
  type LinkOptions,
} from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
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

const TITLES: Record<string, string> = {
  '/home': 'Inicio',
  '/history': 'Biblioteca',
  '/explore': 'Explorar',
  '/settings': 'Ajustes',
  '/profile': 'Perfil',
  '/security': 'Cuenta y seguridad',
  '/about': 'Ayuda',
};

// Tramos intermedios para rutas que cuelgan de otra: Seguridad vive bajo Perfil,
// así que su ruta es Inicio › Perfil › Cuenta y seguridad.
const PARENTS: Record<string, readonly CrumbLink[]> = {
  '/security': [{ label: 'Perfil', link: linkOptions({ to: '/profile' }) }],
};

// Mismo cuerpo en todos los tramos: con tamaños mezclados los baselines no casan.
const CRUMB_LINK_CLASS =
  'shrink-0 font-display text-sm font-semibold text-fg-2 transition-colors hover:text-fg';
const CRUMB_CURRENT_CLASS = 'truncate font-display text-sm font-bold tracking-tight text-fg';

function HomeCrumb() {
  return (
    <Link to="/home" className={CRUMB_LINK_CLASS}>
      Inicio
    </Link>
  );
}

export function DesktopTopbar({
  pathname,
  actions,
}: Readonly<{ pathname: string; actions?: ReactNode }>) {
  const title = TITLES[pathname] ?? 'Inicio';
  const parents = PARENTS[pathname] ?? [];

  return (
    <div className={cn(TOPBAR_CHROME, 'hidden md:flex')}>
      <div className="flex shrink-0 items-center gap-3">
        <BackButton />
        <span className="h-[22px] w-px bg-border" aria-hidden="true" />
      </div>
      {/* Sin leading-none: con truncate (overflow hidden) recortaba la j/g/y. */}
      {/* En la raíz no hay breadcrumb (sería «Inicio > Inicio»): solo el título. */}
      {pathname === '/home' ? (
        <span className={cn('min-w-0 flex-1', CRUMB_CURRENT_CLASS)}>{title}</span>
      ) : (
        <nav aria-label="Ruta de navegación" className="flex min-w-0 flex-1 items-center gap-1.5">
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
 * Tramo intermedio del breadcrumb. `link` se construye con `linkOptions()`
 * en el callsite: destino y params quedan validados por el router en compile.
 */
interface CrumbLink {
  label: string;
  link: LinkOptions;
}

/**
 * Botón «atrás» del topbar, antes de las migajas. Se apoya en la pila del router
 * (`history.back`). Si entraste directo (deep-link o recarga) y no hay nada detrás,
 * se muestra apagado y no clicable: la salida es por las migajas o el menú.
 */
export function BackButton() {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <button
      type="button"
      onClick={canGoBack ? () => router.history.back() : undefined}
      disabled={!canGoBack}
      aria-label="Atrás"
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
  /** Tramos navegables entre «Manualito» y la página actual. */
  trail?: readonly CrumbLink[];
  actions?: ReactNode;
}>) {
  return (
    <header className={cn(TOPBAR_CHROME, 'flex')}>
      <div className="flex shrink-0 items-center gap-3">
        <BackButton />
        {/* Divisor entre el botón y las migajas (solo en md, donde hay migajas). */}
        <span className="hidden h-[22px] w-px bg-border md:block" aria-hidden="true" />
      </div>

      {/* md+: breadcrumb. */}
      <nav
        aria-label="Ruta de navegación"
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
