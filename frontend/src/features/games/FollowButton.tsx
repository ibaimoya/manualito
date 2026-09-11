import { CircleNotchIcon } from '@phosphor-icons/react';
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
            <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
              <path d="M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Zm0,177.57-51.77-32.35a8,8,0,0,0-8.48,0L72,209.57V48H184Z" />
              <g
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path className="follow-plus" d="M128,74.67v64M96,106.67h64" />
                <path
                  className="follow-check"
                  d="M94.93,105.6l22.4,22.4l51.2,-51.2"
                  pathLength="1"
                />
              </g>
            </svg>
          </span>
          <CircleNotchIcon size={20} className={toggle.isPending ? 'animate-spin' : undefined} />
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
