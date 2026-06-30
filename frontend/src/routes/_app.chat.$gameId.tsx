import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, ChevronRight, Copy, FileText, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { MessageComposer } from '@/features/conversations/MessageComposer';
import {
  conversationMessagesKey,
  conversationMessagesQueryOptions,
  conversationsKey,
  conversationsQueryOptions,
} from '@/features/conversations/use-conversations';
import { useRetypingTitle, useTypewriter } from '@/features/conversations/use-typewriter';
import { GameCover } from '@/features/games/GameCover';
import { gameDetailKey, gameDetailQueryOptions, myGamesKey } from '@/features/games/use-games';
import { useProcessingManuals } from '@/features/manual/use-manuals';
import { Meeple } from '@/shared/components/Brand';
import { Markdown } from '@/shared/components/Markdown';
import { ApiError, isAbortApiError, type AnswerSource } from '@/shared/api/client';
import {
  conversationsApi,
  QUESTION_MAX,
  type ConversationSummary,
  type ConversationMessage,
  type SendMessageResponse,
} from '@/shared/api/conversations';
import { cn } from '@/shared/lib/cn';
import { storage } from '@/shared/lib/storage';
import { toastApiError } from '@/shared/lib/toastApiError';

// q comparte cota con el backend; c reabre una conversación guardada.
type ChatSearch = { q?: string; c?: string };

