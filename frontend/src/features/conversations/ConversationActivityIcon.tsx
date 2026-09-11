import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { ILLUSTRATION_TONE_CLASS } from '@/shared/components/IllustrationBadge';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';

// Los dos bocadillos de Chats (Phosphor regular) como figuras independientes: el
// delantero completo y el trasero sólo en la parte que asoma. Desplazamientos en
// unidades del viewBox 256.
const BUBBLES = [
  {
    path: 'M40,32H168a16,16,0,0,1,16,16V136a16,16,0,0,1-16,16H71.58a8,8,0,0,0-5,1.78L37,182.22A8,8,0,0,1,24,176V48A16,16,0,0,1,40,32ZM40,48V159.25l26.55-21.47a8,8,0,0,1,5-1.78H168V48Z',
    peek: 'translate(-10.7px, -21.3px) scale(1.16)',
  },
  {
    path: 'M184,80h32a16,16,0,0,1,16,16V224a8,8,0,0,1-8,8,8,8,0,0,1-5-1.78L181.59,200H88a16,16,0,0,1-16-16V152h16v32h93.59a8,8,0,0,1,5,1.78L216,207.25V96H184Z',
    peek: 'translate(10.7px, -21.3px) scale(1.16)',
  },
];
const REST = 'translate(0px, 0px) scale(1)';

type ConversationActivitySize = 'sm' | 'md';
type ConversationActivityTone = 'primary' | 'accent';

const SIZE_CLASS: Record<ConversationActivitySize, string> = {
  sm: 'size-9',
  md: 'size-10',
};

/** Color del halo que late bajo el glifo mientras se responde, según el tono. */
const TONE_HALO: Record<ConversationActivityTone, string> = {
  primary: 'color-mix(in srgb, var(--m-primary-700) 20%, transparent)',
  accent: 'color-mix(in srgb, var(--m-accent-500) 20%, transparent)',
};

/**
 * Glifo de la conversación. Mientras se responde late con un halo (sin ruleta:
 * el cometa del borde y el texto de la fila ya cuentan que está en curso); con
 * respuesta sin leer muestra un punto. "unread" y "hasPendingReply" se excluyen.
 */
export function ConversationActivityIcon({
  hasPendingReply,
  unread,
  size = 'sm',
  tone = 'primary',
  className,
}: Readonly<{
  hasPendingReply: boolean;
  unread: boolean;
  size?: ConversationActivitySize;
  tone?: ConversationActivityTone;
  className?: string;
}>) {
  const { t } = useTranslation('conversations');
  const hoverMotion = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );
  const iconSize = size === 'sm' ? 18 : 20;
  const unreadBadgeSize = size === 'sm' ? 'size-2.5' : 'size-3';

  // Respondiendo: el texto de la fila ya lo anuncia, así que el glifo es decorativo.
  return (
    <span
      aria-hidden={unread ? undefined : 'true'}
      aria-label={unread ? t('aria.unreadReply') : undefined}
      style={hasPendingReply ? { '--proc-halo': TONE_HALO[tone] } : undefined}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-xl',
        SIZE_CLASS[size],
        ILLUSTRATION_TONE_CLASS[tone],
        hasPendingReply && 'proc-glyph-pulse',
        className,
      )}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 256 256"
        fill="currentColor"
        aria-hidden="true"
        className="overflow-visible"
      >
        {BUBBLES.map((bubble, index) => (
          <motion.path
            key={bubble.path}
            d={bubble.path}
            fillRule="evenodd"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            variants={{
              rest: { transform: REST, transition: { duration: hoverMotion ? 0.12 : 0 } },
              chat: {
                transform: [null, bubble.peek, REST],
                transition: { duration: 0.32, delay: index * 0.14, ease: 'easeInOut' },
              },
            }}
          />
        ))}
      </svg>
      {unread && !hasPendingReply ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-0.5 -top-0.5 rounded-full bg-primary ring-2 ring-card',
            unreadBadgeSize,
          )}
        />
      ) : null}
    </span>
  );
}

/**
 * «Manualito está respondiendo» con sus puntitos. Reemplaza la fecha en la fila
 * mientras se genera la respuesta; compartida por la banda del hub y la lista.
 */
export function AnsweringLine() {
  const { t } = useTranslation('conversations');

  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-700">
      <span>{t('status.answering')}</span>
      <span className="proc-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="proc-tinydot" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
    </span>
  );
}
