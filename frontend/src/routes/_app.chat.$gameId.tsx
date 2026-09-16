import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParseKeys } from 'i18next';
import {
  CheckIcon,
  CaretRightIcon,
  CopyIcon,
  FileTextIcon,
  PlusIcon,
  SparkleIcon,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Tooltip } from '@/components/ui/tooltip';
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
import { tourTarget } from '@/features/tutorial/targets';
import { Meeple } from '@/shared/components/Brand';
import { Markdown } from '@/shared/components/Markdown';
import { UploaderAvatar, useUploadedByText } from '@/shared/components/UploadedBy';
import { Avatar } from '@/shared/components/Avatar';
import { useAuth } from '@/features/auth/use-auth';
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
import { LiveTrans } from '@/shared/components/LiveTrans';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';

// q comparte cota con el backend. C reabre una conversación guardada.
type ChatSearch = { q?: string; c?: string };

// validateSearch tolerante. Un parámetro presente pero inválido se ignora (queda undefined).
function readChatSearch(search: Record<string, unknown>): ChatSearch {
  const text = (value: unknown, max?: number): string | undefined => {
    if (typeof value !== 'string' || value.length < 1) return undefined;
    if (max !== undefined && value.length > max) return undefined;
    return value;
  };
  return { q: text(search.q, QUESTION_MAX), c: text(search.c) };
}

// Tarjetas de la bienvenida. Preguntas genéricas válidas para cualquier manual.
type ChatKey = ParseKeys<'chat'>;

const WELCOME_SUGGESTIONS: ReadonlyArray<ChatKey> = [
  'welcome.suggestions.players',
  'welcome.suggestions.victory',
  'welcome.suggestions.start',
  'welcome.suggestions.preparation',
  'welcome.suggestions.duration',
  'welcome.suggestions.passTurn',
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
  // El detalle del juego da el nombre de cabecera y el pool de manuales vivo.
  // sin manuales no se puede preguntar, y las citas a un manual borrado dejan
  // de ser clicables (no se enlaza a un manual que ya no existe).
  const game = useQuery(gameDetailQueryOptions(gameId));
  const gameName = game.data?.name ?? null;
  const canAsk = (game.data?.manuals.length ?? 0) > 0;
  const { gameIds: processingGameIds } = useProcessingManuals();
  // null mientras el detalle del juego no ha cargado. No marcamos una cita como
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
  // El servidor ya incluye los turnos nuevos al refrescar. Dedupe por id.
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
    signal.throwIfAborted();
    // Guardado ya. Un reintento reutiliza la conversación, no crea otra.
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
  // Chatear sigue el juego en el backend. Refresca detalle (botón) y biblioteca.
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
      if (isAbortApiError(err) || askAbortRef.current?.signal.aborted) return;
      setPendingQuestion(null);
      // Si la fuente desapareció, refresca el juego para deshabilitar el composer.
      if (err instanceof ApiError && err.view.code === 'no_manual_sources') {
        queryClient.invalidateQueries({ queryKey: gameDetailKey(gameId) }).catch(() => undefined);
      }
      // Recupera la pregunta en el composer para reintentar sin reescribirla.
      setDraft((current) => (current.length > 0 ? current : question));
      toastApiError(err, 'ask-error', {
        title: <LiveTrans ns="chat" i18nKey="error.request.title" />,
        id: 'ask-error-unknown',
        description: <LiveTrans ns="chat" i18nKey="error.request.description" />,
      });
    },
    onSuccess: (data) => {
      if (askAbortRef.current?.signal.aborted) return;
      setPendingQuestion(null);
      setTurns((prev) => [...prev, data.user_message, data.assistant_message]);
      setAnimateId(completedAssistantAnimationId(data.assistant_message));
      setConversationId(data.conversation.id);
      refreshAfterTurn(queryClient, data);
      // Fija ?c en la URL (replace). Refrescar reabre esta misma conversación.
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
  const { q, c } = Route.useSearch();
  const [session, setSession] = useState(() => ({
    gameId,
    q,
    c,
    conversationId: c ?? null,
    revision: 0,
  }));
  const setConversationId = useCallback((conversationId: string | null) => {
    setSession((current) => ({ ...current, conversationId }));
  }, []);

  if (session.gameId !== gameId || session.c !== c || session.q !== q) {
    // Quitar la pregunta consumida o fijar el id recién creado conserva el chat.
    // Otra conversación o juego tiene su propio borrador y su propia petición.
    const sameSession =
      session.gameId === gameId &&
      q === undefined &&
      ((c ?? null) === session.conversationId || (c === session.c && session.q !== undefined));
    setSession({
      gameId,
      q,
      c,
      conversationId: sameSession ? session.conversationId : (c ?? null),
      revision: session.revision + (sameSession ? 0 : 1),
    });
  }

  return (
    <ChatSessionScreen
      key={session.revision}
      gameId={gameId}
      initialQ={q}
      initialC={c}
      conversationId={session.conversationId}
      setConversationId={setConversationId}
    />
  );
}