// validateSearch tolerante: un parámetro presente pero inválido se ignora (queda undefined).
function readChatSearch(search: Record<string, unknown>): ChatSearch {
  const text = (value: unknown, max?: number): string | undefined => {
    if (typeof value !== 'string' || value.length < 1) return undefined;
    if (max !== undefined && value.length > max) return undefined;
    return value;
  };
  return { q: text(search.q, QUESTION_MAX), c: text(search.c) };
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

export const PENDING_ASSISTANT_POLL_INTERVAL_MS = 1_500;

function pendingAssistantPollInterval(messages: ConversationMessage[] | undefined): number | false {
  return hasPendingAssistantMessage(messages ?? []) ? PENDING_ASSISTANT_POLL_INTERVAL_MS : false;
}

function hasPendingAssistantMessage(messages: readonly ConversationMessage[]): boolean {
  return messages.some((message) => message.role === 'assistant' && message.status === 'pending');
}

function mergeConversationMessages(
  persisted: readonly ConversationMessage[],
  local: readonly ConversationMessage[],
): ConversationMessage[] {
  const seen = new Set<string>();
  return [...persisted, ...local].filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function takeInitialQuestion(queue: RefObject<string | null>, gameLoaded: boolean): string | null {
  if (!gameLoaded) return null;
  const question = queue.current;
  queue.current = null;
  return question;
}

function useCompletedAssistantAnimation(
  messages: readonly ConversationMessage[],
  setAnimateId: (id: string) => void,
): void {
  const knownAssistantStatusRef = useRef<Map<string, ConversationMessage['status']> | null>(null);

  useEffect(() => {
    const previous = knownAssistantStatusRef.current;
    const next = new Map<string, ConversationMessage['status']>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      next.set(message.id, message.status);
      if (previous?.get(message.id) === 'pending' && message.status === 'completed') {
        setAnimateId(message.id);
      }
    }
    knownAssistantStatusRef.current = next;
  }, [messages, setAnimateId]);
}

function useMarkConversationSeen(conversationId: string | null, seenAt: string | undefined): void {
  useEffect(() => {
    if (conversationId && seenAt) storage.markConversationSeen(conversationId, seenAt);
  }, [conversationId, seenAt]);
}

function useChatNavigation(gameId: string, initialConversationId: string | undefined) {
  const navigate = useNavigate();

  const openConversation = useCallback(
    (conversationId: string) => {
      navigate({
        to: '/chat/$gameId',
        params: { gameId },
        search: { c: conversationId },
        replace: true,
      }).catch(() => undefined);
    },
    [gameId, navigate],
  );

  const clearConversationRoute = useCallback(() => {
    navigate({
      to: '/chat/$gameId',
      params: { gameId },
      search: {},
      replace: true,
    }).catch(() => undefined);
  }, [gameId, navigate]);

  const clearInitialQuestion = useCallback(() => {
    navigate({
      to: '/chat/$gameId',
      params: { gameId },
      search: { c: initialConversationId },
      replace: true,
    }).catch(() => undefined);
  }, [gameId, initialConversationId, navigate]);

  return { openConversation, clearConversationRoute, clearInitialQuestion };
}

function useGameChatContext(gameId: string) {
  // El detalle del juego da el nombre de cabecera y el pool de manuales vivo:
  // sin manuales no se puede preguntar, y las citas a un manual borrado dejan
  // de ser clicables (no se enlaza a un manual que ya no existe).
  const game = useQuery(gameDetailQueryOptions(gameId));
  const gameName = game.data?.name ?? null;
  const canAsk = (game.data?.manuals.length ?? 0) > 0;
  const { gameIds: processingGameIds } = useProcessingManuals();
  // null mientras el detalle del juego no ha cargado: no marcamos una cita como
  // no disponible hasta saber qué manuales siguen en el pool.
  const availableManualIds = useMemo<ReadonlySet<string> | null>(
    () => (game.data ? new Set(game.data.manuals.map((manual) => manual.id)) : null),
    [game.data],
  );
  const gameCrumb = useMemo(
    () =>
      gameName === null
        ? []
        : [{ label: gameName, link: linkOptions({ to: '/game/$gameId', params: { gameId } }) }],
    [gameId, gameName],
  );

  return { game, gameName, canAsk, processingGameIds, availableManualIds, gameCrumb };
}

function useConversationMessages(
  conversationId: string | null,
  turns: readonly ConversationMessage[],
) {
  const history = useQuery({
    ...conversationMessagesQueryOptions(conversationId ?? ''),
    enabled: conversationId !== null,
    refetchInterval: (query) => pendingAssistantPollInterval(query.state.data),
  });
  const historyLoading = conversationId !== null && history.isPending;
  // El servidor ya incluye los turnos nuevos al refrescar: dedupe por id.
  const messages = useMemo(
    () => mergeConversationMessages(history.data ?? [], turns),
    [history.data, turns],
  );
  const hasPendingAssistant = hasPendingAssistantMessage(messages);

  return { history, historyLoading, messages, hasPendingAssistant };
}

function useConversationSummary(
  conversationId: string | null,
  conversations: readonly ConversationSummary[] | undefined,
): ConversationSummary | undefined {
  return useMemo(
    () => conversations?.find((conversation) => conversation.id === conversationId),
    [conversationId, conversations],
  );
}

function useInitialQuestion(args: {
  queue: RefObject<string | null>;
  gameLoaded: boolean;
  sendQuestion: (text: string) => void;
  clearInitialQuestion: () => void;
}): void {
  const { queue, gameLoaded, sendQuestion, clearInitialQuestion } = args;
  useEffect(() => {
    const question = takeInitialQuestion(queue, gameLoaded);
    if (question === null) return;
    sendQuestion(question);
    clearInitialQuestion();
  }, [clearInitialQuestion, gameLoaded, queue, sendQuestion]);
}

function canSendQuestion(question: string, isPending: boolean, canAsk: boolean): boolean {
  return question.length > 0 && !isPending && canAsk;
}

async function sendConversationTurn(args: {
  gameId: string;
  conversationId: string | null;
  question: string;
  abortRef: RefObject<AbortController | null>;
  setConversationId: (conversationId: string) => void;
}): Promise<SendMessageResponse> {
  const { gameId, conversationId, question, abortRef, setConversationId } = args;
  abortRef.current?.abort();
  abortRef.current = new AbortController();
  const signal = abortRef.current.signal;
  let activeConversationId = conversationId;
  if (activeConversationId === null) {
    activeConversationId = (await conversationsApi.create(gameId, signal)).id;
    // Guardado ya: un reintento reutiliza la conversación, no crea otra.
    setConversationId(activeConversationId);
  }
  return conversationsApi.sendMessage(activeConversationId, question, undefined, signal);
}

function refreshAfterTurn(
  queryClient: ReturnType<typeof useQueryClient>,
  data: SendMessageResponse,
): void {
  queryClient.setQueryData<ConversationMessage[]>(
    conversationMessagesKey(data.conversation.id),
    (current) =>
      mergeConversationMessages(current ?? [], [data.user_message, data.assistant_message]),
  );
  queryClient
    .invalidateQueries({ queryKey: conversationsKey(data.conversation.game_id) })
    .catch(() => undefined);
  // Chatear sigue el juego en el backend: refresca detalle (botón) y biblioteca.
  queryClient
    .invalidateQueries({ queryKey: gameDetailKey(data.conversation.game_id) })
    .catch(() => undefined);
  queryClient.invalidateQueries({ queryKey: myGamesKey }).catch(() => undefined);
}

function completedAssistantAnimationId(message: ConversationMessage): string | null {
  return message.status === 'completed' ? message.id : null;
}

function useAskFlow(args: {
  gameId: string;
  conversationId: string | null;
  setConversationId: (conversationId: string | null) => void;
  canAsk: boolean;
  setAnimateId: (id: string | null) => void;
  openConversation: (conversationId: string) => void;
  clearConversationRoute: () => void;
}) {
  const {
    gameId,
    conversationId,
    setConversationId,
    canAsk,
    setAnimateId,
    openConversation,
    clearConversationRoute,
  } = args;
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<ConversationMessage[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Aborta la creación del turno si el usuario sale del chat.
  const askAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => askAbortRef.current?.abort(), []);

  const askMutation = useMutation({
    mutationFn: (question: string) =>
      sendConversationTurn({
        gameId,
        conversationId,
        question,
        abortRef: askAbortRef,
        setConversationId,
      }),
    onError: (err, question) => {
      setPendingQuestion(null);
      if (isAbortApiError(err)) return;
      // Si la fuente desapareció, refresca el juego para deshabilitar el composer.
      if (err instanceof ApiError && err.view.code === 'no_manual_sources') {
        queryClient.invalidateQueries({ queryKey: gameDetailKey(gameId) }).catch(() => undefined);
      }
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
      setAnimateId(completedAssistantAnimationId(data.assistant_message));
      setConversationId(data.conversation.id);
      refreshAfterTurn(queryClient, data);
      // Fija ?c en la URL (replace): refrescar reabre esta misma conversación.
      openConversation(data.conversation.id);
    },
  });

  const sendQuestion = useCallback(
    (text: string): void => {
      const question = text.trim();
      if (canSendQuestion(question, askMutation.isPending, canAsk)) {
        setPendingQuestion(question);
        setDraft('');
        askMutation.mutate(question);
      }
    },
    [askMutation, canAsk],
  );

  const startNewConversation = useCallback((): void => {
    askAbortRef.current?.abort();
    setConversationId(null);
    setTurns([]);
    setPendingQuestion(null);
    setDraft('');
    clearConversationRoute();
  }, [clearConversationRoute, setConversationId]);

  return {
    turns,
    pendingQuestion,
    draft,
    setDraft,
    askMutation,
    sendQuestion,
    startNewConversation,
  };
}

export const Route = createFileRoute('/_app/chat/$gameId')({
  validateSearch: readChatSearch,
  component: ChatScreen,
});

function ChatScreen() {
  const { gameId } = Route.useParams();
  const { q: initialQ, c: initialC } = Route.useSearch();
  const [conversationId, setConversationId] = useState<string | null>(initialC ?? null);
  // Id de la última respuesta recién llegada: solo esa se escribe letra a letra.
  const [animateId, setAnimateId] = useState<string | null>(null);
  const initialQueueRef = useRef<string | null>(initialQ ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { openConversation, clearConversationRoute, clearInitialQuestion } = useChatNavigation(
    gameId,
    initialC,
  );
  const { game, gameName, canAsk, processingGameIds, availableManualIds, gameCrumb } =
    useGameChatContext(gameId);

  // La lista del juego trae el título que el backend genera para la cabecera.
  const conversations = useQuery(conversationsQueryOptions(gameId));
  const {
    turns,
    pendingQuestion,
    draft,
    setDraft,
    askMutation,
    sendQuestion,
    startNewConversation,
  } = useAskFlow({
    gameId,
    conversationId,
    setConversationId,
    canAsk,
    setAnimateId,
    openConversation,
    clearConversationRoute,
  });

  // Dispara ?q una vez —cuando ya se sabe si hay manuales— y lo quita de la URL.
  useInitialQuestion({
    queue: initialQueueRef,
    gameLoaded: game.data !== undefined,
    sendQuestion,
    clearInitialQuestion,
  });
  const { history, historyLoading, messages, hasPendingAssistant } = useConversationMessages(
    conversationId,
    turns,
  );

  useCompletedAssistantAnimation(messages, setAnimateId);

  const waitingForReply = askMutation.isPending || hasPendingAssistant;
  const sendPending = waitingForReply && canAsk;

  // Scroll al final cuando entra un mensaje nuevo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pendingQuestion, askMutation.isPending, hasPendingAssistant]);

  // Mantiene la vista pegada al fondo mientras la respuesta se escribe.
  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const showEmpty =
    messages.length === 0 && pendingQuestion === null && !historyLoading && !history.isError;
  const hasConversation = !showEmpty;
  const showReadOnlyEmpty = showEmpty && canAsk === false;
  // Hasta que el backend nombra la conversación seguimos en "Nueva conversación",
  // así el título solo se reescribe una vez: cuando llega el nombre real.
  const convSummary = useConversationSummary(conversationId, conversations.data);
  const titleTarget = convSummary?.title ?? 'Nueva conversación';

  // Mirar el chat lo marca como leído (su updated_at actual); si la respuesta se
  // completa estando aquí, el poll lo actualiza y la conversación sigue leída.
  const seenAt = convSummary?.updated_at;
  useMarkConversationSeen(conversationId, seenAt);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb="Chat"
        trail={[{ label: 'Biblioteca', link: linkOptions({ to: '/history' }) }, ...gameCrumb]}
      />

      <ChatHeader
        gameName={gameName}
        title={titleTarget}
        showNew={hasConversation && canAsk}
        onNew={startNewConversation}
        processing={processingGameIds.has(gameId)}
      />

      <ChatTimeline
        scrollRef={scrollRef}
        showEmpty={showEmpty}
        showReadOnlyEmpty={showReadOnlyEmpty}
        hasConversation={hasConversation}
        gameName={gameName}
        messages={messages}
        animateId={animateId}
        onPick={sendQuestion}
        onReveal={pinToBottom}
        availableManualIds={availableManualIds}
        pendingQuestion={pendingQuestion}
        historyLoading={historyLoading}
        historyError={history.isError}
        responsePending={askMutation.isPending && !hasPendingAssistant}
      />

      <ChatComposerBar
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={sendQuestion}
        canAsk={canAsk}
        gameName={gameName}
        disabled={canAsk === false}
        sendPending={sendPending}
      />
    </div>
  );
}

type ChatConversationProps = Readonly<{
  messages: readonly ConversationMessage[];
  animateId: string | null;
  onReveal: () => void;
  availableManualIds: ReadonlySet<string> | null;
  pendingQuestion: string | null;
  historyLoading: boolean;
  historyError: boolean;
  responsePending: boolean;
}>;

type ChatTimelineProps = ChatConversationProps &
  Readonly<{
    scrollRef: RefObject<HTMLDivElement | null>;
    showEmpty: boolean;
    showReadOnlyEmpty: boolean;
    hasConversation: boolean;
    gameName: string | null;
    onPick: (question: string) => void;
  }>;

function ChatTimeline({
  scrollRef,
  showEmpty,
  showReadOnlyEmpty,
  hasConversation,
  gameName,
  messages,
  animateId,
  onPick,
  onReveal,
  availableManualIds,
  pendingQuestion,
  historyLoading,
  historyError,
  responsePending,
}: ChatTimelineProps) {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
      {showEmpty && !showReadOnlyEmpty ? <ChatWelcome gameName={gameName} onPick={onPick} /> : null}
      {showReadOnlyEmpty ? <ReadOnlyEmpty gameName={gameName} /> : null}
      {hasConversation ? (
        <ChatConversation
          messages={messages}
          animateId={animateId}
          onReveal={onReveal}
          availableManualIds={availableManualIds}
          pendingQuestion={pendingQuestion}
          historyLoading={historyLoading}
          historyError={historyError}
          responsePending={responsePending}
        />
      ) : null}
    </div>
  );
}

