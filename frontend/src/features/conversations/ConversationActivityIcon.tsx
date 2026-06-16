import { MessagesSquare } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

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
  const iconSize = size === 'sm' ? 16 : 18;
  const unreadBadgeSize = size === 'sm' ? 'size-2.5' : 'size-3';

  // Respondiendo: el texto de la fila ya lo anuncia, así que el glifo es decorativo.
  return (
    <span
      aria-hidden={unread ? undefined : 'true'}
      aria-label={unread ? 'Respuesta sin leer' : undefined}
      style={hasPendingReply ? { '--proc-halo': TONE_HALO[tone] } : undefined}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-xl',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        hasPendingReply && 'proc-glyph-pulse',
        className,
      )}
    >
      <MessagesSquare size={iconSize} strokeWidth={size === 'sm' ? 2 : 1.9} aria-hidden="true" />
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
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold text-primary-700">
      <span>Manualito está respondiendo</span>
      <span className="proc-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="proc-tinydot" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
    </span>
  );
}
