import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook que devuelve una versión debounced de un callback.
 *
 * Patrón canónico para evitar escrituras/efectos secundarios repetidos
 * cuando el usuario spammea un control (toggle de tema, slider, input
 * de búsqueda, etc.).  La función "real" se ejecuta SOLO tras `delayMs`
 * de inactividad — múltiples llamadas consecutivas se colapsan en UNA.
 *
 * Diseño:
 *  - El callback dentro del hook se mantiene fresco vía `latestRef`,
 *    así no necesitamos pasarlo en el array de deps (evita rerenders).
 *  - El timer se limpia al desmontar y al recibir una nueva llamada.
 *  - La función devuelta es ESTABLE (`useCallback` con deps vacías)
 *    para que sea seguro pasarla a otros effects sin causar bucles.
 *
 * @example
 *   const persist = useDebouncedCallback(
 *     (s: Persisted) => localStorage.setItem('k', JSON.stringify(s)),
 *     200,
 *   );
 *   // Spam de 20 cambios en 1s = UN solo setItem al final.
 *
 * @see https://www.developerway.com/posts/debouncing-in-react
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): (...args: TArgs) => void {
  // Mantenemos la última versión del callback para evitar que el closure
  // dentro del timer use una versión obsoleta de `fn`.
  const latestRef = useRef(fn);
  latestRef.current = fn;

  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  // Limpieza al desmontar: si hay un timer pendiente, se cancela para
  // que no dispare callbacks sobre componentes desmontados.
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

/**
 * Variante "flush": expone una función para forzar la ejecución
 * inmediata del callback pendiente (útil cuando el usuario navega
 * fuera y no queremos perder el último valor sin escribir).
 */
export function useDebouncedCallbackWithFlush<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number,
): {
  debounced: (...args: TArgs) => void;
  flush: () => void;
} {
  const latestRef = useRef(fn);
  latestRef.current = fn;

  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const pendingArgsRef = useRef<TArgs | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingArgsRef.current) {
      latestRef.current(...pendingArgsRef.current);
      pendingArgsRef.current = null;
    }
  }, []);

  const debounced = useCallback(
    (...args: TArgs) => {
      pendingArgsRef.current = args;
      if (timerRef.current !== null) {
        globalThis.clearTimeout(timerRef.current);
      }
      timerRef.current = globalThis.setTimeout(() => {
        if (pendingArgsRef.current) {
          latestRef.current(...pendingArgsRef.current);
          pendingArgsRef.current = null;
        }
        timerRef.current = null;
      }, delayMs);
    },
    [delayMs],
  );

  return { debounced, flush };
}
