import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Files,
  Images,
  Layers,
  Loader2,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tooltip } from '@/components/ui/tooltip';
import { PageTextCard } from '@/features/manual/PageTextCard';
import { PageThumbRail } from '@/features/manual/PageThumbRail';
import { pageStatus } from '@/features/manual/pageStatus';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { manualDetailQueryOptions, useDeleteManual } from '@/features/manual/use-manuals';
import { formatLongDate } from '@/shared/lib/relativeDate';
import {
  api,
  ApiError,
  type ManualDetailPage,
  type ManualDetailResponse,
} from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { toastApiError } from '@/shared/lib/toastApiError';

export const Route = createFileRoute('/_app/manual/$manualId')({
  // `page` opcional: las citas del chat abren el manual en la página citada.
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = Number(search.page);
    return Number.isInteger(page) && page > 0 ? { page } : {};
  },
  component: ManualDetailScreen,
});

const PROCESSING_POLL_MS = 1500;

function editErrorToast(error: unknown): void {
  if (error instanceof ApiError && error.status === 409) {
    toast.error('El manual se está procesando', {
      id: 'page-edit-error',
      description: 'Espera a que termine e inténtalo de nuevo.',
    });
    return;
  }
  if (error instanceof ApiError && (error.status === 502 || error.status === 500)) {
    toast.warning('Texto guardado, índice pendiente', {
      id: 'page-edit-error',
      description: 'Tu texto ya está guardado; re-procesa el manual para sincronizar la IA.',
    });
    return;
  }
  toastApiError(error, 'page-edit-error', {
    title: 'No hemos podido guardar el texto',
    id: 'page-edit-error-unknown',
    description: 'Inténtalo de nuevo en un momento.',
  });
}

