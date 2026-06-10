import { useCallback, useEffect, useRef } from 'react';

/**
 * Versión debounced de un callback: las llamadas consecutivas se colapsan
 * en una sola tras `delayMs` de inactividad (p. ej. persistir ajustes
 * mientras el usuario spammea un toggle).
 *
 * La función devuelta es estable y siempre invoca la última versión de
 * `fn` (vía ref), así puede pasarse a effects sin causar bucles. El timer
 * pendiente se cancela al desmontar.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  const latestRef = useRef(fn);
  useEffect(() => {
    latestRef.current = fn;
  }, [fn]);

  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
      }
      timerRef.current = globalThis.setTimeout(() => {
        latestRef.current(...args);
        timerRef.current = null;
      }, delayMs);
    },
    [delayMs],
  );
}
