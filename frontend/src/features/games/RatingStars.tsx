import type { ParseKeys } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';

/** Star de Phosphor, con relleno y borde separados para indicar la valoración. */

type GameKey = ParseKeys<'game'>;

export const RATE_LABELS: ReadonlyArray<GameKey | null> = [
  null,
  'rating.labels.notForMe',
  'rating.labels.expectedMore',
  'rating.labels.likedIt',
  'rating.labels.reallyGood',
  'rating.labels.absolutelyBonkers',
];

const STAR_BODY =
  'M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z';
const STAR_EDGE =
  'M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z';

function Star({ size = 20, filled = false }: Readonly<{ size?: number; filled?: boolean }>) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" className="block">
      <path d={STAR_BODY} fill="var(--m-surface-2)" />
      <path d={STAR_EDGE} fill="var(--m-border-strong)" />
      <g opacity={filled ? 1 : 0} className="rating-star-fill">
        <path d={STAR_BODY} fill="var(--m-primary-500)" />
        <path d={STAR_EDGE} fill="var(--m-primary-600)" />
      </g>
    </svg>
  );
}

/**
 * Fila de 5 estrellas. Sin "onSelect" es solo lectura; con él, cada estrella
 * es un botón con hover/focus que previsualiza la puntuación.
 */
export function RatingStars({
  value,
  size = 22,
  onSelect,
  className,
  align = 'center',
}: Readonly<{
  value: number;
  size?: number;
  onSelect?: (score: number) => void;
  className?: string;
  /** "start": el glifo de la primera estrella se alinea al borde izquierdo. */
  align?: 'center' | 'start';
}>) {
  const { t } = useTranslation('game');
  const [hover, setHover] = useState(0);
  const [focus, setFocus] = useState(0);
  const shown = hover || focus || value;

  if (!onSelect) {
    return (
      <div
        aria-label={value > 0 ? t('rating.aria.rated', { score: value }) : t('rating.aria.unrated')}
        className={cn('inline-flex items-center gap-[3px]', className)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} filled={n <= value} />
        ))}
      </div>
    );
  }

  // Ancho contenido para que la fila quede compacta; alto ≥44px táctil.
  const hitWidth = Math.max(size + 12, 40);
  const hitHeight = Math.max(size + 10, 44);
  // Compensa el padding del área táctil para alinear el glifo con la columna.
  const startOffset = align === 'start' ? -((hitWidth - size) / 2) : 0;
  return (
    <fieldset
      aria-label={t('rating.aria.group')}
      className={cn('inline-flex items-center', className)}
      style={{ marginInlineStart: startOffset }}
      onPointerLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${t('rating.aria.star', { count: n })}, ${t(RATE_LABELS[n]!)}`}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            setHover(n);
            setFocus(0);
          }}
          onFocus={(event) => {
            if (!event.currentTarget.matches(':focus-visible')) return;
            setFocus(n);
            setHover(0);
          }}
          onBlur={() => setFocus(0)}
          onClick={() => onSelect(n)}
          className={cn(
            'rating-option grid cursor-pointer place-items-center rounded-xl',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          )}
          style={{ width: hitWidth, height: hitHeight }}
        >
          <Star size={size} filled={n <= shown} />
        </button>
      ))}
    </fieldset>
  );
}
