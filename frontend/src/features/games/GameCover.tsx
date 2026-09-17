import type { CSSProperties } from 'react';
import { Meeple } from '@/shared/components/Brand';
import { gameTone } from '@/shared/lib/gameColor';

/**
 * Portada generada a partir del nombre del juego (no hay imágenes reales):
 * gradiente determinista del MISMO tono que badges y cards (gameTone),
 * inicial gigante recortada en la esquina y la ficha de la marca arriba.
 * Con "processing" una línea de escaneo recorre la portada (manual indexándose).
 */

export function GameCover({
  name,
  size = 120,
  radius,
  processing = false,
}: Readonly<{ name: string; size?: number | string; radius?: number; processing?: boolean }>) {
  const tone = gameTone(name);
  return (
    <div
      aria-hidden="true"
      data-testid="game-cover"
      className="game-cover relative shrink-0 select-none overflow-hidden"
      style={
        {
          '--game-cover-size': typeof size === 'number' ? `${size}px` : size,
          width: 'var(--game-cover-size)',
          height: 'var(--game-cover-size)',
          borderRadius:
            radius ??
            (typeof size === 'number'
              ? Math.round(size * 0.18)
              : 'calc(var(--game-cover-size) * 0.18)'),
          background: `linear-gradient(145deg, ${tone.color} 0%, ${tone.deep} 115%)`,
          boxShadow: 'var(--m-shadow-md), inset 0 1px 0 rgba(255,255,255,.22)',
          color: '#FFF8F0',
        } as CSSProperties
      }
    >
      <span
        className="absolute font-display font-extrabold leading-none opacity-[0.28]"
        style={{
          right: 'calc(var(--game-cover-size) * -0.08)',
          bottom: 'calc(var(--game-cover-size) * -0.3)',
          fontSize: 'calc(var(--game-cover-size) * 0.92)',
          letterSpacing: '-0.04em',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span
        className="absolute opacity-90 [&>svg]:size-full"
        style={{
          left: 'calc(var(--game-cover-size) * 0.11)',
          top: 'calc(var(--game-cover-size) * 0.11)',
          width: 'calc(var(--game-cover-size) * 0.24)',
          height: 'calc(var(--game-cover-size) * 0.24)',
        }}
      >
        <Meeple color="#FFF8F0" />
      </span>
      {processing ? <span className="proc-coverscan" aria-hidden="true" /> : null}
    </div>
  );
}
