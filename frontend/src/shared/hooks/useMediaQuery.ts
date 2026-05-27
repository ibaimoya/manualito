import { useEffect, useState, useSyncExternalStore } from 'react';

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
    if (typeof window === 'undefined') return () => undefined;
    const mql = window.matchMedia(query);
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

  const getSnapshot = (): boolean => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  };

  // En SSR siempre `false`.  En cliente, `getSnapshot()`.
  const getServerSnapshot = (): boolean => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/* ============================================================
   Atajos semánticos — wrappers sobre useMediaQuery.
   Centralizan las queries dispersas por el código para que solo se
   declaren en UN sitio (este).
   ============================================================ */

/** ≥ 768 px — salto cualitativo a "desktop layout" (sidebar, etc.). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

/** Sistema operativo en modo oscuro. */
export function useDarkMode(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

/** Usuario pidió animaciones reducidas (accesibilidad). */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** El input principal puede hacer hover (mouse, trackpad).  Touch puro: false. */
export function useHasHover(): boolean {
  return useMediaQuery('(hover: hover)');
}

/** Input principal es coarse (dedo) — útil para targets táctiles grandes. */
export function useIsCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/** La PWA está corriendo como app instalada (no en pestaña del navegador). */
export function useIsStandalonePWA(): boolean {
  return useMediaQuery('(display-mode: standalone)');
}

/**
 * Reexport `useState`-friendly del valor inicial — útil para tests
 * que necesitan saber el snapshot sin hooks (jest-axe, render statiquc).
 */
export function readMediaSnapshot(query: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
}

/**
 * Hook auxiliar para escenarios donde `useSyncExternalStore` causa rerenders
 * indeseados en tests legacy. Variant con useState + useEffect.
 * No usar salvo motivo concreto.
 */
export function useMediaQueryLegacy(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaSnapshot(query));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    setMatches(mql.matches); // resync por si cambió entre snapshot y mount
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
