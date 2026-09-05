import { Icon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { cn } from '@/shared/lib/cn';

const BUBBLES = [
  {
    path: 'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
    peek: 'translate(-1px, -2px) scale(1.16)',
  },
  {
    path: 'M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1',
    peek: 'translate(1px, -2px) scale(1.16)',
  },
];
const REST = 'translate(0px, 0px) scale(1)';

type ConversationActivitySize = 'sm' | 'md';
type ConversationActivityTone = 'primary' | 'accent';

const SIZE_CLASS: Record<ConversationActivitySize, string> = {
  sm: 'size-9',
  md: 'size-10',
};

const TONE_CLASS: Record<ConversationActivityTone, string> = {
  primary: 'bg-primary-100 text-primary-700',
  accent: 'bg-accent-100 text-accent',
};

/** Color del halo que late bajo el glifo mientras se responde, según el tono. */
const TONE_HALO: Record<ConversationActivityTone, string> = {
  primary: 'rgba(246, 149, 59, 0.20)',
  accent: 'rgba(124, 192, 232, 0.20)',
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
  const iconSize = size === 'sm' ? 16 : 18;
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
        TONE_CLASS[tone],
        hasPendingReply && 'proc-glyph-pulse',
        className,
      )}
    >
      <Icon
        iconNode={[]}
        size={iconSize}
        strokeWidth={size === 'sm' ? 2 : 1.9}
        aria-hidden="true"
        className="overflow-visible"
      >
        {BUBBLES.map((bubble, index) => (
          <motion.path
            key={bubble.path}
            d={bubble.path}
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
      </Icon>
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
