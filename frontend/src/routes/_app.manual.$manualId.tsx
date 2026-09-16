import { createFileRoute, linkOptions, useBlocker, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CaretLeftIcon,
  CaretRightIcon,
  ClockIcon,
  FileTextIcon,
  FilesIcon,
  ImagesIcon,
  CircleNotchIcon,
  PencilSimpleIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  UserCheckIcon,
  UserIcon,
  XIcon,
} from '@phosphor-icons/react';
import { TrashIcon } from '@/shared/components/action-icons';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Tooltip } from '@/components/ui/tooltip';
import { AuthorVisibilityDialog } from '@/features/manual/AuthorVisibilityDialog';
import { DuplicatePagesBadge } from '@/features/manual/DuplicatePagesBadge';
import { RenameManualDialog } from '@/features/manual/RenameManualDialog';
import { PageTextCard } from '@/features/manual/PageTextCard';
import { ManualRecovery } from '@/features/manual/ManualRecovery';
import { PageThumbRail } from '@/features/manual/PageThumbRail';
import { useManualProcessing } from '@/features/manual/useManualProcessing';
import { SourceImageViewer } from '@/features/manual/SourceImageViewer';
import { ManualViewSwitch, type ManualView } from '@/features/manual/ManualViewSwitch';
import workspaceStyles from '@/features/manual/manual-workspace.module.css';
import { ViewerControlGlyph } from '@/features/manual/ViewerControlGlyph';
import controlMotion from '@/features/manual/viewer-control-motion.module.css';
import { pageStatus } from '@/features/manual/pageStatus';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { tourTarget } from '@/features/tutorial/targets';
import { useTutorialViews } from '@/features/tutorial/views';
import {
  manualDetailQueryOptions,
  manualsKey,
  useDeleteManual,
} from '@/features/manual/use-manuals';
import { formatLongDate } from '@/shared/lib/relativeDate';
import {
  api,
  ApiError,
  type ManualDetailPage,
  type ManualDetailResponse,
} from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { toastApiError } from '@/shared/lib/toastApiError';
import { LiveTrans } from '@/shared/components/LiveTrans';

export const Route = createFileRoute('/_app/manual/$manualId')({
  // "page" opcional. Las citas del chat abren el manual en la página citada.
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Number(search.page);
    return Number.isInteger(page) && page > 0 ? { page } : {};
  },
  component: ManualDetailScreen,
});

function editErrorToast(error: unknown): void {
  if (error instanceof ApiError && error.status === 409) {
    toast.error(<LiveTrans ns="manual" i18nKey="feedback.edit.busy" />, {
      id: 'page-edit-error',
      description: <LiveTrans ns="manual" i18nKey="feedback.edit.busyHint" />,
    });
    return;
  }
  if (error instanceof ApiError && (error.status === 502 || error.status === 500)) {
    toast.warning(<LiveTrans ns="manual" i18nKey="feedback.edit.pendingIndex" />, {
      id: 'page-edit-error',
      description: <LiveTrans ns="manual" i18nKey="feedback.edit.pendingIndexDescription" />,
    });
    return;
  }
  toastApiError(error, 'page-edit-error', {
    title: <LiveTrans ns="manual" i18nKey="feedback.edit.failedTitle" />,
    id: 'page-edit-error-unknown',
    description: <LiveTrans ns="manual" i18nKey="feedback.edit.failedDescription" />,
  });
}

/** El foco está en un campo de texto. No robar las flechas para navegar. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

/** Página inicial. La citada por el chat si existe en el manual. Si no, la primera. */
function resolveInitialPage(
  pages: readonly ManualDetailPage[],
  initialPage: number | undefined,
): number {
  if (initialPage !== undefined && pages.some((item) => item.page_number === initialPage)) {
    return initialPage;
  }
  return pages[0]!.page_number;
}

function defaultView(manual: ManualDetailResponse, pageNumber: number): ManualView {
  if (manual.is_own) return 'compare';
  const page = manual.pages.find((item) => item.page_number === pageNumber);
  return page?.image_available ? 'original' : 'text';
}

