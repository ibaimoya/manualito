import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { cn } from '@/shared/lib/cn';
import { formatRelative } from '@/shared/lib/relativeDate';
import { AnsweringLine, ConversationActivityIcon } from './ConversationActivityIcon';
import {
  conversationsKey,
  conversationsQueryOptions,
  useConversationsRead,
} from './use-conversations';

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
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery(conversationsQueryOptions(gameId));
  const { isUnread } = useConversationsRead();
  const del = useMutation({
    mutationFn: (conversationId: string) => conversationsApi.remove(conversationId),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  // Sin backend, la sección simplemente no aparece.
  if (isError) return null;

  const conversations = data ?? [];

  return (
    <section aria-labelledby="result-conversations" className="pt-1">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2
          id="result-conversations"
          className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700"
        >
          Tus conversaciones
        </h2>
        <div className="flex items-center gap-2">
          {showViewAll && conversations.length > 0 ? (
            <Link
              to="/conversations/$gameId"
              params={{ gameId }}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:text-fg"
            >
              Ver todas ({conversations.length})
            </Link>
          ) : null}
          {canAsk ? (
            <Link
              to="/chat/$gameId"
              params={{ gameId }}
              search={{}}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              <Plus size={13} strokeWidth={2.25} aria-hidden="true" />
              Nueva
            </Link>
          ) : null}
        </div>
      </div>

      {isPending ? <RowsSkeleton /> : null}
      {!isPending && conversations.length === 0 ? <EmptyRows /> : null}
      {conversations.length > 0 ? (
        <div className="flex flex-col gap-2">
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
      ) : null}
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
  const [confirming, setConfirming] = useState(false);
  const title = conversation.title ?? 'Conversación sin título';
  const pending = conversation.has_pending_reply;

  return (
    // Caja redondeada propia: respondiendo, el borde transparente deja sitio al
    // cometa (su radio se deriva en CSS de --radius-2xl, el mismo token que usa
    // rounded-2xl aquí). El bg redondea sin overflow-hidden para no recortar
    // el cometa, que sobresale 1px.
    <div
      className={cn(
        'relative rounded-2xl border bg-card shadow-xs transition-colors',
        pending ? 'border-transparent' : 'border-border hover:bg-surface-2',
        deleting && 'opacity-50',
      )}
    >
      <div className="relative z-[1] flex items-stretch gap-1 pr-2.5">
        <Link
          to="/chat/$gameId"
          params={{ gameId }}
          search={{ c: conversation.id }}
          className="flex min-w-0 flex-1 items-center gap-3 p-3.5"
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
        {/* Misma papelera compacta que la biblioteca: 30 px, rounded-lg, tinte al hover. */}
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="grid size-[30px] shrink-0 self-center place-items-center rounded-lg text-fg-3 transition-colors hover:bg-error-bg hover:text-error"
          aria-label={`Borrar conversación ${title}`}
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      </div>
      {confirming ? (
        <div className="relative z-[1] flex items-center gap-2 rounded-b-2xl border-t border-border bg-error-bg p-3">
          <span className="mr-auto text-sm text-error">¿Borrar esta conversación?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Borrar
          </Button>
        </div>
      ) : null}
      {pending ? <span className="proc-border" aria-hidden="true" /> : null}
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-[60px] animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

function EmptyRows() {
  return (
    <Card className="bg-surface/60 p-4">
      <p className="text-sm text-fg-2">
        Aún no has preguntado nada sobre este juego. Empieza una conversación y quedará guardada
        aquí.
      </p>
    </Card>
  );
}
