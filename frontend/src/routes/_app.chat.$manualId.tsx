import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, ChevronRight, Copy, FileText, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { MessageComposer } from '@/features/conversations/MessageComposer';
import {
  conversationMessagesQueryOptions,
  conversationsKey,
  conversationsQueryOptions,
} from '@/features/conversations/use-conversations';
import { useRetypingTitle, useTypewriter } from '@/features/conversations/use-typewriter';
import { GameCover } from '@/features/games/GameCover';
import { gameDetailKey, myGamesKey } from '@/features/games/use-games';
import { manualDetailQueryOptions } from '@/features/manual/use-manuals';
import { Meeple } from '@/shared/components/Brand';
import { Markdown } from '@/shared/components/Markdown';
import { api, isAbortApiError, type AnswerSource } from '@/shared/api/client';
import {
  conversationsApi,
  QUESTION_MAX,
  type ConversationMessage,
} from '@/shared/api/conversations';
import { toastApiError } from '@/shared/lib/toastApiError';

// q comparte cota con el backend; c reabre conversación; g trae el juego del hub.
type ChatSearch = { q?: string; c?: string; g?: string };

// validateSearch tolerante: un parámetro presente pero inválido se ignora (queda undefined).
function readChatSearch(search: Record<string, unknown>): ChatSearch {
  const text = (value: unknown, max?: number): string | undefined => {
    if (typeof value !== 'string' || value.length < 1) return undefined;
    if (max !== undefined && value.length > max) return undefined;
    return value;
  };
  return { q: text(search.q, QUESTION_MAX), c: text(search.c), g: text(search.g) };
}

// Tarjetas de la bienvenida: preguntas genéricas válidas para cualquier manual.
const WELCOME_SUGGESTIONS = [
  '¿Para cuántos jugadores?',
  '¿Cómo se gana?',
  '¿Quién empieza?',
  '¿Cómo se prepara?',
  '¿Cuánto dura una partida?',
  '¿Se puede pasar el turno?',
];

export const Route = createFileRoute('/_app/chat/$manualId')({
  validateSearch: readChatSearch,
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
  // Id de la última respuesta recién llegada: solo esa se escribe letra a letra.
  const [animateId, setAnimateId] = useState<string | null>(null);
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

  // La lista del juego trae el título que el backend genera para la cabecera.
  const conversations = useQuery({
    ...conversationsQueryOptions(resolvedGameId ?? ''),
    enabled: resolvedGameId !== null,
  });

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
      setAnimateId(data.assistant_message.id);
      setConversationId(data.conversation.id);
      qc.invalidateQueries({ queryKey: conversationsKey(data.conversation.game_id) }).catch(
        () => undefined,
      );
      // Chatear sigue el juego en el backend: refresca detalle (botón) y biblioteca.
      qc.invalidateQueries({ queryKey: gameDetailKey(data.conversation.game_id) }).catch(
        () => undefined,
      );
      qc.invalidateQueries({ queryKey: myGamesKey }).catch(() => undefined);
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

  // Vacía la conversación actual y vuelve a la bienvenida (sin ?c en la URL).
  function startNewConversation(): void {
    askAbortRef.current?.abort();
    setConversationId(null);
    setTurns([]);
    setPendingQuestion(null);
    setDraft('');
    navigate({
      to: '/chat/$manualId',
      params: { manualId },
      search: { g: resolvedGameId ?? undefined },
      replace: true,
    }).catch(() => undefined);
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

  // Mantiene la vista pegada al fondo mientras la respuesta se escribe, salvo
  // que el usuario haya subido a leer mensajes anteriores.
  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const showEmpty =
    messages.length === 0 && pendingQuestion === null && !historyLoading && !history.isError;
  const hasConversation = !showEmpty;
  // Hasta que el backend nombra la conversación seguimos en «Nueva conversación»,
  // así el título solo se reescribe una vez: cuando llega el nombre real.
  const resolvedTitle = conversationId
    ? (conversations.data?.find((c) => c.id === conversationId)?.title ?? null)
    : null;
  const titleTarget = resolvedTitle ?? 'Nueva conversación';

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb="Chat"
        trail={[{ label: 'Biblioteca', link: linkOptions({ to: '/history' }) }, ...gameCrumb]}
      />

      <ChatHeader
        gameName={gameName}
        title={titleTarget}
        showNew={hasConversation}
        onNew={startNewConversation}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {showEmpty ? (
          <ChatWelcome gameName={gameName} onPick={sendQuestion} />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 md:px-6">
            {historyLoading ? <HistorySkeleton /> : null}
            {history.isError ? (
              <p className="py-6 text-center text-sm text-fg-3">
                No hemos podido recuperar esta conversación. Puedes seguir preguntando abajo.
              </p>
            ) : null}
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} animate={m.id === animateId} onReveal={pinToBottom} />
            ))}
            {pendingQuestion ? <UserBubble content={pendingQuestion} /> : null}
            {askMutation.isPending ? <TypingIndicator /> : null}
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-border bg-bg px-4 pt-[11px] md:px-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <MessageComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => sendQuestion(draft)}
            placeholder={`Pregunta sobre ${gameName ?? 'el juego'}…`}
            maxLength={QUESTION_MAX}
            disabled={askMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}

