import { useCallback, useSyncExternalStore } from 'react';

export const MEDIA_QUERIES = {
  desktop: '(min-width: 768px)',
  darkMode: '(prefers-color-scheme: dark)',
} as const;

export type MediaQueryName = keyof typeof MEDIA_QUERIES;

const getServerSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = globalThis.window?.matchMedia(query);
      media?.addEventListener('change', onChange);
      return () => media?.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => readMediaSnapshot(query), getServerSnapshot);
}

/** Queries con nombre de dominio, para no duplicar literales en el producto. */
export function useNamedMediaQuery(name: MediaQueryName): boolean {
  return useMediaQuery(MEDIA_QUERIES[name]);
}

/** Lectura puntual (sin reactividad) del estado de una media query. */
export function readMediaSnapshot(query: string): boolean {
  return globalThis.window?.matchMedia(query).matches ?? false;
}
