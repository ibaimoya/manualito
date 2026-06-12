import { useCallback, useEffect, useRef } from 'react';

/**
 * Callback debounced: las llamadas se colapsan tras `delayMs` de inactividad.
 * La devuelta es estable e invoca la última `fn` (vía ref), así que puede ir
 * en deps de effects; el timer pendiente se cancela al desmontar.
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
