import { BookmarkCheck, BookmarkPlus, Loader2 } from 'lucide-react';
import { useToggleFollow } from '@/features/games/use-games';
import { cn } from '@/shared/lib/cn';

/**
 * Seguir / dejar de seguir un juego. Seguido se muestra como "Siguiendo" con un
 * tinte de error al hover (señal de que vas a dejar de seguir); sin seguir es el
 * CTA primario "Seguir". Width estable: el icono se sustituye por un spinner.
 */
export function FollowButton({
  gameId,
  following,
}: Readonly<{ gameId: string; following: boolean }>) {
  const toggle = useToggleFollow(gameId);
  const pending = toggle.isPending;

  return (
    <button
      type="button"
      aria-pressed={following}
      aria-busy={pending}
      aria-label={following ? 'Dejar de seguir este juego' : 'Seguir este juego'}
      disabled={pending}
      onClick={() => toggle.mutate(!following)}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-70',
        following
          ? 'border border-border bg-surface-2 text-fg hover:border-error/40 hover:bg-error-bg hover:text-error'
          : 'bg-primary text-fg-inv hover:bg-primary-700',
      )}
    >
      <FollowIcon pending={pending} following={following} />
      {following ? 'Siguiendo' : 'Seguir'}
    </button>
  );
}

function FollowIcon({ pending, following }: Readonly<{ pending: boolean; following: boolean }>) {
  if (pending) {
    return <Loader2 size={15} strokeWidth={2.5} className="animate-spin" aria-hidden="true" />;
  }
  if (following) {
    return <BookmarkCheck size={15} strokeWidth={2.5} aria-hidden="true" />;
  }
  return <BookmarkPlus size={15} strokeWidth={2.5} aria-hidden="true" />;
}
