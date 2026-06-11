import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  MessagesSquare,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { GameCover } from '@/features/games/GameCover';
import { gameDetailQueryOptions } from '@/features/games/use-games';
import { conversationsKey, conversationsQueryOptions } from '@/features/conversations/use-conversations';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { formatRelative } from '@/shared/lib/relativeDate';

export const Route = createFileRoute('/_app/conversations/$gameId')({
  component: ConversationsScreen,
});

const TITLE_MAX = 80;

/** Contador del topbar: total guardadas, o «X de N» mientras se filtra. */
function counterLabel(needle: string, visibleCount: number, total: number): string | null {
  if (needle.length > 0) return `${visibleCount} de ${total}`;
  if (total > 0) return `${total} ${total === 1 ? 'guardada' : 'guardadas'}`;
  return null;
}

function ConversationsScreen() {
  const { gameId } = Route.useParams();
  const game = useQuery(gameDetailQueryOptions(gameId));
  const conversations = useQuery(conversationsQueryOptions(gameId));
  const [filter, setFilter] = useState('');

  const gameName = game.data?.name ?? 'Juego';
  const chatManualId =
    game.data?.manuals.find((manual) => manual.is_own)?.id ?? game.data?.manuals[0]?.id ?? null;

  const all = useMemo(() => conversations.data ?? [], [conversations.data]);
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle.length === 0
        ? all
        : all.filter((item) => (item.title ?? '').toLowerCase().includes(needle)),
    [all, needle],
  );
  const counter = counterLabel(needle, visible.length, all.length);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb="Tus conversaciones"
        trail={[
          { label: 'Historial', link: linkOptions({ to: '/history' }) },
          { label: gameName, link: linkOptions({ to: '/game/$gameId', params: { gameId } }) },
        ]}
        back={
          <Link
            to="/game/$gameId"
            params={{ gameId }}
            className="grid size-10 place-items-center rounded-xl text-fg hover:bg-surface"
            aria-label="Volver al juego"
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </Link>
        }
        actions={
          counter === null ? null : <span className="mono text-[11px] text-fg-3">{counter}</span>
        }
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-5 md:px-6">
        <header className="mb-4 flex items-center gap-3.5">
          <GameCover name={gameName} size={44} radius={12} />
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
              {gameName} · Pregunta y repregunta
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
              Tus conversaciones
            </h1>
          </div>
        </header>

        {all.length > 0 ? (
          <div className="relative mb-4">
            <Search
              size={16}
              strokeWidth={2}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
            />
            <Input
              preset="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtra por título…"
              aria-label="Filtrar conversaciones por título"
              className="pl-10"
            />
          </div>
        ) : null}

        {conversations.isPending ? <ListSkeleton /> : null}
        {conversations.isError ? (
          <Card className="bg-surface p-5 text-sm text-fg-2">
            No hemos podido cargar tus conversaciones. Inténtalo de nuevo en un momento.
          </Card>
        ) : null}

        {conversations.isSuccess && all.length === 0 ? (
          <EmptyState gameName={gameName} gameId={gameId} chatManualId={chatManualId} />
        ) : null}

        {conversations.isSuccess && all.length > 0 && visible.length === 0 ? (
          <NoResults filter={filter} onClear={() => setFilter('')} />
        ) : null}

        <ul className="flex flex-col gap-2.5" aria-label="Conversaciones guardadas">
          {visible.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              gameId={gameId}
              chatManualId={chatManualId}
            />
          ))}
        </ul>

        {chatManualId === null || all.length === 0 ? null : (
          <Link
            to="/chat/$manualId"
            params={{ manualId: chatManualId }}
            search={{ g: gameId }}
            className="fixed bottom-6 right-5 z-10 inline-flex items-center gap-2 rounded-full bg-primary px-5 font-body text-[15px] font-bold text-fg-inv shadow-lg transition-transform hover:scale-[1.03] md:right-10"
            style={{ height: 52 }}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Nueva conversación
          </Link>
        )}
      </div>
    </div>
  );
}