/** Avatar circular del bot: ficha de la marca sobre un disco ámbar claro. */
function ChatBotAvatar({ size = 34 }: Readonly<{ size?: number }>) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-border bg-primary-100 text-primary-700"
      style={{ width: size, height: size }}
    >
      {/* La masa visual de la ficha cae abajo: la subimos un pelo para centrarla. */}
      <span
        className="grid place-items-center"
        style={{ transform: `translateY(-${Math.max(1, Math.round(size * 0.035))}px)` }}
      >
        <Meeple size={Math.round(size * 0.62)} color="currentColor" />
      </span>
    </span>
  );
}

/** Cabecera del chat: portada + título de la conversación + juego + «Nueva». */
function ChatHeader({
  gameName,
  title,
  showNew,
  onNew,
}: Readonly<{ gameName: string | null; title: string; showNew: boolean; onNew: () => void }>) {
  // El título se reescribe (borrar + teclear) cuando el backend nombra la conversación.
  const shownTitle = useRetypingTitle(title);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg px-4 py-2.5 md:px-6">
      {gameName ? <GameCover name={gameName} size={38} radius={9} /> : null}
      <div className="min-w-0 flex-1">
        {/* El espacio fijo evita que la línea de abajo salte mientras se borra. */}
        <p className="truncate font-display text-[15px] font-bold text-fg md:text-base">
          {shownTitle || ' '}
        </p>
        <p className="mono mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
          <Meeple size={11} color="currentColor" />
          <span className="truncate">{gameName ?? 'Juego'}</span>
        </p>
      </div>
      {showNew ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onNew}
          className="shrink-0"
          aria-label="Nueva conversación"
        >
          <Plus size={15} strokeWidth={2} />
          <span className="hidden sm:inline">Nueva</span>
        </Button>
      ) : null}
    </div>
  );
}

/** Estado vacío: en vez de un lienzo en blanco, guía con preguntas-tarjeta. */
function ChatWelcome({
  gameName,
  onPick,
}: Readonly<{ gameName: string | null; onPick: (q: string) => void }>) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-8 text-center">
      <ChatBotAvatar size={64} />
      <h2 className="mt-3.5 font-display text-2xl font-extrabold tracking-tight text-fg">
        Pregúntame sobre {gameName ?? 'el juego'}
      </h2>
      <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-fg-2">
        He leído el manual entero. Pregunta lo que quieras y te respondo en claro, citando la página
        exacta.
      </p>
      <div className="mt-6 w-full max-w-xl">
        <p className="mono mb-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fg-3">
          Prueba con
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {WELCOME_SUGGESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              className="group flex items-center gap-3 rounded-[14px] border border-border bg-card px-[15px] py-[13px] text-left text-sm font-semibold text-fg shadow-xs transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-primary-100 text-primary-700">
                <Sparkles size={15} strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="flex-1 transition-colors group-hover:text-primary-700">{q}</span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-fg-3"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserBubble({ content }: Readonly<{ content: string }>) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl bg-primary px-[15px] py-[11px] text-[15px] leading-normal text-fg-inv shadow-xs"
        style={{ borderBottomRightRadius: 4 }}
      >
        {content}
      </div>
    </div>
  );
}

