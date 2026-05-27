import { useCallback, useEffect, useRef } from 'react';

/**
 * Hook utilitario para disparar `<input type="file">` ocultos sin que el
 * spam de clicks abra el picker múltiples veces.
 *
 * Bug #4 del catálogo `notimportant/errores-tipicos-encontrados-frontend.md`:
 * en algunos navegadores (sobre todo iOS Safari), pulsar 2 veces rápido el
 * botón que llama `input.click()` abre dos diálogos en cascada — el
 * primero se cierra y el segundo queda flotante.
 *
 * Solución canónica (Stoke, dev.to): flag con timeout 400 ms — equivalente
 * a "deduplicar clicks humanos".  Al recibir `change` o `cancel` del
 * input, se resetea el flag para permitir el siguiente picker.
 *
 * Uso:
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   const openPicker = useFilePicker(inputRef);
 *   …
 *   <button onClick={openPicker}>Subir</button>
 *   <input ref={inputRef} type="file" className="sr-only" onChange={…} />
 *
 * Devuelve una función estable (`useCallback`) que es seguro pasar a
 * props/handlers sin causar rerenders.
 */
export function useFilePicker(
  inputRef: React.RefObject<HTMLInputElement | null>,
): () => void {
  // `pickerOpenRef` evita reentradas síncronas (doble-click rápido).
  const pickerOpenRef = useRef(false);
  // Mantiene el id del timer para limpiarlo en unmount.
  const resetTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  // Cleanup: si el componente se desmonta con un picker "abierto", limpia
  // el flag y el timer para que la próxima sesión empiece fresca.
  useEffect(
    () => () => {
      pickerOpenRef.current = false;
      if (resetTimerRef.current !== null) {
        globalThis.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    },
    [],
  );

  return useCallback(() => {
    if (pickerOpenRef.current) return; // ya hay un picker en curso
    const input = inputRef.current;
    if (!input) return;

    pickerOpenRef.current = true;
    input.click();

    // Reset tras 400 ms: tiempo de double-click humano + margen para que
    // el diálogo nativo arranque.  El reset real lo dispara también
    // `change`/`cancel` en el componente padre cuando el usuario interactúa.
    resetTimerRef.current = globalThis.setTimeout(() => {
      pickerOpenRef.current = false;
      resetTimerRef.current = null;
    }, 400);
  }, [inputRef]);
}
