import { Loader2 } from 'lucide-react';
import { motion, useAnimate } from 'motion/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useToggleFollow } from '@/features/games/use-games';
import { cn } from '@/shared/lib/cn';
import { readMediaSnapshot, useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { LiveTrans } from '@/shared/components/LiveTrans';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function FollowButton({
  gameId,
  following,
}: Readonly<{ gameId: string; following: boolean }>) {
  const { t } = useTranslation('game');
  const toggle = useToggleFollow(gameId);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const [icon, animate] = useAnimate<HTMLSpanElement>();

  useEffect(() => {
    if (reducedMotion) {
      // Sustituye ambas animaciones desde su valor actual y las asienta sin movimiento.
      void animate(icon.current, { rotate: 0, scale: 1 }, { duration: 0 });
    }
  }, [reducedMotion, animate, icon]);

  function settleIcon() {
    void animate(icon.current, { rotate: 0, scale: 1 }, { duration: reducedMotion ? 0 : 0.2 });
  }

  function previewIcon() {
    if (reducedMotion || toggle.isPending) return;
    void animate(icon.current, { rotate: [null, -12, 8, 0] }, { duration: 0.32 });
  }

  function toggleFollow() {
    if (toggle.isPending) return;
    settleIcon();
    toggle.mutate(!following, {
      onSuccess: () => {
        if (readMediaSnapshot(REDUCED_MOTION)) return;
        void animate(
          icon.current,
          { scale: [null, 1.2, 1], rotate: [null, -8, 0] },
          { duration: 0.32, ease: 'easeOut' },
        );
      },
      onError: () =>
        toast.error(<LiveTrans ns="game" i18nKey="follow.error" />, { id: `follow-${gameId}` }),
    });
  }

  return (
    <span className="inline-flex w-36 shrink-0">
      <motion.button
        type="button"
        aria-pressed={following}
        aria-busy={toggle.isPending}
        aria-disabled={toggle.isPending}
        aria-label={following ? t('follow.aria.unfollow') : t('follow.aria.follow')}
        onClick={toggleFollow}
        onHoverStart={previewIcon}
        onHoverEnd={settleIcon}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) previewIcon();
        }}
        onBlur={settleIcon}
        className={cn(
          'follow-button inline-flex h-11 shrink-0 items-center rounded-full text-sm font-semibold',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          toggle.isPending && 'cursor-wait',
          following ? 'bg-surface-2 text-primary-700' : 'bg-primary text-fg-inv',
        )}
      >
        <span className="follow-symbol grid size-11 shrink-0 place-items-center" aria-hidden="true">
          <span ref={icon} className="inline-flex">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              <path className="follow-plus" d="M12 7v6m-3-3h6" />
              <path className="follow-check" d="m9 10 2 2 4-4" pathLength="1" />
            </svg>
          </span>
          <Loader2 size={20} className={toggle.isPending ? 'animate-spin' : undefined} />
        </span>
        <span className="follow-label" aria-hidden="true">
          <span>
            <span className="follow-copy grid pr-4">
              <span data-active={!following}>{t('follow.follow')}</span>
              <span data-active={following}>{t('follow.following')}</span>
            </span>
          </span>
        </span>
      </motion.button>
    </span>
  );
}
