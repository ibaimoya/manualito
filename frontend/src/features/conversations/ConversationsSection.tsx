import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, PlusIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LiveTrans } from '@/shared/components/LiveTrans';
import { TrashIcon } from '@/shared/components/action-icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/relativeDate';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { AnsweringLine, ConversationActivityIcon } from './ConversationActivityIcon';
import {
  conversationsKey,
  conversationsQueryOptions,
  useConversationsRead,
} from './use-conversations';
import './conversation-list.css';

const MAX_ROWS = 8;

/**
 * Conversaciones pasadas del juego, en la pantalla de resultado: retomar
 * una donde se quedó o empezar otra desde cero.
 */
export function ConversationsSection({
  gameId,
  canAsk,
  showViewAll = false,
}: Readonly<{ gameId: string; canAsk: boolean; showViewAll?: boolean }>) {
  const { t } = useTranslation('conversations');
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery(conversationsQueryOptions(gameId));
  const { isUnread } = useConversationsRead();
  const del = useMutation({
    mutationFn: (conversationId: string) => conversationsApi.remove(conversationId),
    onError: () =>
      toast.error(<LiveTrans ns="conversations" i18nKey="toast.deleteError" />, {
        id: 'conversation-delete',
        description: <LiveTrans ns="conversations" i18nKey="toast.retry" />,
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  // Sin backend, la sección simplemente no aparece.
  if (isError && data === undefined) return null;

  const conversations = data ?? [];

  return (
    <section aria-labelledby="result-conversations" className="pt-1">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2
          id="result-conversations"
          className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700"
        >
          {t('section.heading')}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {showViewAll && conversations.length > 0 ? (
            <Link
              to="/conversations/$gameId"
              params={{ gameId }}
              className="icon-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {t('section.viewAll', { count: conversations.length })}
              <ArrowRightIcon data-icon-motion="forward" size={16} aria-hidden="true" />
            </Link>
          ) : null}
          {canAsk ? (
            <Link
              to="/chat/$gameId"
              params={{ gameId }}
              search={{}}
              className="icon-feedback inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <PlusIcon data-icon-motion="plus" size={16} aria-hidden="true" />
              {t('section.new')}
            </Link>
          ) : null}
        </div>
      </div>

      <SkeletonSwap pending={isPending} skeleton={<RowsSkeleton />}>
        {conversations.length === 0 ? (
          <EmptyRows />
        ) : (
          <div className="conversation-list">
            {conversations.slice(0, MAX_ROWS).map((c) => (
              <ConversationRow
                key={c.id}
                gameId={gameId}
                conversation={c}
                unread={isUnread(c)}
                deleting={del.isPending && del.variables === c.id}
                onDelete={() => del.mutate(c.id)}
              />
            ))}
          </div>
        )}
      </SkeletonSwap>
    </section>
  );
}

function ConversationRow({
  gameId,
  conversation,
  unread,
  deleting,
  onDelete,
}: Readonly<{
  gameId: string;
  conversation: ConversationSummary;
  unread: boolean;
  deleting: boolean;
  onDelete: () => void;
}>) {
  const { t } = useTranslation('conversations');
  const [confirming, setConfirming] = useState(false);
  const title = conversation.title ?? t('fallback.conversationTitle');
  const pending = conversation.has_pending_reply;
  const hoverMotion = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  );

  return (
    <motion.div
      initial={false}
      animate="rest"
      whileHover={hoverMotion ? 'chat' : 'rest'}
      className={cn('conversation-row', deleting && 'opacity-50')}
    >
      <div className="relative z-[1] flex items-stretch gap-1 pr-2.5">
        <Link
          to="/chat/$gameId"
          params={{ gameId }}
          search={{ c: conversation.id }}
          className="flex min-w-0 flex-1 items-center gap-3 p-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <ConversationActivityIcon hasPendingReply={pending} unread={unread} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-fg">{title}</span>
            {pending ? (
              <span className="mt-0.5 block">
                <AnsweringLine />
              </span>
            ) : (
              <span className="block text-xs text-fg-3">
                {formatRelative(conversation.updated_at)}
              </span>
            )}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="icon-feedback grid size-11 shrink-0 self-center place-items-center rounded-lg text-fg-3 transition-colors hover:text-error"
          aria-label={t('aria.deleteConversation', { title })}
        >
          <TrashIcon size={15} />
        </button>
      </div>
      {confirming ? (
        <div className="feedback-fade relative z-[1] flex items-center gap-2 border-t border-border bg-error-bg p-3">
          <span className="mr-auto text-sm text-error">{t('section.confirmDelete')}</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            {t('actions.delete')}
          </Button>
        </div>
      ) : null}
      {pending ? <span className="proc-border" aria-hidden="true" /> : null}
    </motion.div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-hidden="true" className="conversation-list">
      {[0, 1].map((i) => (
        <div key={i} className="h-16 animate-pulse bg-surface-2" />
      ))}
    </div>
  );
}

function EmptyRows() {
  const { t } = useTranslation('conversations');

  return (
    <Card className="bg-surface/60 p-4">
      <p className="text-sm text-fg-2">{t('empty.sectionDescription')}</p>
    </Card>
  );
}
