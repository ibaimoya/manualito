import { type CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';
import styles from './flags.module.css';

/* El inglés lleva la híbrida USA+UK, un idioma sin país único */

type FlagProps = Readonly<{
  width?: number;
  height?: number;
  radius?: number;
  className?: string;
}>;

const SPAIN_SVG = (
  <svg viewBox="0 0 24 18" preserveAspectRatio="none">
    <rect width="24" height="18" fill="#FFC400" />
    <rect width="24" height="4.5" fill="#CE2939" />
    <rect y="13.5" width="24" height="4.5" fill="#CE2939" />
  </svg>
);

const USA_SVG = (
  <svg viewBox="0 0 24 18" preserveAspectRatio="none">
    <rect width="24" height="18" fill="#FFFFFF" />
    <path d="M0 1.5h24M0 7.5h24M0 13.5h24" stroke="#D8102E" strokeWidth="3" />
    <rect width="11" height="9" fill="#25478F" />
    <circle cx="2.8" cy="2.6" r="0.8" fill="#FFF" />
    <circle cx="5.6" cy="2.6" r="0.8" fill="#FFF" />
    <circle cx="8.4" cy="2.6" r="0.8" fill="#FFF" />
    <circle cx="4.2" cy="4.8" r="0.8" fill="#FFF" />
    <circle cx="7" cy="4.8" r="0.8" fill="#FFF" />
    <circle cx="2.8" cy="7" r="0.8" fill="#FFF" />
    <circle cx="5.6" cy="7" r="0.8" fill="#FFF" />
    <circle cx="8.4" cy="7" r="0.8" fill="#FFF" />
  </svg>
);

const UK_PATHS = (
  <>
    <rect width="24" height="18" fill="#25478F" />
    <path d="M0 0 24 18M24 0 0 18" stroke="#FFF8F0" strokeWidth="3.6" />
    <path d="M0 0 24 18M24 0 0 18" stroke="#D8102E" strokeWidth="1.4" />
    <path d="M12 0v18M0 9h24" stroke="#FFF8F0" strokeWidth="6" />
    <path d="M12 0v18M0 9h24" stroke="#D8102E" strokeWidth="3.4" />
  </>
);

export function SpainFlag({ width = 22, height = 16, radius = 4.5, className }: FlagProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(styles.frame, className)}
      style={{ width, height, borderRadius: radius }}
    >
      {SPAIN_SVG}
    </span>
  );
}

export function EnglishFlag({ width = 22, height = 16, radius = 4.5, className }: FlagProps) {
  const angle = (-Math.atan2(height, width) * 180) / Math.PI;
  const mixVars = {
    '--flag-h': `${height}px`,
    '--flag-angle': `${angle.toFixed(1)}deg`,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      className={cn(styles.frame, className)}
      style={{ width, height, borderRadius: radius }}
    >
      <span data-flag-mix="" className={styles.mix} style={mixVars}>
        {USA_SVG}
        <svg className={styles.top} viewBox="0 0 24 18" preserveAspectRatio="none">
          {UK_PATHS}
        </svg>
        <span className={styles.seam} />
      </span>
    </span>
  );
}
