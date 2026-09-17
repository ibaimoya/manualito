import { StrictMode } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeBook } from '@/features/onboarding/WelcomeBook';
import styles from '@/features/onboarding/welcome-book.module.css';

function systemPreferences() {
  // jsdom no consulta el dispositivo. Solo se sustituye esa frontera.
  // WelcomeBook, useMediaQuery, Motion y requestAnimationFrame son reales.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches: true,
    media: '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (canMove: boolean) =>
    act(() => {
      media.matches = canMove;
      media.dispatchEvent(new Event('change'));
    });
}

function renderBook() {
  const { container } = render(<WelcomeBook />, { wrapper: StrictMode });
  const stage = container.firstElementChild;
  const tilt = container.querySelector<HTMLElement>(`.${styles.tilt}`);
  const cover = container.querySelector<HTMLElement>(`.${styles.cover}`);
  if (!(stage instanceof HTMLElement) || !tilt || !cover) {
    throw new Error('No se ha montado el libro');
  }
  return { stage, tilt, cover };
}

function rotationY(element: HTMLElement): number {
  const transform = element.style.transform;
  if (transform === 'none') return 0;
  const angle = /rotateY\(([-\d.]+)deg\)/.exec(transform)?.[1];
  if (angle === undefined || !Number.isFinite(Number(angle))) {
    throw new Error(`Rotación inesperada: ${transform || '(vacía)'}`);
  }
  return Number(angle);
}

function moveMouse(stage: HTMLElement, direction = 1) {
  // Se comprueba la respuesta al evento, no su geometría. jsdom no pinta el
  // libro ni calcula su tamaño. La perspectiva y el seguimiento se revisan en navegador.
  fireEvent.pointerMove(stage, {
    pointerType: 'mouse',
    clientX: direction * 20,
    clientY: direction * 20,
  });
}

function nextFrame() {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

function expectRest({ tilt, cover }: ReturnType<typeof renderBook>) {
  expect(tilt.style.transform).toBe('none');
  expect(rotationY(cover)).toBe(0);
}

afterEach(() => vi.restoreAllMocks());

describe('WelcomeBook', () => {
  it('vuelve al salir, sigue la última dirección al reentrar y se asienta al cancelar', async () => {
    systemPreferences();
    const book = renderBook();
    expectRest(book);

    moveMouse(book.stage);

    await waitFor(() => {
      expect(rotationY(book.tilt)).toBeGreaterThan(0);
      expect(rotationY(book.cover)).toBeLessThan(0);
    });

    fireEvent.pointerLeave(book.stage, { pointerType: 'mouse' });
    await waitFor(() => expectRest(book));

    moveMouse(book.stage, -1);
    await waitFor(() => expect(rotationY(book.tilt)).toBeLessThan(0));
    fireEvent.pointerLeave(book.stage, { pointerType: 'mouse' });
    moveMouse(book.stage);
    await waitFor(() => expect(rotationY(book.tilt)).toBeGreaterThan(0));

    fireEvent.pointerCancel(book.stage, { pointerType: 'mouse' });
    await waitFor(() => expectRest(book));
  });

  it('asienta el libro al desactivar el movimiento y espera a una nueva entrada al reactivarlo', async () => {
    const setCanMove = systemPreferences();
    const book = renderBook();
    moveMouse(book.stage);
    await waitFor(() => expect(rotationY(book.cover)).toBeLessThan(0));

    setCanMove(false);
    await nextFrame();
    expectRest(book);

    moveMouse(book.stage);
    await nextFrame();
    await nextFrame();
    expectRest(book);

    setCanMove(true);
    await nextFrame();
    expectRest(book);

    moveMouse(book.stage);
    await waitFor(() => expect(rotationY(book.cover)).toBeLessThan(0));
  });

  it('ignora el puntero táctil aunque el dispositivo también permita usar ratón', async () => {
    systemPreferences();
    const book = renderBook();

    fireEvent.pointerMove(book.stage, {
      pointerType: 'touch',
      clientX: 20,
      clientY: 20,
    });
    await nextFrame();
    await nextFrame();

    expectRest(book);
    moveMouse(book.stage);
    await waitFor(() => expect(rotationY(book.cover)).toBeLessThan(0));
  });
});
