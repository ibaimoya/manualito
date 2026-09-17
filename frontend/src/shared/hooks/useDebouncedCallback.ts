import { useCallback, useEffect, useRef } from 'react';

/**
 * Callback debounced: las llamadas se colapsan tras "delayMs" de inactividad.
 * La devuelta es estable e invoca la última "fn" (vía ref), así que puede ir
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

  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout>>(undefined);

  useEffect(() => () => globalThis.clearTimeout(timerRef.current), []);

  return useCallback(
    (...args: TArgs) => {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = globalThis.setTimeout(() => {
        latestRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );
}
