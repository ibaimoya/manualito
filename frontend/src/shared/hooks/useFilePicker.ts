import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Dispara un `<input type="file">` oculto desde un botón con estilo propio.
 * Un flag con reset a 400 ms evita que un doble-click rápido abra dos
 * diálogos nativos en cascada (problema típico de iOS Safari: el primero se
 * cierra y el segundo queda flotante).
 *
 * Uso:
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   const openPicker = useFilePicker(inputRef);
 *   <button onClick={openPicker}>Subir</button>
 *   <input ref={inputRef} type="file" className="sr-only" onChange={...} />
 *
 * Devuelve una función estable (`useCallback`), segura como handler.
 */
export function useFilePicker(inputRef: RefObject<HTMLInputElement | null>): () => void {
  const openRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) globalThis.clearTimeout(timerRef.current);
    },
    [],
  );

  return useCallback(() => {
    if (openRef.current) return;
    const input = inputRef.current;
    if (!input) return;
    openRef.current = true;
    input.click();
    timerRef.current = globalThis.setTimeout(() => {
      openRef.current = false;
      timerRef.current = null;
    }, 400);
  }, [inputRef]);
}
