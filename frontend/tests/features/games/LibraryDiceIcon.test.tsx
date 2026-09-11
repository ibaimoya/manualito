import { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LibraryDiceIcon } from '@/features/games/LibraryDiceIcon';

function systemMotion() {
  // jsdom no expone las preferencias ni los dispositivos de entrada del sistema.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches: true,
    media: '(prefers-reduced-motion: no-preference)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (reduced: boolean) =>
    act(() => {
      media.matches = !reduced;
      media.dispatchEvent(new Event('change'));
    });
}

function LibraryTabs() {
  const [view, setView] = useState('manuals');
  return (
    <SegmentedControl
      value={view}
      onChange={setView}
      options={[
        { value: 'games', label: 'Juegos', icon: <LibraryDiceIcon /> },
        { value: 'manuals', label: 'Manuales' },
      ]}
    />
  );
}

function setup() {
  const reducedMotion = systemMotion();
  const view = render(<LibraryTabs />, { wrapper: StrictMode });
  const button = screen.getByRole('radio', { name: 'Juegos' });
  const dice = button.querySelector<HTMLElement>('.library-die')!;
  const enter = () => fireEvent.pointerEnter(button, { pointerType: 'mouse' });
  const leave = () => fireEvent.pointerLeave(button, { pointerType: 'mouse' });
  const roll = () => fireEvent.click(button);
  const angle = () => Number(dice.style.transform.match(/rotateX\(([-\d.]+)deg\)/)?.[1] ?? 0);
  return { ...view, reducedMotion, button, dice, enter, leave, roll, angle };
}

function nextFrame() {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

afterEach(() => vi.restoreAllMocks());

describe('LibraryDiceIcon con Motion real', () => {
  it('gira al clicar, conserva la cara y mantiene el hover separado de la selección', async () => {
    const { button, enter, leave, roll, angle } = setup();
    enter();
    await nextFrame();
    expect(angle()).toBe(0);
    roll();
    await waitFor(() => expect(angle()).toBeLessThan(0));
    expect(angle()).toBeGreaterThan(-90);
    expect(button).toHaveAttribute('aria-checked', 'true');
    leave();
    await waitFor(() => expect(angle()).toBe(-90));
    await nextFrame();
    expect(angle()).toBe(-90);
    enter();
    await nextFrame();
    expect(angle()).toBe(-90);
    roll();
    await waitFor(() => expect(angle()).toBe(-180));
    leave();
    expect(angle()).toBe(-180);
  });

  it('no acumula vueltas al clicar muchas veces', async () => {
    const { roll, angle } = setup();
    for (let i = 0; i < 30; i++) {
      roll();
    }
    await waitFor(() => expect(angle()).toBe(-90));
    await nextFrame();
    expect(angle()).toBe(-90);
    roll();
    await waitFor(() => expect(angle()).toBe(-180));
  });

  it('asienta una cara al reducir el movimiento y recupera el gesto sin vueltas pendientes', async () => {
    const { reducedMotion, roll, angle } = setup();
    roll();
    await waitFor(() => expect(angle()).toBeLessThan(0));
    expect(angle()).toBeGreaterThan(-90);
    reducedMotion(true);
    await nextFrame();
    const resting = angle();
    expect(Number.isInteger(resting / 90)).toBe(true);
    roll();
    await nextFrame();
    expect(angle()).toBe(resting);
    reducedMotion(false);
    roll();
    await waitFor(() => expect(angle()).toBe(resting - 90));
  });

  it('ignora el hover táctil, gira con teclado y limpia el movimiento al desmontarse', async () => {
    const user = userEvent.setup();
    const { button, dice, angle, unmount } = setup();
    fireEvent.pointerEnter(button, { pointerType: 'touch' });
    await nextFrame();
    expect(angle()).toBe(0);
    act(() => button.focus());
    await user.keyboard(' ');
    await waitFor(() => expect(angle()).toBeLessThan(0));
    unmount();
    const stopped = dice.style.transform;
    await nextFrame();
    expect(dice.style.transform).toBe(stopped);
  });
});
