import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Avatar } from '@/shared/components/Avatar';

function systemPreferences() {
  // Solo sustituimos la preferencia del sistema que jsdom no implementa.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (reduced: boolean) =>
    act(() => {
      media.matches = reduced;
      media.dispatchEvent(new Event('change'));
    });
}

function nextFrame() {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

afterEach(() => vi.restoreAllMocks());

it('cancela el cambio de figura al reducir movimiento y no lo reproduce al restaurarlo', async () => {
  const setReducedMotion = systemPreferences();
  const { container, rerender } = render(<Avatar name="Ibai" figure="initials" />, {
    wrapper: StrictMode,
  });
  const outgoing = screen.getByText('I');
  expect(outgoing).toHaveStyle({ opacity: '1' });

  rerender(<Avatar name="Ibai" figure="crown" />);
  await waitFor(() => {
    const opacity = Number(getComputedStyle(outgoing).opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });
  expect(container.querySelector('svg')).toBeInTheDocument();

  setReducedMotion(true);
  expect(outgoing).not.toBeInTheDocument();
  expect(screen.queryByText('I')).not.toBeInTheDocument();
  expect(container.querySelector('svg')).toBeVisible();

  setReducedMotion(false);
  const restored = container.querySelector('svg');
  expect(restored).toBeVisible();
  expect(restored?.parentElement).toHaveStyle({ opacity: '1' });
  await nextFrame();
  await nextFrame();
  expect(restored?.parentElement).toHaveStyle({ opacity: '1' });
  expect(screen.queryByText('I')).not.toBeInTheDocument();
});