function pageCapabilities(page: ManualDetailPage, manual: ManualDetailResponse, busy: boolean) {
  const status = pageStatus(page);
  return {
    isFailed: status.key === 'failed',
    isProcessingPage: status.key === 'processing',
    canEdit:
      manual.is_own && manual.visibility === 'private' && !busy && status.key !== 'processing',
    hasConfidence: page.ocr_lines.some((line) => line.confidence != null),
  };
}

/** Atajos ← → para cambiar de página (no mientras se edita ni desde un input). */
function usePageArrowKeys(
  active: boolean,
  pageNumber: number,
  onGo: (pageNumber: number) => void,
): void {
  const goToPage = useEffectEvent(onGo);
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (
        !active ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isTypingTarget(event.target)
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, [role=radio], [role=dialog], [data-image-canvas]')
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(pageNumber + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    }
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [active, pageNumber]);
}

/** Datos del archivo y estado de la publicación. */
function ManualMetaRow({
  createdAt,
  sourceIsPdf,
  pageCount,
  duplicateCount,
  sharing,
}: Readonly<{
  createdAt: string;
  sourceIsPdf: boolean;
  pageCount: number;
  duplicateCount: number;
  sharing?: ReactNode;
}>) {
  const { t } = useTranslation('manual');
  return (
    <div
      className={cn(
        workspaceStyles.metadata,
        'mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-fg-2',
      )}
    >
      <span className="hidden items-center gap-1.5 @2xl/app:inline-flex">
        <ClockIcon size={14} aria-hidden="true" />
        {t('meta.uploaded', { date: formatLongDate(createdAt) })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {sourceIsPdf ? (
          <FileTextIcon size={14} aria-hidden="true" />
        ) : (
          <ImagesIcon size={14} aria-hidden="true" />
        )}{' '}
        {sourceIsPdf ? t('meta.format.pdf') : t('meta.format.photos')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FilesIcon size={14} aria-hidden="true" /> {t('meta.pages', { count: pageCount })}
      </span>
      {duplicateCount > 0 ? <DuplicatePagesBadge count={duplicateCount} /> : null}
      {sharing}
    </div>
  );
}

function SharingStateButton({
  anonymous,
  onClick,
}: Readonly<{ anonymous: boolean; onClick: () => void }>) {
  const { t } = useTranslation('manual');
  const Icon = anonymous ? UserIcon : UserCheckIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(
        anonymous ? 'details.sharing.switchToNamed' : 'details.sharing.switchToAnonymous',
      )}
      className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-sm text-left text-fg-2 underline decoration-border-strong decoration-dotted underline-offset-[3px] transition-colors hover:text-fg hover:decoration-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 pointer-coarse:min-h-11"
    >
      <Icon size={14} aria-hidden="true" />
      <span>{t(anonymous ? 'details.sharing.anonymous' : 'details.sharing.named')}</span>
    </button>
  );
}

function ManualDetailScreen() {
  const { t } = useTranslation('manual');
  const { manualId } = Route.useParams();
  const { page } = Route.useSearch();
  const detail = useQuery(manualDetailQueryOptions(manualId));
  const manual = detail.data;
  const title = manual?.title ?? manual?.game_name ?? t('navigation.manual');

  return (
    <div className="flex h-dvh min-h-[36rem] flex-col overflow-hidden bg-bg">
      <ScreenTopBar
        crumb={title === manual?.game_name ? t('navigation.extractedText') : title}
        trail={
          manual
            ? [
                { label: t('navigation.library'), link: linkOptions({ to: '/history' }) },
                {
                  label: manual.game_name,
                  link: linkOptions({ to: '/game/$gameId', params: { gameId: manual.game_id } }),
                },
              ]
            : undefined
        }
      />
      <SkeletonSwap
        pending={detail.isPending && detail.errorUpdateCount === 0}
        skeleton={<DetailSkeleton />}
        className="min-h-0 flex-1 [&>div]:min-h-0"
      >
        {manual && manual.pages.length > 0 ? (
          <ManualDetailLoaded key={manual.id} manual={manual} initialPage={page} />
        ) : (
          <ManualRecovery query={detail} />
        )}
      </SkeletonSwap>
    </div>
  );
}