function ChatSessionScreen({
  gameId,
  initialQ,
  initialC,
  conversationId,
  setConversationId,
}: Readonly<{
  gameId: string;
  initialQ?: string;
  initialC?: string;
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
}>) {
  const { t: tChat } = useTranslation('chat');
  const { t: tShell } = useTranslation('shell');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  // Id de la última respuesta recién llegada. Solo esa se escribe letra a letra.
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

  // Envía ?q una vez cuando hay manuales y lo retira de la URL.
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

  const waitingForReply = askMutation.isPending || hasPendingAssistant;
  const sendPending = waitingForReply && canAsk;

  const scrollToLatest = useEffectEvent(() => {
    if (messages.length === 0 && pendingQuestion === null) {
      scrollRef.current?.scrollTo({ top: 0 });
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
  });
  // Los mensajes nuevos siguen el fondo. Cambiar la preferencia no cambia la lectura.
  useEffect(() => {
    scrollToLatest();
  }, [messages.length, pendingQuestion, askMutation.isPending, hasPendingAssistant]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (reducedMotion && viewport) {
      viewport.scrollTo({ top: viewport.scrollTop, behavior: 'instant' });
    }
  }, [reducedMotion]);

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
  // Conserva el título provisional hasta recibir el nombre de la conversación.
  const convSummary = useConversationSummary(conversationId, conversations.data);
  const titleTarget = convSummary?.title ?? tChat('fallback.conversationTitle');

  // Mirar el chat lo marca como leído (su updated_at actual). Si la respuesta se
  // completa estando aquí, el poll lo actualiza y la conversación sigue leída.
  const seenAt = convSummary?.updated_at;
  useMarkConversationSeen(conversationId, seenAt);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={tChat('navigation.chat')}
        trail={[
          { label: tShell('navigation.library'), link: linkOptions({ to: '/history' }) },
          ...gameCrumb,
        ]}
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
  const { t } = useTranslation('chat');

  return (
    <div className="page-frame py-5">
      <SkeletonSwap pending={historyLoading && !pendingQuestion} skeleton={<HistorySkeleton />}>
        <div className="flex flex-col gap-4" {...tourTarget('chat-messages')}>
          {historyError ? (
            <p className="py-6 text-center text-sm text-fg-3">{t('error.history')}</p>
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
            <BotStatusBubble label={t('status.writing')} visibleLabel={false} />
          ) : null}
        </div>
      </SkeletonSwap>
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
  const { t } = useTranslation('chat');
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest<HTMLElement>('[data-app-shell]');
    if (!bar || !shell) return;
    const syncHeight = () => {
      shell.style.setProperty('--chat-composer-height', `${bar.getBoundingClientRect().height}px`);
    };
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(bar, { box: 'border-box' });
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--chat-composer-height');
    };
  }, []);

  const placeholder = canAsk
    ? t('composer.placeholder', { gameName: gameName ?? t('fallback.gameName') })
    : t('composer.disabledPlaceholder');

  return (
    <div
      ref={barRef}
      className="shrink-0 border-t border-border bg-bg pt-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
    >
      <div className="page-frame">
        {canAsk ? null : <SourcesUnavailableNotice />}
        <div {...tourTarget('chat-composer')}>
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
    </div>
  );
}

