import { useEffect, useRef, useState } from 'react';

/**
 * Animaciones tipo «máquina de escribir» del chat: revelar la respuesta letra a
 * letra y reescribir el título cuando cambia. Ambas respetan reduced-motion (si
 * está activo, ponen el texto al instante) y acotan la duración para no eternizarse.
 */

function prefersReducedMotion(): boolean {
  // globalThis.matchMedia (no `window`) y guardado por si no hay DOM (SSR/tests).
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const CHAR_MS = 22;
const MIN_TICKS = 24;
const MAX_TICKS = 70;

/**
 * Revela `text` progresivamente cuando `animate` es true (respuesta recién
 * llegada). Si no, lo muestra entero al instante (historial, reduced-motion).
 */
export function useTypewriter(
  text: string,
  animate: boolean,
): Readonly<{ shown: string; done: boolean }> {
  // Arrancamos en 0 solo cuando vamos a animar de verdad; el resto, texto completo.
  const willAnimate = animate && text.length > 0 && !prefersReducedMotion();
  const [count, setCount] = useState(() => (willAnimate ? 0 : text.length));

  useEffect(() => {
    if (!willAnimate) return;
    const len = text.length;
    // Pasos por tick para que el total quede entre ~0,5 s y ~1,5 s sea cual sea el largo.
    const step = Math.ceil(len / Math.min(Math.max(len, MIN_TICKS), MAX_TICKS));
    let revealed = 0;
    const timer = setInterval(() => {
      revealed += step;
      if (revealed >= len) {
        setCount(len);
        clearInterval(timer);
      } else {
        setCount(revealed);
      }
    }, CHAR_MS);
    return () => clearInterval(timer);
  }, [text, willAnimate]);

  // Si dejamos de animar a mitad (llega otra respuesta), mostramos el texto entero.
  const shown = animate ? text.slice(0, count) : text;
  return { shown, done: !animate || count >= text.length };
}

const TITLE_CHAR_MS = 32;

/**
 * Muestra `target`; cuando cambia, lo borra letra a letra y escribe el nuevo
 * (como un chatbot renombrando la conversación). En el primer montaje lo pone directo.
 */
export function useRetypingTitle(target: string): string {
  const [shown, setShown] = useState(target);
  const targetRef = useRef(target);

  useEffect(() => {
    // El título anterior (ya mostrado entero cuando está asentado) es de donde borramos.
    const from = targetRef.current;
    if (target === from) return;
    targetRef.current = target;
    if (prefersReducedMotion()) {
      // rAF para no llamar a setState en el cuerpo del efecto (solo en callbacks).
      const raf = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(raf);
    }
    let current = from;
    let erasing = current.length > 0;
    const timer = setInterval(() => {
      if (erasing) {
        current = current.slice(0, -1);
        if (current.length === 0) erasing = false;
      } else {
        current = target.slice(0, current.length + 1);
      }
      setShown(current);
      if (!erasing && current === target) clearInterval(timer);
    }, TITLE_CHAR_MS);
    return () => clearInterval(timer);
  }, [target]);

  return shown;
}