/** El foco está en un campo de texto: no robar las flechas para navegar. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  );
}

function ManualDetailScreen() {
  const { manualId } = Route.useParams();
  const { page } = Route.useSearch();
  const detail = useQuery(manualDetailQueryOptions(manualId));

  if (detail.isPending) {
    return (
      <ManualShell crumb="Manual">
        <DetailSkeleton />
      </ManualShell>
    );
  }
  if (detail.isError || detail.data.pages.length === 0) {
    return (
      <ManualShell crumb="Manual">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-xl font-bold text-fg">
            No hemos podido abrir este manual
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            Puede que se haya borrado o que aún se esté procesando. Vuelve al historial e inténtalo
            desde allí.
          </p>
          <Button asChild className="mt-5">
            <Link to="/history">Ir al historial</Link>
          </Button>
        </div>
      </ManualShell>
    );
  }
  // key: el estado por manual no debe sobrevivir a un cambio de manual.
  return <ManualDetailLoaded key={detail.data.id} manual={detail.data} initialPage={page} />;
}

function ManualShell({
  crumb,
  trail,
  children,
}: Readonly<{
  crumb: string;
  trail?: Parameters<typeof ScreenTopBar>[0]['trail'];
  children: ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar crumb={crumb} trail={trail} />
      {children}
    </div>
  );
}

function ManualDetailLoaded({
  manual,
  initialPage,
}: Readonly<{ manual: ManualDetailResponse; initialPage?: number }>) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pages = manual.pages;
  const [activePage, setActivePage] = useState(() =>
    initialPage !== undefined && pages.some((item) => item.page_number === initialPage)
      ? initialPage
      : pages[0]!.page_number,
  );
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const search = usePageSearch(pages);
  const detailKey = manualDetailQueryOptions(manual.id).queryKey;

  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const busy = manual.status === 'indexing';
  const editable = manual.visibility === 'private' && !busy;
  const editing = editingPage === page.page_number;

  const processing = useQuery({
    queryKey: ['manuals', 'processing', manual.id],
    queryFn: ({ signal }) => api.getManualProcessing(manual.id, signal),
    enabled: busy,
    refetchInterval: PROCESSING_POLL_MS,
  });
  const processingDone = busy && processing.data != null && processing.data.status !== 'indexing';
  useEffect(() => {
    if (processingDone) {
      qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
    }
  }, [processingDone, qc, detailKey]);

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
      toast.success('Texto guardado', {
        id: 'page-edit-ok',
        description: 'La IA usará tu versión a partir de ahora.',
      });
    },
    onError: (error) => {
      editErrorToast(error);
      if (error instanceof ApiError && (error.status === 502 || error.status === 500)) {
        qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
        setEditingPage(null);
      }
    },
  });

  const reprocess = useMutation({
    mutationFn: (pageNumber?: number) =>
      pageNumber == null
        ? api.reprocessManual(manual.id)
        : api.reprocessPage(manual.id, pageNumber),
    onSuccess: () => {
      setReprocessOpen(false);
      qc.invalidateQueries({ queryKey: detailKey }).catch(() => undefined);
    },
    onError: (error) => {
      setReprocessOpen(false);
      if (error instanceof ApiError && error.status === 409) {
        toast.error('El manual ya se está procesando', { id: 'reprocess-error' });
        return;
      }
      toast.error('No hemos podido re-procesar el manual', {
        id: 'reprocess-error',
        description: 'Inténtalo de nuevo en un momento.',
      });
    },
  });

  const deleteManual = useDeleteManual();

  function confirmDelete(): void {
    deleteManual.mutate(manual.id, {
      onSuccess: () => {
        toast.success('Manual borrado', { id: 'manual-deleted' });
        navigate({ to: '/history' }).catch(() => undefined);
      },
      onError: () =>
        toast.error('No hemos podido borrar el manual', {
          id: 'manual-delete-error',
          description: 'Inténtalo de nuevo en un momento.',
        }),
    });
  }

  function confirmSave(): void {
    if (pendingText === null) return;
    saveText.mutate(
      { pageNumber: page.page_number, text: pendingText },
      { onSettled: () => setPendingText(null) },
    );
  }

  // Cambiar de página sale del modo edición (volver no reabre el borrador).
  function goToPage(pageNumber: number): void {
    if (pageNumber < 1 || pageNumber > pages.length) return;
    setActivePage(pageNumber);
    setEditingPage(null);
  }

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match) goToPage(match.pageNumber);
  }

  // Atajos ← → para cambiar de página (no mientras se edita ni desde un input).
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (editingPage !== null || isTypingTarget(event.target)) return;
      if (event.key === 'ArrowLeft') goToPage(page.page_number - 1);
      else if (event.key === 'ArrowRight') goToPage(page.page_number + 1);
    }
    globalThis.window.addEventListener('keydown', onKey);
    return () => globalThis.window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPage, page.page_number, pages.length]);

  const title = manual.title ?? manual.game_name;
  // Sin esto, el manual titulado como el juego pinta «Monopoly > Monopoly».
  const crumb = title === manual.game_name ? 'Texto extraído' : title;
  const sourceIsPdf = manual.source_type === 'pdf';
  const activeMatch =
    search.active !== null && search.active.pageNumber === page.page_number
      ? search.active.indexInPage
      : null;
  const isFailed = pageStatus(page).key === 'failed';
  const canEdit = editable && !isFailed;
  // El modo confianza solo aplica si la página trae confianzas por línea (no
  // ocurre en páginas editadas a mano, cuyo texto no procede del OCR).
  const hasConfidence = page.ocr_lines.some((line) => line.confidence != null);

  return (
    <ManualShell
      crumb={crumb}
      trail={[
        { label: 'Biblioteca', link: linkOptions({ to: '/history' }) },
        {
          label: manual.game_name,
          link: linkOptions({ to: '/game/$gameId', params: { gameId: manual.game_id } }),
        },
      ]}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:grid md:h-[calc(100dvh_-_3.5rem)] md:flex-none md:max-w-none md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:gap-0 md:overflow-hidden md:p-0">
        {/* ───── RAIL ───── */}
        <aside className="min-w-0 md:flex md:min-h-0 md:flex-col md:overflow-hidden md:border-r md:border-border md:px-4 md:py-5">
          <PageThumbRail
            pages={pages}
            activePage={page.page_number}
            hitsByPage={search.hitsByPage}
            onSelect={goToPage}
          />
        </aside>

        {/* ───── COLUMNA PRINCIPAL ───── */}
        <div className="flex min-w-0 flex-col gap-4 md:min-h-0 md:gap-0 md:overflow-hidden">
          {/* cabecera del manual: título + metadatos + acciones (centradas en la celda) */}
          <div className="flex items-center gap-4 md:border-b md:border-border md:px-6 md:py-4">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-fg">
                {title}
              </h1>
              <div className="mono mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11.5px] text-fg-3">
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} aria-hidden="true" /> Subido el{' '}
                  {formatLongDate(manual.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  {sourceIsPdf ? (
                    <FileText size={13} aria-hidden="true" />
                  ) : (
                    <Images size={13} aria-hidden="true" />
                  )}{' '}
                  {sourceIsPdf ? 'PDF' : 'Fotos'}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Files size={13} aria-hidden="true" /> {pages.length}{' '}
                  {pages.length === 1 ? 'página' : 'páginas'}
                </span>
              </div>
            </div>
            <ManualActionsMenu
              busy={busy}
              onReprocess={() => setReprocessOpen(true)}
              onDelete={() => setDeleteOpen(true)}
            />
          </div>

          {busy ? <ReprocessBanner data={processing.data ?? null} /> : null}

          {/* visor con scroll propio en escritorio */}
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:px-6 md:py-5">
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {/* fila de control: navegación de página + estado */}
              <div className="flex flex-wrap items-center gap-3">
                <PageNav
                  pageNumber={page.page_number}
                  total={pages.length}
                  onPrev={() => goToPage(page.page_number - 1)}
                  onNext={() => goToPage(page.page_number + 1)}
                />
                <StatusChip page={page} />
              </div>

              {/* fila de búsqueda + acciones de la vista (confianza, editar) */}
              <div className="flex flex-wrap items-center gap-3">
                <SearchField
                  query={search.query}
                  onSearch={search.search}
                  total={search.totalHits}
                  position={search.activePosition}
                  onStep={jumpToMatch}
                />
                <div className="flex shrink-0 items-center gap-2">
                  {!editing && !isFailed ? (
                    <ConfidenceToggle
                      pressed={showConfidence}
                      disabled={!hasConfidence}
                      onToggle={() => setShowConfidence((value) => !value)}
                    />
                  ) : null}
                  {canEdit && !editing ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingPage(page.page_number)}
                    >
                      <Pencil size={15} strokeWidth={2} />
                      Editar texto
                    </Button>
                  ) : null}
                </div>
              </div>

              <PageTextCard
                page={page}
                pageCount={pages.length}
                needle={search.needle}
                activeMatch={activeMatch}
                editing={editing}
                showConfidence={showConfidence}
                busy={busy}
                saving={saveText.isPending}
                reprocessing={reprocess.isPending}
                onCancelEdit={() => setEditingPage(null)}
                onSave={(text) => setPendingText(text)}
                onReprocessPage={() => reprocess.mutate(page.page_number)}
              />
            </div>
          </div>
        </div>
      </div>

      <ManualDialogs
        pageNumber={page.page_number}
        pageCount={pages.length}
        gameName={manual.game_name}
        title={title}
        shared={manual.visibility === 'shared'}
        saveOpen={pendingText !== null}
        onSaveClose={() => setPendingText(null)}
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
    </ManualShell>
  );
}

