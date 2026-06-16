import { Spinner } from '@/components/ui/spinner';
import { Meeple } from '@/shared/components/Brand';
import { gameTone } from '@/shared/lib/gameColor';

/**
 * Portada generada a partir del nombre del juego (no hay imágenes reales):
 * gradiente determinista del MISMO tono que badges y cards (gameTone),
 * inicial gigante recortada en la esquina y la ficha de la marca arriba.
 * Con "processing" muestra una ruleta en la esquina (un manual indexándose).
 */

export function GameCover({
  name,
  size = 120,
  radius,
  processing = false,
}: Readonly<{ name: string; size?: number; radius?: number; processing?: boolean }>) {
  const tone = gameTone(name);
  const badge = Math.max(16, Math.round(size * 0.3));
  return (
    <div
      aria-hidden="true"
      data-testid="game-cover"
      className="relative shrink-0 select-none overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius ?? Math.round(size * 0.18),
        background: `linear-gradient(145deg, ${tone.color} 0%, ${tone.deep} 115%)`,
        boxShadow: 'var(--m-shadow-md), inset 0 1px 0 rgba(255,255,255,.22)',
        color: '#FFF8F0',
      }}
    >
      <span
        className="absolute font-display font-extrabold leading-none opacity-[0.28]"
        style={{
          right: -size * 0.08,
          bottom: -size * 0.3,
          fontSize: size * 0.92,
          letterSpacing: '-0.04em',
        }}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="absolute opacity-90" style={{ left: size * 0.11, top: size * 0.11 }}>
        <Meeple size={size * 0.24} color="#FFF8F0" />
      </span>
      {processing ? (
        <span
          className="absolute grid place-items-center rounded-full bg-black/55 ring-2 ring-white/30"
          style={{
            right: Math.round(size * 0.07),
            bottom: Math.round(size * 0.07),
            width: badge,
            height: badge,
          }}
        >
          <Spinner size={Math.round(badge * 0.52)} className="text-white" />
        </span>
      ) : null}
    </div>
  );
}
