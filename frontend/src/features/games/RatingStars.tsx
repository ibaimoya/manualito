import { useState } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Estrellas de valoración del design system v2: geometría lucide de puntas
 * redondeadas; las llenas en ámbar con borde un punto más oscuro, las vacías
 * como hueco (relleno surface + borde) en vez de contorno fino flotando.
 */

export const RATE_LABELS = [
  '',
  'No me ha convencido',
  'Me esperaba algo más',
  'Me ha gustado',
  'Es muy bueno',
  'Es una locura',
] as const;

const STAR_PATH =
  'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

function Star({ size = 20, filled = false }: Readonly<{ size?: number; filled?: boolean }>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'var(--m-primary-500)' : 'var(--m-surface-2)'}
      stroke={filled ? 'var(--m-primary-600)' : 'var(--m-border-strong)'}
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      className="block"
      style={{ filter: filled ? 'drop-shadow(0 1px 1px rgba(53,28,12,.18))' : 'none' }}
    >
      <path d={STAR_PATH} />
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
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  if (!onSelect) {
    return (
      <div
        aria-label={value > 0 ? `Valoración: ${value} de 5` : 'Sin valorar'}
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
      aria-label="Puntúa este juego"
      className={cn('inline-flex items-center', className)}
      style={{ marginInlineStart: startOffset }}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'} — ${RATE_LABELS[n]}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onSelect(n)}
          className={cn(
            'grid cursor-pointer place-items-center rounded-xl transition-transform duration-150 ease-[var(--ease-mn)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            hover === n && 'scale-[1.18]',
          )}
          style={{ width: hitWidth, height: hitHeight }}
        >
          <Star size={size} filled={n <= shown} />
        </button>
      ))}
    </fieldset>
  );
}
