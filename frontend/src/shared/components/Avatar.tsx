import { type CSSProperties } from 'react';
import {
  BookOpen,
  Crown,
  Dices,
  Flag,
  Ghost,
  Hourglass,
  Lightbulb,
  Puzzle,
  Rocket,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import type { AvatarColor, AvatarFigure } from '@/shared/api/auth';
import { Meeple } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';

/** Inicial a partir de un nombre o email (una sola letra). */
function avatarInitials(name: string): string {
  const base = name.includes('@') ? name.slice(0, name.indexOf('@')) : name;
  return base.trim().charAt(0).toUpperCase() || '?';
}

const COLOR_CLASS: Record<AvatarColor, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  contrast: 'bg-primary-700',
  success: 'bg-success',
  warning: 'bg-warning',
};

/** Glifo del avatar para figuras distintas de las iniciales. */
export function AvatarGlyph({
  figure,
  size,
}: Readonly<{ figure: Exclude<AvatarFigure, 'initials'>; size: number }>) {
  const iconSize = Math.round(size * 0.48);
  // currentColor: crema dentro del avatar y tinta del botón en el selector.
  if (figure === 'meeple') return <Meeple size={Math.round(size * 0.52)} color="currentColor" />;
  const Icon = {
    dice: Dices,
    crown: Crown,
    flag: Flag,
    sparkle: Sparkles,
    book: BookOpen,
    bulb: Lightbulb,
    zap: Zap,
    hourglass: Hourglass,
    trophy: Trophy,
    puzzle: Puzzle,
    swords: Swords,
    ghost: Ghost,
    shield: Shield,
    rocket: Rocket,
  }[figure];
  return <Icon size={iconSize} strokeWidth={1.75} aria-hidden="true" />;
}

/**
 * Avatar circular del usuario: iniciales o figura elegida sobre color sólido
 * y texto crema fijo (legible en claro y oscuro). Es la pieza de cuenta
 * compartida por la barra superior, la sidebar, Ajustes y el Perfil.
 */
export function Avatar({
  name,
  size = 40,
  tone = 'accent',
  color,
  figure,
  ring = false,
  className,
}: Readonly<{
  name: string;
  size?: number;
  tone?: 'accent' | 'primary';
  /** Color elegido en el perfil; si falta, cae al `tone` clásico. */
  color?: AvatarColor | null;
  /** Figura elegida en el perfil; `initials`/`null` muestran las iniciales. */
  figure?: AvatarFigure | null;
  ring?: boolean;
  className?: string;
}>) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.38),
    // line-height 1: la caja de línea no añade leading asimétrico al centrar.
    lineHeight: 1,
    letterSpacing: '-0.01em',
    color: '#FFF8F0',
  };
  if (ring) style.boxShadow = '0 0 0 3px var(--m-bg), 0 0 0 5px var(--m-primary-300)';
  const toneClass = tone === 'accent' ? 'bg-accent' : 'bg-primary';
  const colorClass = color ? COLOR_CLASS[color] : toneClass;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-display font-bold',
        colorClass,
        className,
      )}
      style={style}
    >
      {figure && figure !== 'initials' ? (
        <AvatarGlyph figure={figure} size={size} />
      ) : (
        avatarInitials(name)
      )}
    </span>
  );
}
