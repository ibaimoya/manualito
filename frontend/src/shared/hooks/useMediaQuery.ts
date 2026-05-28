import { useEffect, useState, useSyncExternalStore } from 'react';

function getRuntimeWindow(): Window | undefined {
  return globalThis.window;
}

function readRuntimeMediaQuery(query: string): boolean {
  const runtimeWindow = getRuntimeWindow();
  if (runtimeWindow === undefined) return false;
  return runtimeWindow.matchMedia(query).matches;
}

export const MEDIA_QUERIES = {
  desktop: '(min-width: 768px)',
  darkMode: '(prefers-color-scheme: dark)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
  hasHover: '(hover: hover)',
  coarsePointer: '(pointer: coarse)',
  standalonePwa: '(display-mode: standalone)',
} as const;

export type MediaQueryName = keyof typeof MEDIA_QUERIES;

/**
 * Hook para suscribirse a una media query — wraps `window.matchMedia`.
 *
 * Diseño:
 * - **SSR-safe**: si `window` no existe (Node tests sin jsdom, futuros
 *   prerender), devuelve `false` por defecto sin tirar excepción.
 * - **Sin parpadeo en hidratación**: inicializa con `matchMedia(q).matches`
 *   síncrono — el primer render ya tiene el valor correcto.
 * - **Reactivo**: si el usuario redimensiona, rota el móvil o cambia
 *   `prefers-color-scheme` en el SO, el componente se rerendera.
 *
 * @example
 *   const isDesktop = useMediaQuery('(min-width: 768px)');
 *   const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
 *
 * Sigue la guía de MDN sobre feature detection — nunca UA sniffing:
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent
 */
export function useMediaQuery(query: string): boolean {
  // Usamos useSyncExternalStore en lugar de useState+useEffect para evitar
  // glitches al hidratar y para que el valor se lea siempre de la fuente
  // canónica (MediaQueryList).  Patrón canónico React 18+.
  const subscribe = (onChange: () => void): (() => void) => {
    const runtimeWindow = getRuntimeWindow();
    if (runtimeWindow === undefined) return () => undefined;
    const mql = runtimeWindow.matchMedia(query);
    // addEventListener('change', …) es el API moderno; addListener está
    // deprecado pero MDN avisa de que Safari < 14 solo soporta el viejo.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    type Legacy = { addListener: (l: () => void) => void; removeListener: (l: () => void) => void };
    const legacy = mql as unknown as Legacy;
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  };

  const getSnapshot = (): boolean => readMediaSnapshot(query);

  // En SSR siempre `false`.  En cliente, `getSnapshot()`.
  const getServerSnapshot = (): boolean => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ============================================================
   Queries semánticas.
   Centralizan los literales para que el código de producto use nombres
   de dominio sin duplicar hooks con implementaciones idénticas.
   ============================================================ */

export function useNamedMediaQuery(name: MediaQueryName): boolean {
  return useMediaQuery(MEDIA_QUERIES[name]);
}

/**
 * Reexport `useState`-friendly del valor inicial — útil para tests
 * que necesitan saber el snapshot sin hooks (jest-axe, render statiquc).
 */
export function readMediaSnapshot(query: string): boolean {
  return readRuntimeMediaQuery(query);
}

/**
 * Hook auxiliar para escenarios donde `useSyncExternalStore` causa rerenders
 * indeseados en tests legacy. Variant con useState + useEffect.
 * No usar salvo motivo concreto.
 */
export function useMediaQueryLegacy(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaSnapshot(query));
  useEffect(() => {
    const runtimeWindow = getRuntimeWindow();
    if (runtimeWindow === undefined) return undefined;
    const mql = runtimeWindow.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches); // resync por si cambió entre snapshot y mount
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
