import { type CSSProperties } from 'react';
import { cn } from '../lib/cn';

/**
 * Silueta del meeple (token de juego de mesa).  Pieza icónica de la marca.
 * Sin texto, sin color hardcoded — recibe `color` como prop.
 */
export function Meeple({
  size = 32,
  color = 'currentColor',
  className,
}: Readonly<{
  size?: number;
  color?: string;
  className?: string;
}>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 4c2.8 0 5 2.2 5 5 0 1.6-.7 3-1.9 4 .1.1 5.4 3 5.4 8.5V25c0 1.7-1.3 3-3 3h-3c-.6 0-1-.4-1-1l-.5-4c0-.3-.2-.5-.5-.5h-1c-.3 0-.5.2-.5.5L14.5 27c0 .6-.4 1-1 1h-3c-1.7 0-3-1.3-3-3v-3.5c0-5.5 5.3-8.4 5.4-8.5C11.7 12 11 10.6 11 9c0-2.8 2.2-5 5-5z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Monograma de la marca — cuadrado redondeado ámbar con meeple dentro.
 * Escalable: 24 (favicon) · 36 (nav) · 56 (app icon) · 140 (hero).
 */
export function Monogram({
  size = 48,
  radius,
  bg = 'var(--m-primary-500)',
  fg = '#FFF8F0',
  className,
  style,
}: Readonly<{
  size?: number;
  radius?: number;
  bg?: string;
  fg?: string;
  className?: string;
  style?: CSSProperties;
}>) {
  const effectiveRadius = radius ?? Math.round(size * 0.25);
  return (
    <div
      role="img"
      aria-label="Manualito"
      className={cn('inline-grid place-items-center', className)}
      style={{
        width: size,
        height: size,
        borderRadius: effectiveRadius,
        background: bg,
        color: fg,
        boxShadow: 'var(--m-shadow-sm), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        ...style,
      }}
    >
      <Meeple size={Math.round(size * 0.62)} color={fg} />
    </div>
  );
}

/**
 * Wordmark — el nombre escrito en Manrope ExtraBold con punto final ámbar.
 */
export function Wordmark({
  size = 28,
  color = 'var(--m-text)',
  className,
}: Readonly<{
  size?: number;
  color?: string;
  className?: string;
}>) {
  return (
    <span
      className={cn('inline-flex items-baseline gap-px font-display', className)}
      style={{
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '-0.03em',
        color,
        lineHeight: 1,
      }}
    >
      <span>Manualito</span>
      <span
        aria-hidden="true"
        style={{
          color: 'var(--m-primary-500)',
          fontSize: size * 0.5,
          marginLeft: 1,
          transform: 'translateY(-0.15em)',
          display: 'inline-block',
        }}
      >
        .
      </span>
    </span>
  );
}

/**
 * Lockup horizontal — monograma + wordmark + tagline opcional.
 * `scale` es un multiplicador unitario (1 = base).
 */
export function LockUp({
  scale = 1,
  withTagline = true,
  className,
}: Readonly<{
  scale?: number;
  withTagline?: boolean;
  className?: string;
}>) {
  return (
    <div className={cn('inline-flex items-center', className)} style={{ gap: 12 * scale }}>
      <Monogram size={48 * scale} radius={12 * scale} />
      <div className="flex flex-col" style={{ gap: 2 * scale }}>
        <Wordmark size={26 * scale} />
        {withTagline ? (
          <span
            className="mono"
            style={{
              fontSize: 10.5 * scale,
              color: 'var(--m-text-3)',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Manuales · sin barreras
          </span>
        ) : null}
      </div>
    </div>
  );
}