function ChatConversation({
  messages,
  animateId,
  onReveal,
  availableManualIds,
  pendingQuestion,
  historyLoading,
  historyError,
  responsePending,
}: ChatConversationProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 md:px-6">
      {historyLoading ? <HistorySkeleton /> : null}
      {historyError ? (
        <p className="py-6 text-center text-sm text-fg-3">
          No hemos podido recuperar esta conversación. Puedes seguir preguntando abajo.
        </p>
      ) : null}
      {messages.map((message) => (
        <Bubble
          key={message.id}
          msg={message}
          animate={message.id === animateId}
          onReveal={onReveal}
          availableManualIds={availableManualIds}
        />
      ))}
      {pendingQuestion ? <UserBubble content={pendingQuestion} /> : null}
      {responsePending ? (
        <BotStatusBubble label="Escribiendo respuesta" visibleLabel={false} />
      ) : null}
    </div>
  );
}

function ChatComposerBar({
  draft,
  onDraftChange,
  onSubmit,
  canAsk,
  gameName,
  disabled,
  sendPending,
}: Readonly<{
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (question: string) => void;
  canAsk: boolean;
  gameName: string | null;
  disabled: boolean;
  sendPending: boolean;
}>) {
  const placeholder = canAsk
    ? `Pregunta sobre ${gameName ?? 'el juego'}…`
    : 'No hay manuales disponibles para preguntar';

  return (
    <div
      className="shrink-0 border-t border-border bg-bg px-4 pt-[11px] md:px-6"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      <div className="mx-auto w-full max-w-3xl">
        {canAsk ? null : <SourcesUnavailableNotice />}
        <MessageComposer
          value={draft}
          onChange={onDraftChange}
          onSubmit={() => onSubmit(draft)}
          placeholder={placeholder}
          maxLength={QUESTION_MAX}
          disabled={disabled}
          sendPending={sendPending}
        />
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

/** Cabecera del chat: portada + título de la conversación + juego + "Nueva". */
function ChatHeader({
  gameName,
  title,
  showNew,
  onNew,
  processing,
}: Readonly<{
  gameName: string | null;
  title: string;
  showNew: boolean;
  onNew: () => void;
  processing: boolean;
}>) {
  // El título se reescribe (borrar + teclear) cuando el backend nombra la conversación.
  const shownTitle = useRetypingTitle(title);
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg px-4 py-2.5 md:px-6">
      {gameName ? <GameCover name={gameName} size={38} radius={9} processing={processing} /> : null}
      <div className="min-w-0 flex-1">
        {/* El espacio fijo evita que la línea de abajo salte mientras se borra. */}
        <p className="truncate font-display text-[15px] font-bold text-fg md:text-base">
          {shownTitle || ' '}
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

/** Conversación sin mensajes de un juego que ya no tiene manuales: solo lectura. */
function ReadOnlyEmpty({ gameName }: Readonly<{ gameName: string | null }>) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-8 text-center">
      <ChatBotAvatar size={64} />
      <h2 className="mt-3.5 font-display text-2xl font-extrabold tracking-tight text-fg">
        Esta conversación es de solo lectura
      </h2>
      <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-fg-2">
        Una fuente que usaste sobre {gameName ?? 'el juego'} ya no está disponible, así que no se
        pueden hacer nuevas preguntas. Sube de nuevo el manual para retomarla.
      </p>
    </div>
  );
}

/** Aviso sobre el composer cuando el juego se quedó sin manuales que citar. */
function SourcesUnavailableNotice() {
  return (
    <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[13px] leading-snug text-fg-2">
      <FileText
        size={15}
        strokeWidth={2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-fg-3"
      />
      <span>
        Una fuente que usaste ya no está disponible. Puedes leer esta conversación, pero no hacer
        nuevas preguntas.
      </span>
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
  availableManualIds,
}: Readonly<{
  msg: ConversationMessage;
  animate: boolean;
  onReveal: () => void;
  availableManualIds: ReadonlySet<string> | null;
}>) {
  if (msg.role === 'user') {
    return <UserBubble content={msg.content} />;
  }
  return (
    <BotBubble
      msg={msg}
      animate={animate}
      onReveal={onReveal}
      availableManualIds={availableManualIds}
    />
  );
}

function BotBubble({
  msg,
  animate,
  onReveal,
  availableManualIds,
}: Readonly<{
  msg: ConversationMessage;
  animate: boolean;
  onReveal: () => void;
  availableManualIds: ReadonlySet<string> | null;
}>) {
  // Solo las respuestas completadas se escriben letra a letra; los hooks van
  // siempre en el mismo orden (pending/failed se pintan abajo sin usarlos).
  const ready = msg.status === 'completed';
  const { shown, done } = useTypewriter(msg.content, animate && ready);

  // Mientras se escribe, seguimos pegados al fondo.
  useEffect(() => {
    if (animate && ready) onReveal();
  }, [shown, animate, ready, onReveal]);

  if (msg.status === 'pending') {
    return <BotStatusBubble label="Generando respuesta" visibleLabel={false} />;
  }
  if (msg.status === 'failed') {
    return (
      <BotStaticBubble tone="error">
        No hemos podido generar esta respuesta. Prueba de nuevo en un momento.
      </BotStaticBubble>
    );
  }

  return (
    <div className="group flex items-start gap-[11px]">
      <ChatBotAvatar />
      <div className="min-w-0 max-w-[82%]">
        <div
          className="rounded-2xl border border-border bg-card px-4 py-[13px] shadow-xs"
          style={{ borderBottomLeftRadius: 4 }}
        >
          <Markdown className="text-[15px] leading-relaxed text-fg-2">{shown}</Markdown>
          {done && msg.sources.length > 0 ? (
            <SourceChips sources={msg.sources} availableManualIds={availableManualIds} />
          ) : null}
        </div>
        {done ? <CopyAnswer text={msg.content} /> : null}
      </div>
    </div>
  );
}

function BotStatusBubble({
  label,
  visibleLabel = true,
}: Readonly<{ label: string; visibleLabel?: boolean }>) {
  return (
    <div className="flex items-start gap-[11px]">
      <ChatBotAvatar />
      <output
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-[18px] py-[14px] text-sm font-semibold text-fg-3 shadow-xs"
        style={{ borderBottomLeftRadius: 4 }}
        aria-label={label}
      >
        <span className="flex items-center gap-[5px]" aria-hidden="true">
          {[0, 160, 320].map((d) => (
            <span
              key={d}
              className="block size-[7px] rounded-full bg-primary"
              style={{ animation: `mn-dot 1.1s ${d}ms infinite ease-in-out` }}
            />
          ))}
        </span>
        {visibleLabel ? label : null}
      </output>
    </div>
  );
}

function BotStaticBubble({
  children,
  tone = 'default',
}: Readonly<{ children: string; tone?: 'default' | 'error' }>) {
  return (
    <div className="flex items-start gap-[11px]">
      <ChatBotAvatar />
      <div
        className={cn(
          'max-w-[82%] rounded-2xl border px-4 py-[13px] text-[15px] leading-relaxed shadow-xs',
          tone === 'error'
            ? 'border-error/30 bg-error-bg text-error'
            : 'border-border bg-card text-fg-2',
        )}
        style={{ borderBottomLeftRadius: 4 }}
      >
        {children}
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

/** Páginas que respaldan la respuesta, deduplicadas por página. */
function SourceChips({
  sources,
  availableManualIds,
}: Readonly<{ sources: AnswerSource[]; availableManualIds: ReadonlySet<string> | null }>) {
  const byPage = new Map<number, { manualId: string; title: string | null; isOwn: boolean }>();
  for (const source of sources) {
    if (!byPage.has(source.page)) {
      byPage.set(source.page, {
        manualId: source.manual_id,
        title: source.manual_title,
        isOwn: source.is_own,
      });
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
        {pages.map(([page, source]) => (
          <SourceChip
            key={page}
            page={page}
            {...source}
            available={availableManualIds === null || availableManualIds.has(source.manualId)}
          />
        ))}
      </div>
    </div>
  );
}

const CHIP_BASE =
  'inline-flex h-[30px] items-center gap-1.5 rounded-full border pl-[9px] pr-[11px] text-[12.5px] font-semibold';

/**
 * Cita de una página. Solo se enlaza el visor para manuales propios que sigan
 * disponibles; los de la comunidad y los ya borrados se citan pero no son
 * clicables, para no llevar a una pantalla que daría 404.
 */
function SourceChip({
  page,
  manualId,
  title,
  isOwn,
  available,
}: Readonly<{
  page: number;
  manualId: string;
  title: string | null;
  isOwn: boolean;
  available: boolean;
}>) {
  const clickable = isOwn && available;
  const icon = (
    <span
      className={cn(
        'grid size-[18px] place-items-center rounded-[5px]',
        clickable ? 'bg-primary-100 text-primary-700' : 'bg-surface-2 text-fg-3',
      )}
    >
      <FileText size={11} strokeWidth={2} aria-hidden="true" />
    </span>
  );

  if (clickable) {
    return (
      <Link
        to="/manual/$manualId"
        params={{ manualId }}
        search={{ page }}
        title={title ?? undefined}
        aria-label={`Abrir página ${page} del manual`}
        className={cn(
          CHIP_BASE,
          'border-border-strong bg-card text-fg-2 transition-colors hover:border-primary hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        )}
      >
        {icon}
        Pág. {page}
      </Link>
    );
  }

  const reason = isOwn ? 'ya no disponible' : 'manual de la comunidad';
  return (
    <span
      title={title ? `${title} · ${reason}` : reason}
      aria-label={`Página ${page} (${reason})`}
      className={cn(CHIP_BASE, 'cursor-default border-border bg-card text-fg-3')}
    >
      {icon}
      Pág. {page}
    </span>
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
