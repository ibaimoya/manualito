import { useEffect, useId, useRef, type ReactNode } from 'react';
import { motion, useAnimate } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

const settled = 'translateY(0%) rotate(0deg)';
const wave = [
  null,
  'translateY(0%) rotate(20deg)',
  'translateY(0%) rotate(-12deg)',
  'translateY(0%) rotate(14deg)',
  settled,
];

export function HomeGreeting({ firstName }: Readonly<{ firstName?: string }>) {
  const { t } = useTranslation('home');
  const hintId = useId();

  return (
    <>
      <h1
        id="home-hello"
        className="break-words font-display text-3xl font-bold leading-tight tracking-tight text-fg md:text-4xl"
      >
        {firstName ? (
          <Trans
            t={t}
            i18nKey="greeting.named"
            values={{ firstName }}
            components={{ player: <GreetingPlayer hintId={hintId} /> }}
          />
        ) : (
          <GreetingPlayer hintId={hintId}>{t('greeting.anonymous')}</GreetingPlayer>
        )}
        <br />
        {t('greeting.question')}
      </h1>
      <span id={hintId} className="sr-only">
        {t('greeting.wave')}
      </span>
    </>
  );
}

function GreetingPlayer({ children, hintId }: Readonly<{ children?: ReactNode; hintId: string }>) {
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const playback = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      void animate(
        '.greeting-name, .greeting-hand',
        { transform: settled, opacity: 1 },
        { duration: 0 },
      );
      return;
    }
    playback.current = animate(
      [
        [
          '.greeting-name',
          { transform: settled, opacity: 1 },
          { type: 'spring', duration: 0.5, bounce: 0.3 },
        ],
        ['.greeting-hand', { transform: settled, opacity: 1 }, { duration: 0.18, at: 0.3 }],
        ['.greeting-hand', { transform: wave }, { duration: 0.6, at: 0.42, ease: 'easeInOut' }],
      ],
      { delay: 0.3 },
    );
    return () => playback.current?.stop();
  }, [animate, reducedMotion]);

  function sayHello() {
    playback.current?.stop();
    if (reducedMotion) return;
    playback.current = animate([
      [
        '.greeting-name',
        { transform: settled, opacity: 1 },
        { type: 'spring', duration: 0.5, bounce: 0.3 },
      ],
      [
        '.greeting-hand',
        { transform: wave, opacity: 1 },
        { at: 0, duration: 0.6, ease: 'easeInOut' },
      ],
    ]);
  }

  return (
    <button
      ref={scope}
      type="button"
      onClick={sayHello}
      aria-describedby={hintId}
      className="hit-area inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg align-baseline text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
    >
      <motion.span
        className="greeting-name min-w-0 [overflow-wrap:anywhere]"
        initial={
          reducedMotion ? false : { transform: 'translateY(-0.8em) rotate(-3deg)', opacity: 0 }
        }
      >
        {children}
      </motion.span>
      <motion.span
        className="greeting-hand inline-block shrink-0 origin-[70%_80%] text-[0.85em] leading-none"
        initial={
          reducedMotion ? false : { transform: 'translateY(35%) rotate(-20deg)', opacity: 0 }
        }
        aria-hidden="true"
      >
        👋
      </motion.span>
    </button>
  );
}
