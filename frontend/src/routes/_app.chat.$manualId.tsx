import { createFileRoute, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Send } from 'lucide-react';
import { BackLink, ScreenTopBar } from '@/app/Topbar';
import { Markdown } from '@/shared/components/Markdown';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api, isAbortApiError, type AnswerSource } from '@/shared/api/client';
import { toastApiError } from '@/shared/lib/toastApiError';
import { conversationsApi, QUESTION_MAX, type ConversationMessage } from '@/shared/api/conversations';
import {
  conversationMessagesQueryOptions,
  conversationsKey,
} from '@/features/conversations/use-conversations';
import { manualDetailQueryOptions } from '@/features/manual/use-manuals';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Meeple } from '@/shared/components/Brand';

// q comparte cota con el backend; c reabre conversación; g trae el juego del hub.
const chatSearchSchema = z.object({
  q: z.string().min(1).max(QUESTION_MAX).optional().catch(undefined),
  c: z.string().min(1).optional().catch(undefined),
  g: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute('/_app/chat/$manualId')({
  validateSearch: chatSearchSchema,
  component: ChatScreen,
});

function ChatScreen() {
  const { manualId } = Route.useParams();
  const { q: initialQ, c: initialC, g: gameId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(initialC ?? null);
  // Turnos completados en esta sesión (el backend devuelve user + assistant).
  const [turns, setTurns] = useState<ConversationMessage[]>([]);
  // Pregunta en vuelo: burbuja optimista hasta que llega el turno real.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const initialQueueRef = useRef<string | null>(initialQ ?? null);
  // Solo las conversaciones reabiertas (?c al montar) piden historial.
  const [reopened] = useState(initialC != null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // El manual resuelve juego y botón de volver cuando la URL no trae g.
  const manualDetail = useQuery(manualDetailQueryOptions(manualId));
  const resolvedGameId = gameId ?? manualDetail.data?.game_id ?? null;
  const gameName = manualDetail.data?.game_name ?? null;
  const gameCrumb =
    resolvedGameId === null || gameName === null
      ? []
      : [
          {
            label: gameName,
            link: linkOptions({ to: '/game/$gameId', params: { gameId: resolvedGameId } }),
          },
        ];

  const history = useQuery({
    ...conversationMessagesQueryOptions(conversationId ?? ''),
    enabled: reopened && conversationId !== null,
  });
  const historyLoading = reopened && conversationId !== null && history.isPending;

  // Aborta la petición al LLM (30-60s) si el usuario sale del chat.
  const askAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => askAbortRef.current?.abort(), []);

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      askAbortRef.current?.abort();
      askAbortRef.current = new AbortController();
      const signal = askAbortRef.current.signal;
      let cid = conversationId;
      if (cid === null) {
        const gid = resolvedGameId ?? (await api.getManual(manualId, signal)).game_id;
        cid = (await conversationsApi.create(gid, signal)).id;
        // Guardado ya: un reintento reutiliza la conversación, no crea otra.
        setConversationId(cid);
      }
      return conversationsApi.sendMessage(cid, question, undefined, signal);
    },
    onError: (err, question) => {
      setPendingQuestion(null);
      if (isAbortApiError(err)) return;
      // Recupera la pregunta en el composer para reintentar sin reescribirla.
      setDraft((current) => (current.length > 0 ? current : question));
      toastApiError(err, 'ask-error', {
        title: 'No hemos podido responder',
        id: 'ask-error-unknown',
        description: 'Inténtalo de nuevo en un momento.',
      });
    },
    onSuccess: (data) => {
      setPendingQuestion(null);
      setTurns((prev) => [...prev, data.user_message, data.assistant_message]);
      setConversationId(data.conversation.id);
      qc.invalidateQueries({ queryKey: conversationsKey(data.conversation.game_id) }).catch(
        () => undefined,
      );
      // Fija ?c en la URL (replace): refrescar reabre esta misma conversación.
      navigate({
        to: '/chat/$manualId',
        params: { manualId },
        search: { c: data.conversation.id, g: gameId ?? data.conversation.game_id },
        replace: true,
      }).catch(() => undefined);
    },
  });

  function sendQuestion(text: string): void {
    const q = text.trim();
    if (q.length === 0 || askMutation.isPending) return;
    setPendingQuestion(q);
    setDraft('');
    askMutation.mutate(q);
  }

  // Dispara ?q una vez y lo quita de la URL (replace): refrescar no re-envía.
  useEffect(() => {
    if (initialQueueRef.current) {
      const q = initialQueueRef.current;
      initialQueueRef.current = null;
      sendQuestion(q);
      navigate({
        to: '/chat/$manualId',
        params: { manualId },
        search: { c: initialC, g: gameId },
        replace: true,
      }).catch(() => undefined);
    }
    // sendQuestion fuera de deps: meterla provocaría re-disparos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El servidor ya incluye los turnos nuevos al refrescar: dedupe por id.
  const seen = new Set<string>();
  const messages = [...(history.data ?? []), ...turns].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Scroll al final cuando entra un mensaje nuevo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pendingQuestion, askMutation.isPending]);

  const showEmpty =
    messages.length === 0 && pendingQuestion === null && !historyLoading && !history.isError;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb="Chat"
        trail={[{ label: 'Historial', link: linkOptions({ to: '/history' }) }, ...gameCrumb]}
        back={
          resolvedGameId ? (
            <BackLink
              label="Volver al juego"
              link={linkOptions({ to: '/game/$gameId', params: { gameId: resolvedGameId } })}
            />
          ) : (
            <BackLink label="Volver al historial" link={linkOptions({ to: '/history' })} />
          )
        }
        actions={
          <Badge tone="success">
            Listo
          </Badge>
        }
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-3 p-4">
          {showEmpty ? (
            <p className="mt-6 text-center text-sm text-fg-3">
              Empieza con una pregunta sobre el manual.
            </p>
          ) : null}
          {historyLoading ? <HistorySkeleton /> : null}
          {history.isError ? (
            <p className="mt-6 text-center text-sm text-fg-3">
              No hemos podido recuperar esta conversación. Puedes seguir preguntando abajo.
            </p>
          ) : null}
          {messages.map((m) => (
            <Bubble key={m.id} msg={m} />
          ))}
          {pendingQuestion ? <UserBubble content={pendingQuestion} /> : null}
          {askMutation.isPending ? <TypingIndicator /> : null}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(draft);
        }}
        className="sticky bottom-0 border-t border-border bg-bg/95 py-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4">
          <Input
            preset="chat-message"
            value={draft}
            maxLength={QUESTION_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pregunta…"
            aria-label="Escribe tu pregunta"
            disabled={askMutation.isPending}
            className="flex-1 rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            loading={askMutation.isPending}
            disabled={draft.trim().length === 0}
            aria-label="Enviar pregunta"
          >
            {/* Centrado óptico: la masa del avión cae arriba-derecha (centroide medido). */}
            <Send size={17} strokeWidth={2} style={{ transform: 'translate(-1.3px, 1.3px)' }} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function UserBubble({ content }: Readonly<{ content: string }>) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[78%] break-words rounded-2xl bg-primary px-4 py-3 text-base leading-relaxed text-fg-inv"
        style={{ borderTopRightRadius: 6 }}
      >
        {content}
      </div>
    </div>
  );
}