function ManualDetailLoaded({
  manual,
  initialPage,
}: Readonly<{ manual: ManualDetailResponse; initialPage?: number }>) {
  const { t } = useTranslation('manual');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pages = manual.pages;
  const duplicateCount = manual.is_own
    ? pages.filter((item) => item.dedup_status === 'reused').length
    : 0;
  const [activePage, setActivePage] = useState(() => resolveInitialPage(pages, initialPage));
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const [view, setView] = useState<ManualView>(() => defaultView(manual, activePage));
  const [dirty, setDirty] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<number | 'cancel' | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const search = usePageSearch(pages);
  const detailKey = manualDetailQueryOptions(manual.id).queryKey;

  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const { busy, processing } = useManualProcessing(manual);
  const editing = editingPage === page.page_number;

  const saveText = useMutation({
    mutationFn: ({ pageNumber, text }: { pageNumber: number; text: string }) =>
      api.editPageText(manual.id, pageNumber, text),
    onSuccess: (updated) => {
      qc.setQueryData<ManualDetailResponse>(detailKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((item) =>
                item.page_number === updated.page_number ? updated : item,
              ),
            }
          : old,
      );
      qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
      setEditingPage(null);
      setDirty(false);
      editButtonRef.current?.focus({ preventScroll: true });
      toast.success(t('feedback.edit.saved'), {
        id: 'page-edit-ok',
        description: t('feedback.edit.savedDescription'),
      });
    },
    onError: (error) => {
      editErrorToast(error);
      if (error instanceof ApiError && (error.status === 502 || error.status === 500)) {
        qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
        setEditingPage(null);
        setDirty(false);
      }
    },
  });

  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty || saveText.isPending,
    enableBeforeUnload: dirty || saveText.isPending,
    withResolver: true,
  });

  const reprocess = useMutation({
    mutationFn: (pageNumber?: number) =>
      pageNumber == null
        ? api.reprocessManual(manual.id)
        : api.reprocessPage(manual.id, pageNumber),
    onSuccess: () => {
      setReprocessOpen(false);
      qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
      // Reprocesar vuelve a poner el manual en "indexing". Refresca la lista para
      // que las ruletas contextuales de la biblioteca vuelvan a encenderse.
      qc.invalidateQueries({ queryKey: manualsKey }).catch(() => undefined);
    },
    onError: (error) => {
      setReprocessOpen(false);
      if (error instanceof ApiError && error.status === 409) {
        toast.error(<LiveTrans ns="manual" i18nKey="feedback.reprocess.busy" />, {
          id: 'reprocess-error',
        });
        return;
      }
      toast.error(<LiveTrans ns="manual" i18nKey="feedback.reprocess.failedTitle" />, {
        id: 'reprocess-error',
        description: <LiveTrans ns="manual" i18nKey="feedback.reprocess.failedDescription" />,
      });
    },
  });

  const deleteManual = useDeleteManual();

  function confirmDelete(): void {
    deleteManual.mutate(manual.id, {
      onSuccess: () => {
        toast.success(t('feedback.delete.success'), { id: 'manual-deleted' });
        navigate({ to: '/history' }).catch(() => undefined);
      },
    });
  }

  function confirmSave(): void {
    if (pendingText === null) return;
    saveText.mutate(
      { pageNumber: page.page_number, text: pendingText },
      { onSettled: () => setPendingText(null) },
    );
  }

  function leaveEditor(): void {
    setEditingPage(null);
    setDirty(false);
    editButtonRef.current?.focus({ preventScroll: true });
  }

  function goToPage(pageNumber: number): void {
    if (
      !pages.some((item) => item.page_number === pageNumber) ||
      pageNumber === page.page_number ||
      saveText.isPending
    )
      return;
    if (dirty) {
      setDiscardTarget(pageNumber);
      return;
    }
    setActivePage(pageNumber);
    setEditingPage(null);
  }

  function cancelEdit(): void {
    if (saveText.isPending) return;
    if (dirty) setDiscardTarget('cancel');
    else leaveEditor();
  }

  function closeDiscard(): void {
    setDiscardTarget(null);
    if (navigationBlocker.status === 'blocked') navigationBlocker.reset();
  }

  function discardEdits(): void {
    if (saveText.isPending) return;
    if (typeof discardTarget === 'number') setActivePage(discardTarget);
    leaveEditor();
    setDiscardTarget(null);
    if (navigationBlocker.status === 'blocked') navigationBlocker.proceed();
  }

  function jumpToMatch(delta: 1 | -1): void {
    if (editing || saveText.isPending) return;
    const match = search.step(delta);
    if (match) goToPage(match.pageNumber);
  }

  usePageArrowKeys(
    editingPage === null &&
      !imageOpen &&
      !reprocessOpen &&
      !deleteOpen &&
      !renameOpen &&
      !authorOpen &&
      discardTarget === null,
    page.page_number,
    goToPage,
  );

  const title = manual.title ?? manual.game_name;
  const sourceIsPdf = manual.source_type === 'pdf';
  const activeMatch =
    search.active !== null && search.active.pageNumber === page.page_number
      ? search.active.indexInPage
      : null;
  const { canEdit, hasConfidence, isFailed, isProcessingPage } = pageCapabilities(
    page,
    manual,
    busy,
  );

  useTutorialViews('viewer', view, setView, {
    text: canEdit ? ['viewer-edit'] : [],
    compare: ['viewer-compare'],
  });

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col" data-testid="manual-workspace">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 @3xl/app:gap-5 @3xl/app:px-6">
          <div className="min-w-36 flex-1">
            <h1
              className="hidden truncate font-display text-xl font-extrabold tracking-tight text-fg md:block @3xl/app:text-2xl"
              title={title}
            >
              {title}
            </h1>
            <ManualMetaRow
              createdAt={manual.created_at}
              sourceIsPdf={sourceIsPdf}
              pageCount={pages.length}
              duplicateCount={duplicateCount}
              sharing={
                manual.is_own && manual.visibility === 'shared' ? (
                  <SharingStateButton
                    anonymous={manual.anonymous}
                    onClick={() => setAuthorOpen(true)}
                  />
                ) : null
              }
            />
          </div>
          {manual.is_own ? (
            <div className="flex shrink-0 items-center gap-1" {...tourTarget('viewer-manage')}>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-[6px] px-2 font-medium hover:bg-fg/[0.04] pointer-coarse:h-11"
                disabled={busy || editing}
                onClick={() => setReprocessOpen(true)}
              >
                <ArrowClockwiseIcon data-icon-motion="rotate" size={18} aria-hidden="true" />
                {t('workspace.reread')}
              </Button>
              <Tooltip content={t('details.rename')}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('details.rename')}
                  onClick={() => setRenameOpen(true)}
                  className="text-fg-3 hover:text-fg"
                >
                  <PencilSimpleIcon data-icon-motion="tilt" size={18} aria-hidden="true" />
                </Button>
              </Tooltip>
              <Tooltip
                content={editing ? t('buttons.deleteManualDisabled') : t('buttons.deleteManual')}
                touch={editing}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('buttons.deleteManual')}
                  aria-disabled={editing}
                  onClick={editing ? undefined : () => setDeleteOpen(true)}
                  className="text-fg-3 aria-[disabled=false]:hover:text-error aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                >
                  <TrashIcon size={17} aria-hidden="true" />
                </Button>
              </Tooltip>
            </div>
          ) : null}
        </header>
        <div className="flex min-h-0 flex-1 flex-col @4xl/app:grid @4xl/app:grid-cols-[208px_minmax(0,1fr)]">
          <aside className="min-h-0 min-w-0 shrink-0 border-b border-border px-3 py-2 @4xl/app:flex @4xl/app:flex-col @4xl/app:border-b-0 @4xl/app:border-r @4xl/app:py-4">
            <PageThumbRail
              manualId={manual.id}
              pages={pages}
              activePage={page.page_number}
              hitsByPage={search.hitsByPage}
              reader={!manual.is_own}
              onSelect={goToPage}
            />
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-3 py-2 @3xl/app:px-5">
              <PageNav
                pageNumber={page.page_number}
                total={pages.length}
                onPrev={() => goToPage(page.page_number - 1)}
                onNext={() => goToPage(page.page_number + 1)}
              />
              <ManualViewSwitch value={view} onChange={setView} />
              <SearchField
                disabled={editing}
                query={search.query}
                onSearch={search.search}
                total={search.totalHits}
                position={search.activePosition}
                onStep={jumpToMatch}
              />
            </div>
            <div className="flex h-8 shrink-0 items-center justify-between gap-3 px-4 text-xs text-fg-2 @3xl/app:px-5">
              {busy ? (
                <ReprocessBanner data={processing.data ?? null} />
              ) : (
                <span>
                  {t(editing ? 'workspace.editing' : 'workspace.reading', {
                    pageNumber: page.page_number,
                  })}
                </span>
              )}
              {manual.visibility === 'shared' ? <span>{t('workspace.shared')}</span> : null}
            </div>
            <div className={workspaceStyles.panes} data-view={view}>
              <section
                aria-label={t('workspace.original')}
                aria-hidden={view === 'text'}
                inert={view === 'text'}
                className={cn(workspaceStyles.pane, workspaceStyles.original)}
              >
                <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <ImagesIcon size={16} aria-hidden="true" />
                    {t('workspace.original')}
                  </h2>
                  <Tooltip content={t('workspace.expand')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('workspace.expand')}
                      className={controlMotion.control}
                      data-viewer-control="expand"
                      onClick={() => setImageOpen(true)}
                    >
                      <ViewerControlGlyph kind="expand" />
                    </Button>
                  </Tooltip>
                </div>
                <SourceImageViewer
                  imageUrl={api.manualPageImageUrl(manual.id, page.page_number)}
                  title={title}
                  page={page}
                />
              </section>
              <section
                aria-label={t('workspace.text')}
                aria-hidden={view === 'original'}
                inert={view === 'original'}
                className={cn(workspaceStyles.pane, workspaceStyles.text)}
              >
                <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
                  <h2 className="mr-auto truncate text-sm font-semibold">
                    {t('workspace.extractedText')}
                  </h2>
                  {manual.is_own ? (
                    <ConfidenceToggle
                      checked={showConfidence}
                      disabled={!hasConfidence || editing || isFailed || isProcessingPage}
                      onToggle={() => setShowConfidence((value) => !value)}
                    />
                  ) : null}
                  {canEdit ? (
                    <Button
                      ref={editButtonRef}
                      variant="ghost"
                      size="sm"
                      className="rounded-[6px] font-medium hover:bg-fg/[0.04] aria-pressed:bg-fg/[0.06]"
                      aria-pressed={editing}
                      disabled={saveText.isPending}
                      {...tourTarget('viewer-edit')}
                      onClick={() => {
                        if (editing) cancelEdit();
                        else setEditingPage(page.page_number);
                      }}
                    >
                      <PencilSimpleIcon data-icon-motion="tilt" size={16} aria-hidden="true" />
                      {t('workspace.edit')}
                    </Button>
                  ) : null}
                </div>
                <PageTextCard
                  key={page.page_number}
                  page={page}
                  pageCount={pages.length}
                  needle={search.needle}
                  activeMatch={activeMatch}
                  editing={editing}
                  showConfidence={showConfidence}
                  busy={busy}
                  saving={saveText.isPending}
                  reprocessing={reprocess.isPending}
                  reader={!manual.is_own}
                  onDirtyChange={setDirty}
                  onCancelEdit={cancelEdit}
                  onSave={setPendingText}
                  onReprocessPage={() => reprocess.mutate(page.page_number)}
                />
              </section>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={discardTarget !== null || navigationBlocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) closeDiscard();
        }}
      >
        <DialogHeader
          title={t('workspace.discardTitle')}
          description={t('workspace.discardDescription')}
          onClose={closeDiscard}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="secondary" onClick={closeDiscard}>
            {t('buttons.continueEditing')}
          </Button>
          <Button variant="destructive" disabled={saveText.isPending} onClick={discardEdits}>
            {t('workspace.discard')}
          </Button>
        </DialogBody>
      </Dialog>

      <ManualImageDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        manualId={manual.id}
        title={title}
        page={page}
        pageCount={pages.length}
        onPrev={() => goToPage(page.page_number - 1)}
        onNext={() => goToPage(page.page_number + 1)}
      />

      {manual.is_own ? (
        <>
          <RenameManualDialog open={renameOpen} onOpenChange={setRenameOpen} manual={manual} />
          <AuthorVisibilityDialog open={authorOpen} onOpenChange={setAuthorOpen} manual={manual} />
          <ManualDialogs
            pageNumber={page.page_number}
            pageCount={pages.length}
            gameName={manual.game_name}
            title={title}
            shared={manual.visibility === 'shared'}
            saveOpen={pendingText !== null}
            onSaveClose={() => {
              if (!saveText.isPending) setPendingText(null);
            }}
            onSaveConfirm={confirmSave}
            saving={saveText.isPending}
            reprocessOpen={reprocessOpen}
            onReprocessOpenChange={setReprocessOpen}
            onReprocessConfirm={() => reprocess.mutate(undefined)}
            reprocessing={reprocess.isPending}
            deleteOpen={deleteOpen}
            onDeleteOpenChange={setDeleteOpen}
            onDeleteConfirm={confirmDelete}
            deleting={deleteManual.isPending}
          />
        </>
      ) : null}
    </>
  );
}

