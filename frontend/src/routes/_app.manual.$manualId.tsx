import { createFileRoute, Link, linkOptions, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BackLink, ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { PageTextCard } from '@/features/manual/PageTextCard';
import { PageThumbRail } from '@/features/manual/PageThumbRail';
import { usePageSearch } from '@/features/manual/usePageSearch';
import { manualDetailQueryOptions, useDeleteManual } from '@/features/manual/use-manuals';
import { formatShortDate } from '@/shared/lib/relativeDate';
import { api, ApiError, type ManualDetailResponse } from '@/shared/api/client';
import { toastApiError } from '@/shared/lib/toastApiError';

export const Route = createFileRoute('/_app/manual/$manualId')({
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
  // Resto de códigos (429 de rate limit, 404, red…): copy del mapper común.
  toastApiError(error, 'page-edit-error', {
    title: 'No hemos podido guardar el texto',
    id: 'page-edit-error-unknown',
    description: 'Inténtalo de nuevo en un momento.',
  });
}

function ManualDetailScreen() {
  const { manualId } = Route.useParams();
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
            Puede que se haya borrado o que aún se esté procesando. Vuelve al historial e
            inténtalo desde allí.
          </p>
          <Button asChild className="mt-5">
            <Link to="/history">Ir al historial</Link>
          </Button>
        </div>
      </ManualShell>
    );
  }
  // key: el estado por manual no debe sobrevivir a un cambio de manual.
  return <ManualDetailLoaded key={detail.data.id} manual={detail.data} />;
}

function ManualShell({
  crumb,
  trail,
  actions,
  children,
}: Readonly<{
  crumb: string;
  trail?: Parameters<typeof ScreenTopBar>[0]['trail'];
  actions?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb={crumb}
        trail={trail}
        back={<BackLink label="Volver al historial" link={linkOptions({ to: '/history' })} />}
        actions={actions}
      />
      {children}
    </div>
  );
}

function ManualDetailLoaded({ manual }: Readonly<{ manual: ManualDetailResponse }>) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pages = manual.pages;
  const [activePage, setActivePage] = useState(pages[0]!.page_number);
  const [editingPage, setEditingPage] = useState<number | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const search = usePageSearch(pages);
  const detailKey = manualDetailQueryOptions(manual.id).queryKey;

  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const busy = manual.status === 'indexing';
  const editable = manual.visibility === 'private' && !busy;

  // Mientras se re-procesa, sondea el progreso y refresca el detalle al acabar.
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
        // El texto SÍ se guardó: refresca y sal del modo edición.
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

  // Cambiar de página sale del modo edición (volver no reabre el borrador).
  function goToPage(pageNumber: number): void {
    setActivePage(pageNumber);
    setEditingPage(null);
  }

  function jumpToMatch(delta: 1 | -1): void {
    const match = search.step(delta);
    if (match) goToPage(match.pageNumber);
  }

  const title = manual.title ?? manual.game_name;
  // Sin esto, el manual titulado como el juego pinta «Monopoly > Monopoly».
  const crumb = title === manual.game_name ? 'Texto extraído' : title;
  const activeMatch =
    search.active !== null && search.active.pageNumber === page.page_number
      ? search.active.indexInPage
      : null;

  return (
    <ManualShell
      crumb={crumb}
      trail={[
        { label: 'Historial', link: linkOptions({ to: '/history' }) },
        { label: manual.game_name, link: linkOptions({ to: '/game/$gameId', params: { gameId: manual.game_id } }) },
      ]}
      actions={
        <>
          <button
            type="button"
            onClick={() => setReprocessOpen(true)}
            disabled={busy}
            className="grid size-10 place-items-center rounded-xl text-fg-2 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Re-procesar manual"
            title="Re-procesar manual"
          >
            <RotateCw size={19} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="grid size-10 place-items-center rounded-xl text-error hover:bg-error-bg"
            aria-label="Borrar manual"
            title="Borrar manual"
          >
            <Trash2 size={19} strokeWidth={1.75} />
          </button>
        </>
      }
    >
      {busy ? (
        <output className="flex items-center gap-3 border-b border-border bg-warning-bg px-4 py-2.5 md:px-8">
          <Loader2 size={16} className="shrink-0 animate-spin text-warning" aria-hidden="true" />
          <p className="text-sm font-semibold text-fg">Re-procesando el manual…</p>
          <div className="ml-auto w-40 max-w-[40%]">
            <Progress
              value={
                processing.data
                  ? (processing.data.completed_pages / Math.max(processing.data.page_count, 1)) *
                    100
                  : 5
              }
            />
          </div>
        </output>
      ) : null}

      <div className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-4 md:grid-cols-[216px_minmax(0,1fr)] md:gap-6 md:px-6 md:py-6">
        <PageThumbRail
          pages={pages}
          activePage={page.page_number}
          hitsByPage={search.hitsByPage}
          onSelect={goToPage}
        />

        <div className="min-w-0">
          <SearchToolbar
            query={search.query}
            onSearch={search.search}
            totalHits={search.totalHits}
            pagesWithHits={search.pagesWithHits}
            onStep={jumpToMatch}
            confidence={page.ocr_confidence_mean}
          />

          <PageTextCard
            page={page}
            pageCount={manual.pages.length}
            needle={search.needle}
            activeMatch={activeMatch}
            editable={editable}
            editing={editingPage === page.page_number}
            busy={busy}
            saving={saveText.isPending}
            reprocessing={reprocess.isPending}
            onStartEdit={() => setEditingPage(page.page_number)}
            onCancelEdit={() => setEditingPage(null)}
            onSave={(text) => setPendingText(text)}
            onReprocessPage={() => reprocess.mutate(page.page_number)}
          />

          <footer className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={page.page_number <= 1}
              onClick={() => goToPage(page.page_number - 1)}
            >
              <ChevronLeft size={16} strokeWidth={2} />
              Anterior
            </Button>
            <span className="mono text-[11px] text-fg-3">
              subido {formatShortDate(manual.created_at)} · {manualSourceLabel(manual)} ·{' '}
              {manual.pages.length} {manual.pages.length === 1 ? 'página' : 'páginas'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page.page_number >= manual.pages.length}
              onClick={() => goToPage(page.page_number + 1)}
            >
              Siguiente
              <ChevronRight size={16} strokeWidth={2} />
            </Button>
          </footer>
        </div>
      </div>

      {/* Confirmación suave antes de sustituir el texto leído por el OCR. */}
      <Dialog open={pendingText !== null} onOpenChange={(open) => !open && setPendingText(null)}>
        <DialogHeader
          title="¿Guardar el texto editado?"
          description={`Sustituirá lo leído en la página ${page.page_number}: la IA responderá con tu versión.`}
          onClose={() => setPendingText(null)}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingText(null)}>
            Seguir editando
          </Button>
          <Button
            loading={saveText.isPending}
            onClick={() => {
              if (pendingText === null) return;
              saveText.mutate(
                { pageNumber: page.page_number, text: pendingText },
                { onSettled: () => setPendingText(null) },
              );
            }}
          >
            Guardar texto
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={reprocessOpen} onOpenChange={setReprocessOpen}>
        <DialogHeader
          title="Re-procesar manual"
          description="Volveremos a leer todas las páginas con OCR y a indexar el texto. La explicación del juego se regenerará."
          onClose={() => setReprocessOpen(false)}
        />
        <DialogBody className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReprocessOpen(false)}>
            Cancelar
          </Button>
          <Button loading={reprocess.isPending} onClick={() => reprocess.mutate(undefined)}>
            <RotateCw size={16} strokeWidth={2} />
            Re-procesar
          </Button>
        </DialogBody>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader
          title="Borrar manual"
          description="Confirma que quieres eliminarlo."
          onClose={() => setDeleteOpen(false)}
        />
        <DialogBody>
          <div className="rounded-2xl border border-error bg-error-bg p-4 text-sm leading-relaxed text-fg">
            <p className="font-semibold">Esta acción no se puede deshacer.</p>
            <p className="mt-1">
              Se borrará <strong>«{title}»</strong> de {manual.game_name}: sus {manual.pages.length}{' '}
              {manual.pages.length === 1 ? 'página' : 'páginas'} y su texto extraído. La explicación
              del juego se regenerará con los manuales restantes.
            </p>
            {manual.visibility === 'shared' ? (
              <p className="mt-2">
                Es <strong>compartido</strong>: dejará de estar en el pool de {manual.game_name}{' '}
                para otras personas.
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={deleteManual.isPending} onClick={confirmDelete}>
              <Trash2 size={16} strokeWidth={2} />
              Borrar manual
            </Button>
          </div>
        </DialogBody>
      </Dialog>
    </ManualShell>
  );
}