function Bubble({ msg }: Readonly<{ msg: ConversationMessage }>) {
  if (msg.role === 'user') {
    return <UserBubble content={msg.content} />;
  }
  return (
    <div className="flex justify-start gap-2">
      <div
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center self-end rounded-full border border-border bg-surface-2 text-primary-700"
      >
        <Meeple size={16} color="currentColor" />
      </div>
      <div className="flex max-w-[78%] flex-col gap-1.5">
        <div
          className="rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-relaxed text-fg"
          style={{ borderTopLeftRadius: 6 }}
        >
          <Markdown>{msg.content}</Markdown>
        </div>
        {msg.sources.length > 0 ? <SourceChips sources={msg.sources} /> : null}
      </div>
    </div>
  );
}

/** Páginas del manual que respaldan la respuesta del bot (deduplicadas por página). */
function SourceChips({ sources }: Readonly<{ sources: AnswerSource[] }>) {
  const byPage = new Map<number, string | null>();
  for (const source of sources) {
    if (!byPage.has(source.page)) byPage.set(source.page, source.manual_title);
  }
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Fuentes citadas">
      {[...byPage].map(([page, title]) => (
        <span
          key={page}
          title={title ?? undefined}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-semibold text-fg-3"
        >
          <FileText size={11} strokeWidth={2} aria-hidden="true" />
          Pág. {page}
        </span>
      ))}
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3 pt-2">
      <div className="ml-auto h-12 w-3/5 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-16 w-4/5 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-primary-700"
      >
        <Meeple size={16} color="currentColor" />
      </div>
      <output
        className="flex items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-3"
        style={{ borderTopLeftRadius: 6 }}
        aria-label="Escribiendo respuesta"
      >
        {[0, 160, 320].map((d) => (
          <span
            key={d}
            className="block h-1.5 w-1.5 rounded-full bg-fg-3"
            style={{ animation: `mn-dot 1.2s ${d}ms infinite ease-in-out` }}
          />
        ))}
      </output>
    </div>
  );
}
