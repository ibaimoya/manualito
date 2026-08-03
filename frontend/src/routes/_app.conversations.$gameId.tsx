import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, MoreVertical, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
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
import {
  AnsweringLine,
  ConversationActivityIcon,
} from '@/features/conversations/ConversationActivityIcon';
import { GameCover } from '@/features/games/GameCover';
import { useProcessingManuals } from '@/features/manual/use-manuals';
import { gameDetailQueryOptions } from '@/features/games/use-games';
import {
  conversationsKey,
  conversationsQueryOptions,
  useConversationsRead,
} from '@/features/conversations/use-conversations';
import { conversationsApi, type ConversationSummary } from '@/shared/api/conversations';
import { formatRelative, formatShortDate } from '@/shared/lib/relativeDate';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/conversations/$gameId')({
  component: ConversationsScreen,
});

const TITLE_MAX = 80;

function ConversationsScreen() {
  const { gameId } = Route.useParams();
  const { t } = useTranslation('conversations');
  const game = useQuery(gameDetailQueryOptions(gameId));
  const conversations = useQuery(conversationsQueryOptions(gameId));
  const [filter, setFilter] = useState('');

  const gameName = game.data?.name ?? t('fallback.gameName');
  const canAsk = (game.data?.manuals.length ?? 0) > 0;
  const { gameIds } = useProcessingManuals();
  const { isUnread } = useConversationsRead();

  const all = useMemo(() => conversations.data ?? [], [conversations.data]);
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle.length === 0
        ? all
        : all.filter((item) => (item.title ?? '').toLowerCase().includes(needle)),
    [all, needle],
  );
  const counter =
    needle.length > 0
      ? t('counter.filtered', { visible: visible.length, total: all.length })
      : all.length > 0
        ? t('counter.saved', { count: all.length })
        : null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={t('page.title')}
        trail={[
          { label: t('page.breadcrumbLibrary'), link: linkOptions({ to: '/history' }) },
          { label: gameName, link: linkOptions({ to: '/game/$gameId', params: { gameId } }) },
        ]}
        actions={
          counter === null ? null : <span className="mono text-[11px] text-fg-3">{counter}</span>
        }
      />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-5 md:px-6">
        <header className="mb-4 flex items-center gap-3.5">
          <GameCover name={gameName} size={44} radius={12} processing={gameIds.has(gameId)} />
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
              {t('header.subtitle', { gameName })}
            </p>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
              {t('page.title')}
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
              placeholder={t('page.filterPlaceholder')}
              aria-label={t('page.filterLabel')}
              className="pl-10"
            />
          </div>
        ) : null}

        {conversations.isPending ? <ListSkeleton /> : null}
        {/* Un refetch fallido deja isError con data en cache: mejor lo cacheado. */}
        {conversations.isError && conversations.data === undefined ? (
          <Card className="bg-surface p-5 text-sm text-fg-2">{t('error.load')}</Card>
        ) : null}

        {conversations.isSuccess && all.length === 0 ? (
          <EmptyState gameName={gameName} gameId={gameId} canAsk={canAsk} />
        ) : null}

        {conversations.isSuccess && all.length > 0 && visible.length === 0 ? (
          <NoResults filter={filter} onClear={() => setFilter('')} />
        ) : null}

        <ul className="flex flex-col gap-2.5" aria-label={t('page.listLabel')}>
          {visible.map((conversation) => (
            <ConversationCard
              key={conversation.id}
              conversation={conversation}
              gameId={gameId}
              unread={isUnread(conversation)}
            />
          ))}
        </ul>

        {!canAsk || all.length === 0 ? null : (
          <Link
            to="/chat/$gameId"
            params={{ gameId }}
            search={{}}
            className="fixed bottom-6 right-5 z-10 inline-flex items-center gap-2 rounded-full bg-primary px-5 font-body text-[15px] font-bold text-fg-inv shadow-lg transition-transform hover:scale-[1.03] md:right-10"
            style={{ height: 52 }}
          >
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            {t('actions.newConversation')}
          </Link>
        )}
      </div>
    </div>
  );
}