function manualSourceLabel(manual: ManualDetailResponse): string {
  return manual.pages.some((page) => page.text_source === 'pdf_text') ? 'PDF' : 'fotos';
}

function SearchToolbar({
  query,
  onSearch,
  totalHits,
  pagesWithHits,
  onStep,
  confidence,
}: Readonly<{
  query: string;
  onSearch: (query: string) => void;
  totalHits: number;
  pagesWithHits: number;
  onStep: (delta: 1 | -1) => void;
  confidence: number | null;
}>) {
  const hasQuery = query.trim().length > 0;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3"
        />
        <Input
          preset="search"
          value={query}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Busca en el texto extraído…"
          aria-label="Buscar en el texto del manual"
          className="pl-10"
        />
      </div>
      {hasQuery ? (
        <>
          <span className="mono text-[11px] text-fg-3" aria-live="polite">
            {totalHits} en {pagesWithHits} {pagesWithHits === 1 ? 'pág.' : 'págs.'}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onStep(-1)}
              disabled={totalHits === 0}
              className="grid size-9 place-items-center rounded-xl border border-border text-fg-2 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Coincidencia anterior"
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => onStep(1)}
              disabled={totalHits === 0}
              className="grid size-9 place-items-center rounded-xl border border-border text-fg-2 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Coincidencia siguiente"
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
        </>
      ) : null}
      <span className="mono ml-auto hidden text-[11px] text-fg-3 md:inline">
        {confidence === null ? 'sin confianza OCR' : `OCR conf. ${confidence.toFixed(2)}`}
      </span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-4 md:grid-cols-[216px_minmax(0,1fr)] md:gap-6 md:px-6 md:py-6"
    >
      <div className="flex gap-2 md:flex-col">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 w-20 animate-pulse rounded-xl bg-surface-2 md:w-full" />
        ))}
      </div>
      <div className="space-y-4">
        <div className="h-10 w-72 max-w-full animate-pulse rounded-xl bg-surface-2" />
        <div className="h-72 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
