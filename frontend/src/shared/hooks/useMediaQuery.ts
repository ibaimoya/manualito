import { useSyncExternalStore } from 'react';

function getRuntimeWindow(): Window | undefined {
  return globalThis.window;
}

export const MEDIA_QUERIES = {
  desktop: '(min-width: 768px)',
  darkMode: '(prefers-color-scheme: dark)',
} as const;

export type MediaQueryName = keyof typeof MEDIA_QUERIES;

/**
 * Suscripción reactiva a una media query ("window.matchMedia").
 *
 * - SSR-safe: sin "window" devuelve "false" sin lanzar.
 * - Sin parpadeo de hidratación: el primer render ya lee el valor real,
 *   y "useSyncExternalStore" lo mantiene pegado a la fuente canónica.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onChange: () => void): (() => void) => {
    const runtimeWindow = getRuntimeWindow();
    if (runtimeWindow === undefined) return () => undefined;
    const mql = runtimeWindow.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };
  const getSnapshot = (): boolean => readMediaSnapshot(query);
  const getServerSnapshot = (): boolean => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Queries con nombre de dominio, para no duplicar literales en el producto. */
export function useNamedMediaQuery(name: MediaQueryName): boolean {
  return useMediaQuery(MEDIA_QUERIES[name]);
}

/** Lectura puntual (sin reactividad) del estado de una media query. */
export function readMediaSnapshot(query: string): boolean {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow === undefined) return false;
  return runtimeWindow.matchMedia(query).matches;
}