function ConversationCard({
  conversation,
  gameId,
  unread,
}: Readonly<{
  conversation: ConversationSummary;
  gameId: string;
  unread: boolean;
}>) {
  const { t } = useTranslation('conversations');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const title = conversation.title ?? t('fallback.conversationTitle');
  const pending = conversation.has_pending_reply;

  function openChat(): void {
    navigate({
      to: '/chat/$gameId',
      params: { gameId },
      search: { c: conversation.id },
    }).catch(() => undefined);
  }

  const remove = useMutation({
    mutationFn: () => conversationsApi.remove(conversation.id),
    onSuccess: () => {
      setDeleteOpen(false);
      toast.success(t('toast.deleteSuccess'), { id: 'conversation-delete' });
    },
    onError: () =>
      toast.error(t('toast.deleteError'), {
        id: 'conversation-delete',
        description: t('toast.retry'),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  return (
    <li className={cn('group', remove.isPending && 'pointer-events-none opacity-50')}>
      <Card
        style={pending ? { borderColor: 'transparent' } : undefined}
        className={cn(
          'relative flex items-start gap-3 p-3.5',
          'transition-[translate,box-shadow,border-color] duration-150 ease-[var(--ease-mn)]',
          !pending && 'hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm',
          'active:translate-y-0 active:shadow-xs',
        )}
      >
        <ConversationActivityIcon
          hasPendingReply={pending}
          unread={unread}
          size="md"
          tone="accent"
          className="relative z-[1] transition-[scale] duration-150 ease-[var(--ease-mn)] group-hover:scale-105"
        />
        {/* Botón principal: su ::after se estira sobre toda la card, así que se
            abre pulsando cualquier punto (no solo el texto); el ⋮ va por encima. */}
        <button
          type="button"
          onClick={openChat}
          className={cn(
            'relative z-[1] min-w-0 flex-1 cursor-pointer text-left',
            "after:absolute after:inset-0 after:rounded-2xl after:content-['']",
            'focus-visible:outline-none focus-visible:after:shadow-[var(--m-shadow-ring-primary)]',
          )}
        >
          <span className="flex items-baseline gap-2.5">
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-fg">
              {title}
            </span>
            {pending ? null : (
              <span className="mono shrink-0 text-[11px] text-fg-3">
                {formatRelative(conversation.updated_at)}
              </span>
            )}
          </span>
          {pending ? (
            <span className="mt-1 block">
              <AnsweringLine />
            </span>
          ) : (
            <span className="mt-0.5 block text-xs text-fg-3">
              {t('conversation.openedOn', {
                date: formatShortDate(conversation.created_at),
              })}
            </span>
          )}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('aria.optionsFor', { title })}
              className="relative z-10 grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-surface hover:text-fg data-[state=open]:bg-surface"
            >
              <MoreVertical size={17} strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={openChat}>
              <BookOpen size={16} strokeWidth={2} aria-hidden="true" />
              {t('actions.open')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil size={16} strokeWidth={2} aria-hidden="true" />
              {t('actions.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem danger onSelect={() => setDeleteOpen(true)}>
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
              {t('actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {pending ? <span className="proc-border" aria-hidden="true" /> : null}
      </Card>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        conversation={conversation}
        gameId={gameId}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader
          title={t('deleteDialog.title')}
          description={t('deleteDialog.description')}
          onClose={() => setDeleteOpen(false)}
        />
        <DialogBody>
          <div className="rounded-2xl border border-error bg-error-bg p-4 text-sm leading-relaxed text-fg">
            <p className="font-semibold">{t('deleteDialog.irreversible')}</p>
            <p className="mt-1">
              <Trans
                ns="conversations"
                i18nKey="deleteDialog.body"
                values={{ title }}
                components={{ b: <strong /> }}
              />
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              <Trash2 size={16} strokeWidth={2} />
              {t('actions.deleteConversation')}
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
  const { t } = useTranslation('conversations');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <DialogHeader
        title={t('renameDialog.title')}
        description={t('renameDialog.description')}
        onClose={() => onOpenChange(false)}
      />
      <DialogBody>
        <RenameForm
          conversation={conversation}
          gameId={gameId}
          inputRef={inputRef}
          onClose={() => onOpenChange(false)}
        />
      </DialogBody>
    </Dialog>
  );
}

/**
 * El borrador vive aquí, dentro del contenido que Radix desmonta al cerrar:
 * cada apertura arranca con el título actual, sin borradores abandonados.
 */
function RenameForm({
  conversation,
  gameId,
  inputRef,
  onClose,
}: Readonly<{
  conversation: ConversationSummary;
  gameId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}>) {
  const { t } = useTranslation('conversations');
  const qc = useQueryClient();
  const inputId = useId();
  const [title, setTitle] = useState(conversation.title ?? '');

  const rename = useMutation({
    mutationFn: (next: string) => conversationsApi.rename(conversation.id, next),
    onSuccess: () => {
      onClose();
      toast.success(t('toast.renameSuccess'), { id: 'conversation-rename' });
    },
    onError: () =>
      toast.error(t('toast.renameError'), {
        id: 'conversation-rename',
        description: t('toast.retry'),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: conversationsKey(gameId) }),
  });

  const trimmed = title.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length > 0) rename.mutate(trimmed);
      }}
    >
      <label htmlFor={inputId} className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-fg">{t('renameDialog.label')}</span>
        <span className="text-xs text-fg-3">
          {t('renameDialog.maxLength', { count: TITLE_MAX })}
        </span>
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
        {t('renameDialog.aiHint')}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" disabled={trimmed.length === 0} loading={rename.isPending}>
          {t('actions.save')}
        </Button>
      </div>
    </form>
  );
}

function EmptyState({
  gameName,
  gameId,
  canAsk,
}: Readonly<{ gameName: string; gameId: string; canAsk: boolean }>) {
  const { t } = useTranslation('conversations');

  return (
    <div className="rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface px-6 py-11 text-center">
      <h2 className="font-display text-lg font-bold text-fg">{t('empty.title')}</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-fg-2">
        {t('empty.pageDescription', { gameName })}
      </p>
      {canAsk ? (
        <Button asChild className="mt-4">
          <Link to="/chat/$gameId" params={{ gameId }} search={{}}>
            <Plus size={16} strokeWidth={2} />
            {t('actions.newConversation')}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function NoResults({ filter, onClear }: Readonly<{ filter: string; onClear: () => void }>) {
  const { t } = useTranslation('conversations');

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-surface text-fg-3">
        <Search size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="font-display text-base font-bold text-fg">
        {t('noResults.title', { filter: filter.trim() })}
      </p>
      <p className="text-sm text-fg-2">{t('noResults.description')}</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onClear}>
        {t('actions.clearSearch')}
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