/** Los tres diálogos de confirmación del detalle (guardar edición, reprocesar, eliminar). */
function ManualDialogs({
  pageNumber,
  pageCount,
  gameName,
  title,
  shared,
  saveOpen,
  onSaveClose,
  onSaveConfirm,
  saving,
  reprocessOpen,
  onReprocessOpenChange,
  onReprocessConfirm,
  reprocessing,
  deleteOpen,
  onDeleteOpenChange,
  onDeleteConfirm,
  deleting,
}: Readonly<{
  pageNumber: number;
  pageCount: number;
  gameName: string;
  title: string;
  shared: boolean;
  saveOpen: boolean;
  onSaveClose: () => void;
  onSaveConfirm: () => void;
  saving: boolean;
  reprocessOpen: boolean;
  onReprocessOpenChange: (open: boolean) => void;
  onReprocessConfirm: () => void;
  reprocessing: boolean;
  deleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  deleting: boolean;
}>) {
  const { t } = useTranslation('manual');
  return (
    <>
      {/* Confirmación antes de sustituir el texto leído por el editado. */}
      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          if (!open && !saving) onSaveClose();
        }}
      >
        <DialogHeader
          title={t('dialogs.save.header')}
          description={t('dialogs.save.description', { pageNumber })}
          onClose={saving ? undefined : onSaveClose}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" disabled={saving} onClick={onSaveClose}>
            {t('buttons.continueEditing')}
          </Button>
          <Button loading={saving} onClick={onSaveConfirm}>
            {t('buttons.save')}
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={reprocessOpen} onOpenChange={onReprocessOpenChange}>
        <DialogHeader
          title={t('dialogs.reprocess.header')}
          description={t('dialogs.reprocess.description')}
          onClose={() => onReprocessOpenChange(false)}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onReprocessOpenChange(false)}>
            {t('buttons.cancel')}
          </Button>
          <Button loading={reprocessing} onClick={onReprocessConfirm}>
            <ArrowClockwiseIcon data-icon-motion="rotate" aria-hidden="true" size={18} />
            {t('buttons.reprocess')}
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <DialogHeader
          title={t('dialogs.delete.header')}
          description={t('dialogs.delete.description')}
          onClose={() => onDeleteOpenChange(false)}
        />
        <DialogBody>
          <div className="rounded-2xl border border-error bg-error-bg p-4 text-sm leading-relaxed text-fg">
            <p className="font-semibold">{t('dialogs.delete.irreversible')}</p>
            <p className="mt-1">
              <Trans
                ns="manual"
                i18nKey="dialogs.delete.warning"
                count={pageCount}
                values={{ gameName, title }}
                components={{ strong: <strong /> }}
              />
            </p>
            {shared ? (
              <p className="mt-2">
                <Trans
                  ns="manual"
                  i18nKey="dialogs.delete.shared"
                  values={{ gameName }}
                  components={{ strong: <strong /> }}
                />
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onDeleteOpenChange(false)}>
              {t('buttons.cancel')}
            </Button>
            <Button variant="destructive" loading={deleting} onClick={onDeleteConfirm}>
              <TrashIcon size={16} />
              {t('buttons.deleteManual')}
            </Button>
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}