/** Los tres diálogos de confirmación del detalle (guardar edición, re-procesar, eliminar). */
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
  return (
    <>
      {/* Confirmación antes de sustituir el texto leído por el editado. */}
      <Dialog open={saveOpen} onOpenChange={(open) => !open && onSaveClose()}>
        <DialogHeader
          title="¿Guardar los cambios?"
          description={`Sustituirá lo leído en la página ${pageNumber}: la IA responderá con tu versión y la página quedará como «Editada a mano».`}
          onClose={onSaveClose}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onSaveClose}>
            Seguir editando
          </Button>
          <Button loading={saving} onClick={onSaveConfirm}>
            Guardar
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={reprocessOpen} onOpenChange={onReprocessOpenChange}>
        <DialogHeader
          title="Re-procesar manual"
          description="Volveremos a leer todas las páginas con OCR y a indexar el texto. La explicación del juego se regenerará."
          onClose={() => onReprocessOpenChange(false)}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onReprocessOpenChange(false)}>
            Cancelar
          </Button>
          <Button loading={reprocessing} onClick={onReprocessConfirm}>
            <RotateCw size={16} strokeWidth={2} />
            Re-procesar
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
        <DialogHeader
          title="Eliminar manual"
          description="Confirma que quieres borrarlo."
          onClose={() => onDeleteOpenChange(false)}
        />
        <DialogBody>
          <div className="rounded-2xl border border-error bg-error-bg p-4 text-sm leading-relaxed text-fg">
            <p className="font-semibold">Esta acción no se puede deshacer.</p>
            <p className="mt-1">
              Se borrará <strong>«{title}»</strong> de {gameName}: sus {pageCount}{' '}
              {pageCount === 1 ? 'página' : 'páginas'} y su texto extraído. La explicación del juego
              se regenerará con los manuales restantes.
            </p>
            {shared ? (
              <p className="mt-2">
                Es <strong>compartido</strong>: dejará de estar disponible para otras personas en{' '}
                {gameName}.
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onDeleteOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={deleting} onClick={onDeleteConfirm}>
              <Trash2 size={16} strokeWidth={2} />
              Eliminar manual
            </Button>
          </div>
        </DialogBody>
      </Dialog>
    </>
  );
}

