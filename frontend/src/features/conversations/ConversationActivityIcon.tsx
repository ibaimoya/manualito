import { MessagesSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/shared/lib/cn';

type ConversationActivityState = 'idle' | 'pending' | 'unread';
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

function activityState(hasPendingReply: boolean, unread: boolean): ConversationActivityState {
  if (hasPendingReply) return 'pending';
  if (unread) return 'unread';
  return 'idle';
}

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
  const state = activityState(hasPendingReply, unread);
  const iconSize = size === 'sm' ? 16 : 18;
  const spinnerSize = size === 'sm' ? 10 : 11;
  const pendingBadgeSize = size === 'sm' ? 'size-5' : 'size-[22px]';
  const unreadBadgeSize = size === 'sm' ? 'size-2.5' : 'size-3';

  return (
    <span
      aria-hidden={state === 'idle' ? 'true' : undefined}
      aria-label={state === 'unread' ? 'Respuesta sin leer' : undefined}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-xl',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      )}
    >
      <MessagesSquare size={iconSize} strokeWidth={size === 'sm' ? 2 : 1.9} aria-hidden="true" />
      {state === 'pending' ? (
        <output
          aria-label="Generando respuesta"
          className={cn(
            'absolute -bottom-1 -right-1 grid place-items-center rounded-full bg-black/55 ring-2 ring-card',
            pendingBadgeSize,
          )}
        >
          <Spinner size={spinnerSize} className="text-white" />
        </output>
      ) : null}
      {state === 'unread' ? (
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