function ManualImageDialog({
  open,
  onOpenChange,
  manualId,
  title,
  page,
  pageCount,
  onPrev,
  onNext,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualId: string;
  title: string;
  page: ManualDetailPage;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
}>) {
  const { t } = useTranslation('manual');
  const imageUrl = api.manualPageImageUrl(manualId, page.page_number);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName="h-dvh max-h-dvh w-screen max-w-[1600px] overflow-hidden rounded-none bg-bg sm:h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)] sm:rounded-[8px]"
    >
      <DialogHeader
        title={t('image.dialogTitle')}
        description={t('image.dialogDescription', {
          pageCount,
          pageNumber: page.page_number,
          title,
        })}
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="flex min-h-0 flex-1 flex-col px-0 pb-0 pt-0">
        <div className="mb-2 flex shrink-0 justify-center">
          <PageNav
            pageNumber={page.page_number}
            total={pageCount}
            onPrev={onPrev}
            onNext={onNext}
          />
        </div>
        {open ? <SourceImageViewer imageUrl={imageUrl} title={title} page={page} /> : null}
      </DialogBody>
    </Dialog>
  );
}

function ReprocessBanner({
  data,
}: Readonly<{ data: { completed_pages: number; page_count: number } | null }>) {
  const { t } = useTranslation('manual');
  const pct = data ? (data.completed_pages / Math.max(data.page_count, 1)) * 100 : 5;
  return (
    <output className="flex min-w-0 flex-1 items-center gap-2 text-xs text-primary-700">
      <CircleNotchIcon
        size={14}
        className="shrink-0 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span>{t('feedback.reprocess.progress')}</span>
      <div className="w-24">
        <Progress value={pct} />
      </div>
      {data ? (
        <span className="tabular-nums">
          {data.completed_pages} / {data.page_count}
        </span>
      ) : null}
    </output>
  );
}

