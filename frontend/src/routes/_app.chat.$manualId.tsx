import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { api, apiErrorNotification, isAbortApiError } from '@/shared/api/client';
import { storage, type QAMessage } from '@/shared/lib/storage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Meeple } from '@/shared/components/Brand';
import { cn } from '@/shared/lib/cn';

// max(500) limita la longitud del search param `q` a la misma cota que el
// backend (500 chars en `QuestionRequest`).  Sin esto un atacante podría
// pegar una URL `?q=…` de 100KB y reventar el LLM o el URL parser.
const chatSearchSchema = z.object({
  q: z.string().min(1).max(500).optional(),
});

export const Route = createFileRoute('/_app/chat/$manualId')({
  validateSearch: chatSearchSchema,
  component: ChatScreen,
});

function ChatScreen() {
  const { manualId } = Route.useParams();
  const initialQ = Route.useSearch().q;
  const navigate = useNavigate();
  // Lazy initializer: lee del localStorage en el primer render para
  // evitar el flash de "no hay mensajes" mientras un useEffect carga.
  const [messages, setMessages] = useState<QAMessage[]>(() => storage.listQA(manualId));
  const [draft, setDraft] = useState('');
  const initialQueueRef = useRef<string | null>(initialQ ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const result = storage.getResult(manualId);
  const manualName = result?.name ?? 'Manual';

  // Marca el manual como recién abierto (touch updates last_opened_at).
  useEffect(() => {
    storage.touchManual(manualId);
  }, [manualId]);

  // AbortController para cortar la petición al LLM si el usuario navega
  // fuera del chat antes de que termine.  El LLM puede
  // tardar 30-60s — sin abort, la mutation completaría tras unmount y
  // escribiría en localStorage sin feedback visual.
  const askAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => askAbortRef.current?.abort(), []);

  const askMutation = useMutation({
    mutationFn: async (question: string) => {
      askAbortRef.current?.abort();
      askAbortRef.current = new AbortController();
      const signal = askAbortRef.current.signal;
      const manual = await api.getManual(manualId, signal);
      return api.askGame(manual.game_id, question, undefined, signal);
    },
    onError: (err) => {
      if (isAbortApiError(err)) return;
      const notification = apiErrorNotification(err, 'ask-error', {
        title: 'No hemos podido responder',
        id: 'ask-error-unknown',
        description: 'Inténtalo de nuevo en un momento.',
      });
      toast.error(notification.title, {
        id: notification.id,
        description: notification.description,
      });
    },
    onSuccess: (data) => {
      const botMsg: QAMessage = {
        id: crypto.randomUUID(),
        role: 'bot',
        text: data.answer,
        ts: new Date().toISOString(),
      };
      storage.appendQA(manualId, botMsg);
      setMessages((prev) => [...prev, botMsg]);
    },
  });

  function sendQuestion(text: string): void {
    const q = text.trim();
    if (q.length === 0) return;
    const userMsg: QAMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: q,
      ts: new Date().toISOString(),
    };
    storage.appendQA(manualId, userMsg);
    setMessages((prev) => [...prev, userMsg]);
    setDraft('');
    askMutation.mutate(q);
  }

  // Si la URL trae ?q=... y aún no se ha enviado, dispárala una vez.
  // Después de disparar, limpiamos el search param de la URL (replace,
  // no push) para que al refrescar la página NO se re-envíe la
  // pregunta — sería un duplicado fantasma.
  useEffect(() => {
    if (initialQueueRef.current) {
      const q = initialQueueRef.current;
      initialQueueRef.current = null;
      sendQuestion(q);
      // Limpia el ?q de la URL sin recargar.
      navigate({
        to: '/chat/$manualId',
        params: { manualId },
        search: {},
        replace: true,
      }).catch(() => undefined);
    }
    // sendQuestion es estable funcionalmente (cierre sobre manualId), no la
    // metemos como dep para evitar re-disparos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll al final cuando entra un mensaje nuevo.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, askMutation.isPending]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-4xl">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-bg px-2 py-2">
        <Link
          to="/result/$manualId"
          params={{ manualId }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-fg hover:bg-surface"
          aria-label="Volver al resumen"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </Link>
        {/* `min-w-0` necesario dentro del flex para que `truncate` reduzca
            el ancho cuando el nombre es largo, en lugar de empujar el
            badge fuera del header. */}
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-lg font-bold tracking-tight">
          {manualName}
        </h1>
        <Badge tone="success" size="sm" className="shrink-0">
          Listo
        </Badge>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !askMutation.isPending ? (
          <p className="mt-6 text-center text-sm text-fg-3">
            Empieza con una pregunta sobre el manual.
          </p>
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {askMutation.isPending ? <TypingIndicator /> : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(draft);
        }}
        className="sticky bottom-0 border-t border-border bg-bg/95 p-3 backdrop-blur"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2">
          <Input
            preset="chat-message"
            value={draft}
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
            <Send size={17} strokeWidth={2} />
          </Button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ msg }: Readonly<{ msg: QAMessage }>) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {isUser ? null : (
        <div
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center self-end rounded-full border border-border bg-surface-2 text-primary-700"
        >
          <Meeple size={16} color="currentColor" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-4 py-3 text-base leading-relaxed',
          isUser ? 'bg-primary text-fg-inv' : 'bg-surface text-fg border border-border',
        )}
        style={{
          borderTopLeftRadius: isUser ? undefined : 6,
          borderTopRightRadius: isUser ? 6 : undefined,
        }}
      >
        {msg.text}
      </div>
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
