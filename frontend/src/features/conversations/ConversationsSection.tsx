import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { formatRelative } from '@/shared/lib/relativeDate';
import { conversationsKey, conversationsQueryOptions } from './use-conversations';

const MAX_ROWS = 8;

/**
 * Conversaciones pasadas del juego, en la pantalla de resultado: retomar
 * una donde se quedó o empezar otra desde cero.
 */
export function ConversationsSection({
  manualId,
  gameId,
  showViewAll = false,
}: Readonly<{ manualId: string; gameId: string; showViewAll?: boolean }>) {
  const qc = useQueryClient();
  const { data, isPending, isError } = useQuery(conversationsQueryOptions(gameId));
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
          <Link
            to="/chat/$manualId"
            params={{ manualId }}
            search={{ g: gameId }}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <Plus size={13} strokeWidth={2.25} aria-hidden="true" />
            Nueva
          </Link>
        </div>
      </div>

      {isPending ? <RowsSkeleton /> : null}
      {!isPending && conversations.length === 0 ? <EmptyRows /> : null}
      {conversations.length > 0 ? (
        <Card className="divide-y divide-border overflow-hidden">
          {conversations.slice(0, MAX_ROWS).map((c) => (
            <ConversationRow
              key={c.id}
              manualId={manualId}
              conversation={c}
              deleting={del.isPending && del.variables === c.id}
              onDelete={() => del.mutate(c.id)}
            />
          ))}
        </Card>
      ) : null}
    </section>
  );
}

function ConversationRow({
  manualId,
  conversation,
  deleting,
  onDelete,
}: Readonly<{
  manualId: string;
  conversation: ConversationSummary;
  deleting: boolean;
  onDelete: () => void;
}>) {
  const [confirming, setConfirming] = useState(false);
  const title = conversation.title ?? 'Conversación sin título';

  return (
    <div className={deleting ? 'opacity-50' : undefined}>
      <div className="flex items-stretch pr-2">
        <Link
          to="/chat/$manualId"
          params={{ manualId }}
          search={{ c: conversation.id, g: conversation.game_id }}
          className="flex min-w-0 flex-1 items-center gap-3 p-3.5 transition-colors hover:bg-surface-2"
        >
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700"
          >
            <MessagesSquare size={16} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold text-fg">{title}</span>
            <span className="block text-xs text-fg-3">
              {formatRelative(conversation.updated_at)}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="grid h-11 w-11 shrink-0 self-center place-items-center rounded-xl text-fg-3 hover:bg-error-bg hover:text-error"
          aria-label={`Borrar conversación ${title}`}
        >
          <Trash2 size={16} strokeWidth={2} />
        </button>
      </div>
      {confirming ? (
        <div className="flex items-center gap-2 border-t border-border bg-error-bg p-3">
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