function PageNav({
  pageNumber,
  total,
  onPrev,
  onNext,
}: Readonly<{ pageNumber: number; total: number; onPrev: () => void; onNext: () => void }>) {
  const { t } = useTranslation('manual');
  return (
    <div className="flex items-center gap-1.5">
      <NavButton label={t('page.previous')} disabled={pageNumber <= 1} onClick={onPrev}>
        <CaretLeftIcon data-icon-motion="back" aria-hidden="true" size={18} />
      </NavButton>
      <span className="min-w-12 tabular-nums text-center @2xl/app:min-w-[88px] font-display text-sm font-bold text-fg">
        <span className="hidden @2xl/app:inline">{t('page.number', { pageNumber })}</span>
        <span className="@2xl/app:hidden">{pageNumber}</span>{' '}
        <span className="font-semibold text-fg-3">/ {total}</span>
      </span>
      <NavButton label={t('page.next')} disabled={pageNumber >= total} onClick={onNext}>
        <CaretRightIcon data-icon-motion="forward" aria-hidden="true" size={18} />
      </NavButton>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: Readonly<{ label: string; disabled: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="icon-feedback grid size-8 place-items-center rounded-xl @2xl/app:size-9 text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ConfidenceToggle({
  checked,
  disabled,
  onToggle,
}: Readonly<{ checked: boolean; disabled: boolean; onToggle: () => void }>) {
  const { t } = useTranslation('manual');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const active = checked && !disabled;
  return (
    <Tooltip
      content={disabled ? t('confidence.toggle.disabledTitle') : t('confidence.toggle.title')}
    >
      <button
        type="button"
        role="switch"
        aria-label={t('confidence.toggle.label')}
        aria-checked={active}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onToggle}
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[6px] px-1 text-xs font-medium text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-[disabled=false]:hover:text-fg pointer-coarse:h-11"
      >
        <span>{t('workspace.confidence')}</span>
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex h-4 w-7 shrink-0 items-center rounded-full border p-px transition-colors duration-150 ease-[var(--m-easing)] motion-reduce:transition-none',
            active ? 'border-fg-2 bg-fg-2' : 'border-fg-3',
          )}
        >
          <motion.span
            key={reducedMotion ? 'static' : 'animated'}
            initial={false}
            animate={{ marginInlineStart: active ? 12 : 0 }}
            transition={
              reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }
            }
            className={cn(
              'size-3 shrink-0 rounded-full transition-colors duration-150 ease-[var(--m-easing)] motion-reduce:transition-none',
              active ? 'bg-bg' : 'bg-fg-3',
            )}
          />
        </span>
      </button>
    </Tooltip>
  );
}

