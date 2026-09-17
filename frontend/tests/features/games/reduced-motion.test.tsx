import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuggestedQuestions } from '@/features/games/SuggestedQuestions';
import { FollowButton } from '@/features/games/FollowButton';

function systemMotion() {
  // Solo se sustituye la preferencia del sistema. React, Motion y Embla son reales.
  const original = window.matchMedia;
  const media = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (matches: boolean) =>
    act(() => {
      media.matches = matches;
      media.dispatchEvent(new Event('change'));
    });
}

afterEach(() => vi.restoreAllMocks());

describe('movimiento reducido durante el montaje', () => {
  it('retira el control de reproducción del carrusel al cambiar la preferencia', () => {
    const reduce = systemMotion();
    render(<SuggestedQuestions suspended={false} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /Pausar/i })).toBeInTheDocument();
    reduce(true);
    expect(screen.queryByRole('button', { name: /Pausar|Reanudar/i })).not.toBeInTheDocument();
    expect(screen.getByRole('group')).toBeInTheDocument();
    reduce(false);
    expect(screen.getByRole('button', { name: /Pausar/i })).toBeInTheDocument();
  });

  it('asienta un gesto de seguir ya iniciado cuando se activa la reducción', async () => {
    const reduce = systemMotion();
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <FollowButton gameId="catan" following={false} />
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button');
    const icon = container.querySelector<HTMLElement>('.follow-symbol > span')!;
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    await waitFor(() => expect(icon.style.transform).toMatch(/rotate/));
    reduce(true);
    await waitFor(() => expect(icon.style.transform).toBe('none'));
    fireEvent.pointerLeave(button, { pointerType: 'mouse' });
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(icon.style.transform).toBe('none');
  });
});