function ConversationCard({
  conversation,
  gameId,
  chatManualId,
}: Readonly<{
  conversation: ConversationSummary;
  gameId: string;
  chatManualId: string | null;
}>) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = conversation.title ?? 'Conversación sin título';

  function openChat(): void {
    if (chatManualId === null) return;
    navigate({
      to: '/chat/$manualId',
      params: { manualId: chatManualId },
      search: { c: conversation.id, g: gameId },
    }).catch(() => undefined);
  }

  const remove = useMutation({
    mutationFn: () => conversationsApi.remove(conversation.id),
    onSuccess: () => {
      setDeleteOpen(false);
      toast.success('Conversación borrada', { id: 'conversation-delete' });
    },
    onError: () =>
      toast.error('No hemos podido borrarla', {
        id: 'conversation-delete',
        description: 'Inténtalo de nuevo en un momento.',
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  return (
    <li className={remove.isPending ? 'opacity-50' : undefined}>
      <Card className="flex items-start gap-3 p-3.5 transition-colors hover:border-border-strong">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-100 text-accent"
        >
          <MessagesSquare size={18} strokeWidth={1.9} />
        </span>
        <button type="button" onClick={openChat} className="min-w-0 flex-1 text-left">
          <span className="flex items-baseline gap-2.5">
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-fg">
              {title}
            </span>
            <span className="mono shrink-0 text-[11px] text-fg-3">
              {formatRelative(conversation.updated_at)}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-fg-3">
            abierta el {formatAbsolute(conversation.created_at)}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Opciones de «${title}»`}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-surface hover:text-fg data-[state=open]:bg-surface"
            >
              <MoreVertical size={17} strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={openChat}>
              <BookOpen size={16} strokeWidth={2} aria-hidden="true" />
              Abrir
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil size={16} strokeWidth={2} aria-hidden="true" />
              Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem danger onSelect={() => setDeleteOpen(true)}>
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              Borrar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        conversation={conversation}
        gameId={gameId}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader
          title="Borrar conversación"
          description="Confirma que quieres eliminarla."
          onClose={() => setDeleteOpen(false)}
        />
        <DialogBody>
          <div className="rounded-2xl border border-error bg-error-bg p-4 text-sm leading-relaxed text-fg">
            <p className="font-semibold">Esta acción no se puede deshacer.</p>
            <p className="mt-1">
              Se borrará <strong>«{title}»</strong> con todos sus mensajes. La explicación del
              juego y tus manuales no se tocan.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>
              <Trash2 size={16} strokeWidth={2} />
              Borrar conversación
            </Button>
          </div>
        </DialogBody>
      </Dialog>
    </li>
  );
}

function RenameDialog({
  open,
  onOpenChange,
  conversation,
  gameId,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: ConversationSummary;
  gameId: string;
}>) {
  const qc = useQueryClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(conversation.title ?? '');

  const rename = useMutation({
    mutationFn: (next: string) => conversationsApi.rename(conversation.id, next),
    onSuccess: () => {
      onOpenChange(false);
      toast.success('Conversación renombrada', { id: 'conversation-rename' });
    },
    onError: () =>
      toast.error('No hemos podido renombrarla', {
        id: 'conversation-rename',
        description: 'Inténtalo de nuevo en un momento.',
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  const trimmed = title.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setTitle(conversation.title ?? '');
        onOpenChange(next);
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <DialogHeader
        title="Renombrar conversación"
        description="Un buen título te la devuelve de un vistazo."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed.length > 0) rename.mutate(trimmed);
          }}
        >
          <label
            htmlFor={inputId}
            className="mb-1.5 flex items-baseline justify-between text-sm"
          >
            <span className="font-semibold text-fg">Título de la conversación</span>
            <span className="text-xs text-fg-3">máx. {TITLE_MAX} caracteres</span>
          </label>
          <Input
            id={inputId}
            ref={inputRef}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
          />
          <p className="mt-2.5 flex items-start gap-2 text-xs leading-relaxed text-fg-3">
            <Sparkles size={13} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" />
            Este título lo generó la IA a partir de tu primera pregunta. Cámbialo por lo que te
            resulte más fácil de encontrar.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={trimmed.length === 0} loading={rename.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogBody>
    </Dialog>
  );
}

function formatAbsolute(iso: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

function EmptyState({
  gameName,
  gameId,
  chatManualId,
}: Readonly<{ gameName: string; gameId: string; chatManualId: string | null }>) {
  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface px-6 py-11 text-center">
      <h2 className="font-display text-lg font-bold text-fg">Aún no has preguntado nada</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg-2">
        Cuando preguntes algo sobre {gameName}, guardaremos aquí la conversación con un título
        corto para que la retomes cuando quieras.
      </p>
      {chatManualId === null ? null : (
        <Button asChild className="mt-4">
          <Link to="/chat/$manualId" params={{ manualId: chatManualId }} search={{ g: gameId }}>
            <Plus size={16} strokeWidth={2} />
            Nueva conversación
          </Link>
        </Button>
      )}
    </div>
  );
}

function NoResults({
  filter,
  onClear,
}: Readonly<{ filter: string; onClear: () => void }>) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface text-fg-3">
        <Search size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="font-display text-base font-bold text-fg">Nada con «{filter.trim()}»</p>
      <p className="text-sm text-fg-2">
        Prueba con otra palabra, o pregunta directamente: la IA crea una conversación nueva.
      </p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onClear}>
        Limpiar búsqueda
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}
