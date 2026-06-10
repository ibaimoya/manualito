import { type CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';

/** Iniciales a partir de un nombre o email (1–2 letras). */
function avatarInitials(name: string): string {
  const base = name.includes('@') ? name.slice(0, name.indexOf('@')) : name;
  const parts = base.trim().split(/[\s._-]+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Avatar circular con iniciales. Fondo sólido (acento o primario) y texto
 * crema fijo (legible en claro y oscuro). Es la pieza de cuenta compartida
 * por la barra superior, la sidebar y Ajustes.
 */
export function Avatar({
  name,
  size = 40,
  tone = 'accent',
  ring = false,
  className,
}: Readonly<{
  name: string;
  size?: number;
  tone?: 'accent' | 'primary';
  ring?: boolean;
  className?: string;
}>) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    letterSpacing: '-0.01em',
    color: '#FFF8F0',
  };
  if (ring) style.boxShadow = '0 0 0 3px var(--m-bg), 0 0 0 5px var(--m-primary-300)';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-display font-bold',
        tone === 'accent' ? 'bg-accent' : 'bg-primary',
        className,
      )}
      style={style}
    >
      {avatarInitials(name)}
    </span>
  );
}