function ManualActionsMenu({
  busy,
  onReprocess,
  onDelete,
}: Readonly<{ busy: boolean; onReprocess: () => void; onDelete: () => void }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="shrink-0">
          Acciones
          <ChevronDown size={15} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={busy} onSelect={onReprocess}>
          <RotateCw size={16} strokeWidth={2} />
          Re-procesar todo
        </DropdownMenuItem>
        <hr className="my-1 border-t border-border" />
        <DropdownMenuItem danger onSelect={onDelete}>
          {/* Ajuste óptico: el cuerpo de la papelera pesa abajo (centro de masa ~0.5px
              más bajo que los demás iconos del menú); la subimos para alinearla. */}
          <Trash2 size={16} strokeWidth={2} className="-translate-y-[0.5px]" />
          Eliminar manual
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReprocessBanner({
  data,
}: Readonly<{ data: { completed_pages: number; page_count: number } | null }>) {
  const pct = data ? (data.completed_pages / Math.max(data.page_count, 1)) * 100 : 5;
  return (
    <div className="md:px-6 md:pt-4">
      <output className="flex items-center gap-3 rounded-2xl border border-primary bg-primary-50 p-3.5">
        <Loader2 size={20} className="shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-fg">Re-procesando el manual…</p>
          <div className="mt-1.5">
            <Progress value={pct} />
          </div>
        </div>
        {data ? (
          <span className="mono shrink-0 text-xs font-semibold text-primary-700">
            {data.completed_pages} de {data.page_count} páginas
          </span>
        ) : null}
      </output>
    </div>
  );
}

function PageNav({
  pageNumber,
  total,
  onPrev,
  onNext,
}: Readonly<{ pageNumber: number; total: number; onPrev: () => void; onNext: () => void }>) {
  return (
    <div className="flex items-center gap-1.5">
      <NavButton label="Página anterior" disabled={pageNumber <= 1} onClick={onPrev}>
        <ChevronLeft size={18} strokeWidth={2} />
      </NavButton>
      <span className="min-w-[88px] text-center font-display text-sm font-bold text-fg">
        Página {pageNumber} <span className="font-semibold text-fg-3">/ {total}</span>
      </span>
      <NavButton label="Página siguiente" disabled={pageNumber >= total} onClick={onNext}>
        <ChevronRight size={18} strokeWidth={2} />
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
      className="grid size-9 place-items-center rounded-xl border border-border bg-card text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatusChip({ page }: Readonly<{ page: ManualDetailPage }>) {
  const st = pageStatus(page);
  return (
    <Tooltip content={st.tip}>
      <Badge
        tone={st.tone}
        icon={<st.Icon strokeWidth={2.2} />}
        tabIndex={0}
        role="status"
        aria-label={`Estado de lectura: ${st.label}`}
        className="h-[30px] cursor-help px-2.5 text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {st.label}
      </Badge>
    </Tooltip>
  );
}

function ConfidenceToggle({
  pressed,
  disabled,
  onToggle,
}: Readonly<{ pressed: boolean; disabled: boolean; onToggle: () => void }>) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      title={
        disabled
          ? 'Esta página no tiene confianza OCR (texto editado a mano)'
          : 'Colorea cada línea según la confianza del OCR'
      }
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-55',
        pressed
          ? 'border-primary bg-primary-50 text-primary-700'
          : 'border-border-strong bg-card text-fg-2 hover:bg-surface',
      )}
    >
      <Layers size={15} strokeWidth={2} aria-hidden="true" />
      Confianza por línea
      <ChevronDown
        size={14}
        strokeWidth={2}
        aria-hidden="true"
        className={cn('transition-transform', pressed && 'rotate-180')}
      />
    </button>
  );
}