/** Avatar circular del bot. Ficha de la marca sobre un disco ámbar claro. */
function ChatBotAvatar({ size = 34 }: Readonly<{ size?: number }>) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full border border-border bg-primary-100 text-primary-700"
      style={{ width: size, height: size }}
    >
      {/* La masa visual de la ficha cae abajo. La subimos un pelo para centrarla. */}
      <span
        className="grid place-items-center"
        style={{ transform: `translateY(-${Math.max(1, Math.round(size * 0.035))}px)` }}
      >
        <Meeple size={Math.round(size * 0.62)} color="currentColor" />
      </span>
    </span>
  );
}

/** Cabecera del chat. Portada + título de la conversación + juego + "Nueva". */
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
  const { t } = useTranslation('chat');
  // El título se reescribe (borrar + teclear) cuando el backend nombra la conversación.
  const shownTitle = useRetypingTitle(title);
  return (
    <div className="shrink-0 border-b border-border bg-bg">
      <div className="page-frame flex items-center gap-3 py-3">
        {gameName ? (
          <GameCover name={gameName} size={38} radius={9} processing={processing} />
        ) : null}
        <div className="min-w-0 flex-1">
          {/* El espacio fijo evita que la línea de abajo salte mientras se borra. */}
          <p className="truncate font-display text-[15px] font-bold text-fg md:text-base">
            {shownTitle || ' '}
          </p>
          <p className="mono mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-3">
            <Meeple size={11} color="currentColor" />
            <span className="truncate">{gameName ?? t('fallback.gameName')}</span>
          </p>
        </div>
        {showNew ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNew}
            className="h-11 min-w-11 shrink-0 rounded-lg"
            aria-label={t('aria.newConversation')}
            {...tourTarget('chat-new')}
          >
            <PlusIcon data-icon-motion="plus" aria-hidden="true" size={18} className="shrink-0" />
            <span className="hidden sm:inline">{t('actions.new')}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Estado vacío. En vez de un lienzo en blanco, guía con preguntas-tarjeta. */
function ChatWelcome({
  gameName,
  onPick,
}: Readonly<{ gameName: string | null; onPick: (q: string) => void }>) {
  const { t } = useTranslation('chat');

  return (
    <div className="page-frame flex min-h-full flex-col items-center justify-center py-8 text-center">
      <ChatBotAvatar size={64} />
      <h2 className="mt-3.5 font-display text-2xl font-extrabold tracking-tight text-fg">
        <Trans
          ns="chat"
          i18nKey="welcome.title"
          values={{ gameName: gameName ?? t('fallback.gameName') }}
        />
      </h2>
      <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-fg-2">
        {t('welcome.description')}
      </p>
      <div className="mt-6 w-full max-w-xl">
        <p className="mono mb-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-fg-3">
          {t('welcome.try')}
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2" {...tourTarget('chat-suggestions')}>
          {WELCOME_SUGGESTIONS.map((key) => {
            const question = t(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onPick(question)}
                className="group flex items-center gap-3 rounded-[14px] border border-border bg-card px-[15px] py-[13px] text-left text-sm font-semibold text-fg shadow-xs transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-primary-100 text-primary-700">
                  <SparkleIcon size={15} aria-hidden="true" />
                </span>
                <span className="flex-1 transition-colors group-hover:text-primary-700">
                  {question}
                </span>
                <CaretRightIcon
                  data-icon-motion="forward"
                  size={16}
                  className="shrink-0 text-fg-3"
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Conversación sin mensajes de un juego que ya no tiene manuales. Solo lectura. */
function ReadOnlyEmpty({ gameName }: Readonly<{ gameName: string | null }>) {
  const { t } = useTranslation('chat');

  return (
    <div className="page-frame flex min-h-full flex-col items-center justify-center py-8 text-center">
      <ChatBotAvatar size={64} />
      <h2 className="mt-3.5 font-display text-2xl font-extrabold tracking-tight text-fg">
        {t('readOnly.title')}
      </h2>
      <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-fg-2">
        <Trans
          ns="chat"
          i18nKey="readOnly.description"
          values={{ gameName: gameName ?? t('fallback.gameName') }}
        />
      </p>
    </div>
  );
}

/** Aviso sobre el composer cuando el juego se quedó sin manuales que citar. */
function SourcesUnavailableNotice() {
  const { t } = useTranslation('chat');

  return (
    <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-border-strong bg-surface px-3.5 py-2.5 text-[13px] leading-snug text-fg-2">
      <FileTextIcon size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-fg-3" />
      <span>{t('readOnly.notice')}</span>
    </div>
  );
}

function UserBubble({ content }: Readonly<{ content: string }>) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[min(90%,65ch)] whitespace-pre-wrap break-words rounded-2xl bg-primary px-[15px] py-[11px] text-[15px] leading-normal text-fg-inv shadow-xs"
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
  const { t } = useTranslation('chat');
  const [arrival, setArrival] = useState({ status: msg.status, reveal: false });
  if (arrival.status !== msg.status) {
    setArrival({
      status: msg.status,
      reveal: arrival.status === 'pending' && msg.status === 'completed',
    });
  }
  const ready = msg.status === 'completed';
  const revealing = (animate || arrival.reveal) && ready;
  const { shown, done } = useTypewriter(msg.content, revealing);

  // Mientras se escribe, seguimos pegados al fondo.
  useEffect(() => {
    if (revealing) onReveal();
  }, [shown, revealing, onReveal]);

  if (msg.status === 'pending') {
    return <BotStatusBubble label={t('status.generating')} visibleLabel={false} />;
  }
  if (msg.status === 'failed') {
    return <BotStaticBubble tone="error">{t('error.assistantFailed')}</BotStaticBubble>;
  }

  return (
    <div className="group flex items-start gap-[11px]">
      <ChatBotAvatar />
      <div className="min-w-0 max-w-prose">
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
          'min-w-0 max-w-prose rounded-2xl border px-4 py-[13px] text-[15px] leading-relaxed shadow-xs',
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
  const { t } = useTranslation('chat');
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      clearTimeout(resetTimer.current);
      setCopied(true);
      resetTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      clearTimeout(resetTimer.current);
      setCopied(false);
      toast.error(<LiveTrans ns="chat" i18nKey="feedback.copy.failure" />, { id: 'copy-answer' });
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        copy().catch(() => undefined);
      }}
      aria-label={t('aria.copyAnswer')}
      data-copied={copied}
      className="mt-1.5 grid size-11 place-items-center rounded-lg text-fg-3 transition-[color,opacity,scale] hover:text-fg-2 motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:[@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 data-[copied=true]:opacity-100"
    >
      <span className="state-icon" data-active={copied} aria-hidden="true">
        <CopyIcon size={14} />
        <CheckIcon size={14} className="text-success" />
      </span>
      <span role="status" className="sr-only">
        {copied ? t('feedback.copy.success') : ''}
      </span>
    </button>
  );
}

/** Conserva una referencia por manual y página, aunque compartan nombre o usuario. */
function SourceChips({
  sources,
  availableManualIds,
}: Readonly<{ sources: AnswerSource[]; availableManualIds: ReadonlySet<string> | null }>) {
  const { t } = useTranslation('chat');
  const { user } = useAuth();
  const headingId = useId();
  const byPage = new Map<string, AnswerSource>();
  for (const source of sources) {
    const key = `${source.manual_id}:${source.page}`;
    if (!byPage.has(key)) byPage.set(key, source);
  }
  const pages = [...byPage.entries()].sort((a, b) => a[1].page - b[1].page);
  return (
    <div
      className="mt-[13px] border-t border-dashed border-border-strong pt-2.5"
      {...tourTarget('chat-sources')}
    >
      <p id={headingId} className="mb-1.5 text-xs font-medium text-fg-3">
        {t('sources.heading')}
      </p>
      <ul aria-labelledby={headingId} className="flex flex-wrap items-center gap-x-0.5 gap-y-1.5">
        {pages.map(([key, source]) => (
          <li key={key} className="relative flex items-center hover:z-10 focus-within:z-10">
            <SourceRef
              source={source}
              available={availableManualIds === null || availableManualIds.has(source.manual_id)}
              currentUser={user}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Aísla el gesto del avatar del hover que muestra el botón de copiar.
const SOURCE_AVATAR =
  'group/source relative inline-grid size-6 min-h-6 min-w-6 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card pointer-coarse:min-h-11 pointer-coarse:min-w-11';

const SOURCE_AVATAR_MOTION =
  'transition-transform duration-150 ease-[var(--ease-mn)] motion-reduce:transition-none group-hover/source:scale-[1.04] group-focus-visible/source:scale-[1.04] group-aria-expanded/source:scale-[1.04]';

// La fuente se puede abrir mientras siga disponible para este usuario.
function SourceRef({
  source,
  available,
  currentUser,
}: Readonly<{
  source: AnswerSource;
  available: boolean;
  currentUser: ReturnType<typeof useAuth>['user'];
}>) {
  const { t } = useTranslation('chat');
  const provenanceId = useId();
  const { page } = source;
  const title = source.manual_title ?? t('sources.unnamed');
  const uploadedBy = useUploadedByText(source.author_name);
  const provenance = source.is_own ? t('sources.own') : uploadedBy;
  const reason = available ? null : t('sources.unavailable');
  const details = (
    <>
      <span className="block font-semibold [overflow-wrap:anywhere]">{title}</span>
      <span className="block">{t('sources.page', { page })}</span>
      {reason ? <span className="block opacity-80">{reason}</span> : null}
      <span className="block opacity-80 [overflow-wrap:anywhere]">{provenance}</span>
    </>
  );
  const hiddenProvenance = (
    <span id={provenanceId} className="sr-only">
      {provenance}
    </span>
  );

  if (available) {
    return (
      <>
        <Tooltip content={details} touch="confirm" touchHint={t('sources.tapAgain')}>
          <Link
            to="/manual/$manualId"
            params={{ manualId: source.manual_id }}
            search={{ page }}
            aria-label={t('aria.pageLink', { page, title })}
            aria-describedby={provenanceId}
            className={SOURCE_AVATAR}
          >
            {source.is_own && currentUser ? (
              <Avatar
                name={currentUser.username || currentUser.email}
                size={24}
                color={currentUser.avatar_color}
                figure={currentUser.avatar_figure}
                className={cn('ring-2 ring-card', SOURCE_AVATAR_MOTION)}
              />
            ) : (
              <UploaderAvatar authorName={source.author_name} className={SOURCE_AVATAR_MOTION} />
            )}
          </Link>
        </Tooltip>
        {hiddenProvenance}
      </>
    );
  }

  return (
    <>
      <Tooltip content={details} touch>
        <button
          type="button"
          aria-label={t('aria.page', { page, title, reason })}
          aria-describedby={provenanceId}
          className={cn(SOURCE_AVATAR, 'cursor-help')}
        >
          {source.is_own && currentUser ? (
            <Avatar
              name={currentUser.username || currentUser.email}
              size={24}
              color={currentUser.avatar_color}
              figure={currentUser.avatar_figure}
              className={cn('ring-2 ring-card', !available && 'opacity-60', SOURCE_AVATAR_MOTION)}
            />
          ) : (
            <UploaderAvatar
              authorName={source.author_name}
              muted={!available}
              className={SOURCE_AVATAR_MOTION}
            />
          )}
        </button>
      </Tooltip>
      {hiddenProvenance}
    </>
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
