import useEmblaCarousel from 'embla-carousel-react';
import AutoScroll from 'embla-carousel-auto-scroll';
import { CaretLeftIcon, CaretRightIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const QUESTIONS = [
  'questions.firstPlayer',
  'questions.preparation',
  'questions.passTurn',
  'questions.victory',
  'questions.tie',
  'questions.players',
  'questions.ends',
  'questions.turn',
  'questions.duration',
  'questions.materials',
  'questions.scoring',
  'questions.teams',
  'questions.blocked',
  'questions.example',
] as const;

const CONTROL_CLASS =
  'icon-feedback size-11 shrink-0 items-center justify-center rounded-full text-fg-3 enabled:hover:text-fg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:pointer-events-none';

type Props = Readonly<{
  onSelect: (question: string) => void;
  suspended: boolean;
}>;

export function SuggestedQuestions({ onSelect, suspended }: Props) {
  const { t } = useTranslation('game');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [navigation, setNavigation] = useState({ previous: false, next: false, loop: false });
  const [autoScroll] = useState(() =>
    AutoScroll({ speed: 0.45, startDelay: 200, playOnInit: false, stopOnFocusIn: false }),
  );
  const [viewportRef, carousel] = useEmblaCarousel({ loop: true, dragFree: true, align: 'start' }, [
    autoScroll,
  ]);

  useEffect(() => {
    if (!carousel) return;
    function syncNavigation() {
      if (!carousel) return;
      setNavigation({
        previous: carousel.canScrollPrev(),
        next: carousel.canScrollNext(),
        // Embla desactiva el bucle si no hay contenido suficiente.
        loop: carousel.internalEngine().options.loop,
      });
    }
    syncNavigation();
    carousel.on('reInit', syncNavigation).on('select', syncNavigation);
    return () => {
      carousel.off('reInit', syncNavigation).off('select', syncNavigation);
    };
  }, [carousel]);

  useEffect(() => {
    if (!carousel) return;
    function syncPlayback() {
      if (
        !carousel?.internalEngine().options.loop ||
        paused ||
        hovered ||
        suspended ||
        reducedMotion
      )
        autoScroll.stop();
      else autoScroll.play();
    }
    syncPlayback();
    carousel.on('reInit', syncPlayback);
    return () => {
      carousel.off('reInit', syncPlayback);
      autoScroll.stop();
    };
  }, [carousel, autoScroll, paused, hovered, suspended, reducedMotion]);

  function step(direction: 'previous' | 'next') {
    autoScroll.stop();
    setPaused(true);
    if (direction === 'previous') carousel?.scrollPrev(Boolean(reducedMotion));
    else carousel?.scrollNext(Boolean(reducedMotion));
  }

  return (
    <div
      role="group"
      aria-roledescription={t('composer.aria.carousel')}
      aria-label={t('composer.aria.suggestedQuestions')}
      className="flex items-center gap-1 pb-1"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) setPaused(true);
      }}
    >
      <div
        className={`order-2 shrink-0 items-center ${navigation.previous || navigation.next ? 'flex' : 'hidden'}`}
      >
        {navigation.loop && !reducedMotion && (
          <button
            type="button"
            className={`${CONTROL_CLASS} inline-flex`}
            aria-label={t(paused ? 'composer.aria.resume' : 'composer.aria.pause')}
            onClick={() => setPaused((value) => !value)}
          >
            <span className="state-icon" data-active={paused} aria-hidden="true">
              <PauseIcon size={15} />
              <PlayIcon size={15} />
            </span>
          </button>
        )}
        <button
          type="button"
          className={`${CONTROL_CLASS} hidden sm:inline-flex`}
          disabled={!navigation.previous}
          aria-label={t('composer.aria.previous')}
          onClick={() => step('previous')}
        >
          <CaretLeftIcon data-icon-motion="back" size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${CONTROL_CLASS} hidden sm:inline-flex`}
          disabled={!navigation.next}
          aria-label={t('composer.aria.next')}
          onClick={() => step('next')}
        >
          <CaretRightIcon data-icon-motion="forward" size={18} aria-hidden="true" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8px,black_calc(100%-8px),transparent)]"
        onPointerDown={() => setPaused(true)}
      >
        <div className="flex touch-pan-y items-center py-1">
          {QUESTIONS.map((key) => (
            <div key={key} className="shrink-0 pr-2">
              <button
                type="button"
                onClick={() => onSelect(t(key))}
                className="h-9 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-xs font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-accent"
              >
                {t(key)}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