function SearchField({
  query,
  onSearch,
  total,
  position,
  onStep,
}: Readonly<{
  query: string;
  onSearch: (query: string) => void;
  total: number;
  position: number;
  onStep: (delta: 1 | -1) => void;
}>) {
  const hasQuery = query.trim().length > 0;
  return (
    <div
      className={cn(
        'flex h-10 min-w-0 max-w-[460px] flex-1 items-center gap-2 rounded-xl border bg-card pl-3.5 pr-1 transition-colors',
        hasQuery
          ? 'border-primary'
          : 'border-border-strong focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/20',
      )}
      style={hasQuery ? { boxShadow: 'var(--m-shadow-ring-primary)' } : undefined}
    >
      <Search size={16} strokeWidth={2} className="shrink-0 text-fg-3" aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => onSearch(event.target.value)}
        placeholder="Buscar en todo el manual…"
        aria-label="Buscar en el texto del manual"
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
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
            label="Coincidencia anterior"
            disabled={total === 0}
            onClick={() => onStep(-1)}
          >
            <ChevronLeft size={15} strokeWidth={2} />
          </SearchMiniButton>
          <SearchMiniButton
            label="Coincidencia siguiente"
            disabled={total === 0}
            onClick={() => onStep(1)}
          >
            <ChevronRight size={15} strokeWidth={2} />
          </SearchMiniButton>
          <SearchMiniButton label="Limpiar búsqueda" disabled={false} onClick={() => onSearch('')}>
            <X size={14} strokeWidth={2} />
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
      className="grid size-7 place-items-center rounded-lg text-fg-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function DetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-4 md:max-w-none md:grid-cols-[300px_minmax(0,1fr)] md:gap-0 md:p-0"
    >
      <div className="flex gap-2 md:flex-col md:border-r md:border-border md:px-4 md:py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 w-28 animate-pulse rounded-2xl bg-surface-2 md:w-full" />
        ))}
      </div>
      <div className="space-y-4 md:px-6 md:py-5">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-surface-2" />
        <div className="h-[clamp(320px,52vh,520px)] animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