function Bubble({
  msg,
  animate,
  onReveal,
}: Readonly<{ msg: ConversationMessage; animate: boolean; onReveal: () => void }>) {
  if (msg.role === 'user') {
    return <UserBubble content={msg.content} />;
  }
  return <BotBubble msg={msg} animate={animate} onReveal={onReveal} />;
}

function BotBubble({
  msg,
  animate,
  onReveal,
}: Readonly<{ msg: ConversationMessage; animate: boolean; onReveal: () => void }>) {
  // Respuesta recién llegada: se escribe letra a letra; el historial sale entero.
  const { shown, done } = useTypewriter(msg.content, animate);

  // Mientras se escribe, seguimos pegados al fondo.
  useEffect(() => {
    if (animate) onReveal();
  }, [shown, animate, onReveal]);

  return (
    <div className="group flex items-start gap-[11px]">
      <ChatBotAvatar />
      <div className="min-w-0 max-w-[82%]">
        <div
          className="rounded-2xl border border-border bg-card px-4 py-[13px] shadow-xs"
          style={{ borderBottomLeftRadius: 4 }}
        >
          <Markdown className="text-[15px] leading-relaxed text-fg-2">{shown}</Markdown>
          {done && msg.sources.length > 0 ? <SourceChips sources={msg.sources} /> : null}
        </div>
        {done ? <CopyAnswer text={msg.content} /> : null}
      </div>
    </div>
  );
}

/** Copia la respuesta (Markdown tal cual). Discreto hasta el hover en escritorio. */
function CopyAnswer({ text }: Readonly<{ text: string }>) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado', { id: 'copy-answer' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar', { id: 'copy-answer' });
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        copy().catch(() => undefined);
      }}
      aria-label="Copiar respuesta"
      className="mt-1.5 grid size-7 place-items-center rounded-lg text-fg-3 transition-[color,background-color,opacity] hover:bg-surface-2 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
    >
      {copied ? (
        <Check size={14} strokeWidth={2.5} className="text-success" aria-hidden="true" />
      ) : (
        <Copy size={14} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}

/** Páginas del manual que respaldan la respuesta, clicables (deduplicadas por página). */
function SourceChips({ sources }: Readonly<{ sources: AnswerSource[] }>) {
  const byPage = new Map<number, { manualId: string; title: string | null }>();
  for (const source of sources) {
    if (!byPage.has(source.page)) {
      byPage.set(source.page, { manualId: source.manual_id, title: source.manual_title });
    }
  }
  const pages = [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  return (
    <div className="mt-[13px] border-t border-dashed border-border-strong pt-3">
      <p className="mono mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-3">
        <BookOpen size={12} strokeWidth={2} aria-hidden="true" />
        Fuentes consultadas
      </p>
      <div className="flex flex-wrap gap-[7px]">
        {pages.map(([page, { manualId, title }]) => (
          <Link
            key={page}
            to="/manual/$manualId"
            params={{ manualId }}
            search={{ page }}
            title={title ?? undefined}
            aria-label={`Abrir página ${page} del manual`}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border-strong bg-card pl-[9px] pr-[11px] text-[12.5px] font-semibold text-fg-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="grid size-[18px] place-items-center rounded-[5px] bg-primary-100 text-primary-700">
              <FileText size={11} strokeWidth={2} aria-hidden="true" />
            </span>
            Pág. {page}
          </Link>
        ))}
      </div>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4 pt-2">
      <div className="ml-auto h-12 w-3/5 animate-pulse rounded-2xl bg-surface-2" />
      <div className="flex items-start gap-[11px]">
        <div className="size-[34px] shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="h-20 w-4/5 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-[11px]">
      <ChatBotAvatar />
      <output
        className="rounded-2xl border border-border bg-card px-[18px] py-[14px] shadow-xs"
        style={{ borderBottomLeftRadius: 4 }}
        aria-label="Escribiendo respuesta"
      >
        <span className="flex items-center gap-[5px]">
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="block size-[7px] rounded-full bg-primary"
              style={{ animation: `mn-dot 1.1s ${d}ms infinite ease-in-out` }}
            />
          ))}
        </span>
      </output>
    </div>
  );
}