function SearchField({
  disabled,
  query,
  onSearch,
  total,
  position,
  onStep,
}: Readonly<{
  disabled: boolean;
  query: string;
  onSearch: (query: string) => void;
  total: number;
  position: number;
  onStep: (delta: 1 | -1) => void;
}>) {
  const { t } = useTranslation('manual');
  const hasQuery = query.trim().length > 0;
  return (
    <div
      {...tourTarget('viewer-search')}
      className={cn(
        'flex h-10 w-full min-w-0 flex-auto @3xl/app:max-w-[340px] items-center gap-2 rounded-xl border bg-card pl-3.5 pr-1 transition-colors @2xl/app:w-auto @2xl/app:flex-1 pointer-coarse:h-12',
        !disabled && hasQuery
          ? 'border-primary'
          : 'border-border-strong focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20',
        disabled && 'cursor-not-allowed bg-surface text-fg-3',
      )}
      style={!disabled && hasQuery ? { boxShadow: 'var(--m-shadow-ring-primary)' } : undefined}
    >
      <MagnifyingGlassIcon
        data-icon-motion="search"
        size={16}
        className="shrink-0 text-fg-3"
        aria-hidden="true"
      />
      <input
        type="search"
        disabled={disabled}
        value={query}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.ariaLabel')}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none @2xl/app:text-sm placeholder:text-fg-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-3 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {hasQuery ? (
        <span className="flex shrink-0 items-center gap-0.5">
          <span
            className="mono whitespace-nowrap px-1.5 text-[11.5px] tabular-nums text-fg-2"
            aria-live="polite"
          >
            {position} / {total}
          </span>
          <SearchMiniButton
            label={t('search.previous')}
            disabled={disabled || total === 0}
            onClick={() => onStep(-1)}
          >
            <CaretLeftIcon data-icon-motion="back" aria-hidden="true" size={15} />
          </SearchMiniButton>
          <SearchMiniButton
            label={t('search.next')}
            disabled={disabled || total === 0}
            onClick={() => onStep(1)}
          >
            <CaretRightIcon data-icon-motion="forward" aria-hidden="true" size={15} />
          </SearchMiniButton>
          <SearchMiniButton
            label={t('search.clear')}
            disabled={disabled}
            onClick={() => onSearch('')}
          >
            <XIcon aria-hidden="true" size={14} className="search-clear-icon" />
          </SearchMiniButton>
        </span>
      ) : null}
    </div>
  );
}

function SearchMiniButton({
  label,
  disabled,
  onClick,
  children,
}: Readonly<{ label: string; disabled: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="icon-feedback grid size-7 place-items-center rounded-lg text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:size-11"
    >
      {children}
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-4 @4xl/app:max-w-none @4xl/app:grid-cols-[300px_minmax(0,1fr)] @4xl/app:gap-0 @4xl/app:p-0"
    >
      <div className="flex gap-2 @4xl/app:flex-col @4xl/app:border-r @4xl/app:border-border @4xl/app:px-4 @4xl/app:py-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 w-28 animate-pulse rounded-2xl bg-surface-2 @4xl/app:w-full"
          />
        ))}
      </div>
      <div className="space-y-4 @4xl/app:px-6 @4xl/app:py-5">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-surface-2" />
        <div className="h-[clamp(320px,52vh,520px)] animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
