import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { createElement, useMemo } from 'react';
import type { ParseKeys } from 'i18next';
import { toast } from 'sonner';
import {
  api,
  type AnswerSource,
  type ManualDetailResponse,
  type ManualSummary,
  type UpdateManualInput,
} from '@/shared/api/client';
import type { ConversationMessage } from '@/shared/api/conversations';
import type { ExplanationSectionKey, GameDetail, GameExplanation } from '@/shared/api/games';
import { LiveTrans } from '@/shared/components/LiveTrans';

/** Raíz de las claves de caché de manuales (lista + detalle); invalidar tras
 *  subir, reprocesar o borrar para que las animaciones contextuales se enteren. */
export const manualsKey = ['manuals'] as const;
const LIST_KEY = [...manualsKey, 'list'] as const;

/** Lista de manuales del usuario ("GET /api/manuals"). */
export function manualsQueryOptions() {
  return queryOptions({
    queryKey: LIST_KEY,
    queryFn: async ({ signal }) => (await api.listManuals(undefined, signal)).manuals,
    staleTime: 30_000,
    // Mientras haya un manual indexándose, re-sondea para que las ruletas
    // contextuales (portadas, tarjetas) aparezcan y se apaguen solas.
    refetchInterval: (query) =>
      query.state.data?.some((manual) => manual.status === 'indexing') ? 2_000 : false,
  });
}

/**
 * Manuales/juegos del usuario con un manual indexándose ahora. Alimenta las
 * animaciones contextuales (portadas, tarjetas) en cualquier pantalla que
 * muestre el juego. "processingByGame" mapea juego → su manual indexándose
 * (el primero) para leer su progreso en la tarjeta del juego.
 */
export function useProcessingManuals() {
  const { data } = useQuery(manualsQueryOptions());
  return useMemo(() => {
    const manualIds = new Set<string>();
    const gameIds = new Set<string>();
    const processingByGame = new Map<string, string>();
    for (const manual of data ?? []) {
      if (manual.status === 'indexing') {
        manualIds.add(manual.id);
        gameIds.add(manual.game_id);
        if (!processingByGame.has(manual.game_id)) {
          processingByGame.set(manual.game_id, manual.id);
        }
      }
    }
    return { manualIds, gameIds, processingByGame };
  }, [data]);
}

/** Detalle de un manual con páginas + OCR ("GET /api/manuals/{id}"). */
export function manualDetailQueryOptions(manualId: string) {
  return queryOptions({
    queryKey: [...manualsKey, 'detail', manualId],
    queryFn: ({ signal }) => api.getManual(manualId, signal),
    staleTime: 60_000,
  });
}

/** Progreso de indexado del manual; se re-sondea mientras siga en "indexing". */
export function manualProcessingQueryOptions(manualId: string) {
  return queryOptions({
    queryKey: [...manualsKey, 'processing', manualId],
    queryFn: ({ signal }) => api.getManualProcessing(manualId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'indexing' ? 1_500 : false),
  });
}

/**
 * Progreso de indexado (página actual, total y %) listo para pintar. Devuelve
 * null mientras carga o sin "manualId"; las tarjetas muestran el % real.
 */
export function useManualProgress(manualId: string | undefined) {
  const { data } = useQuery({
    ...manualProcessingQueryOptions(manualId ?? ''),
    enabled: Boolean(manualId),
  });
  return useMemo(() => {
    if (!data) return null;
    const total = data.page_count;
    const done = Math.min(data.completed_pages, total);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const page = Math.min(total, done + 1);
    return { pct, page, total };
  }, [data]);
}

function cachedAuthorName(summary: ManualSummary, current: string | null): string | null {
  return summary.anonymous || summary.visibility !== 'shared' ? null : current;
}

function patchSource(summary: ManualSummary, source: AnswerSource): AnswerSource {
  if (source.manual_id !== summary.id) return source;
  return {
    ...source,
    manual_title: summary.title,
    author_name: cachedAuthorName(summary, source.author_name),
  };
}

// Retira el nombre oculto de la caché. Si se vuelve a mostrar, lo proporciona el servidor.
function patchCachedSources(qc: QueryClient, summary: ManualSummary): void {
  qc.setQueriesData<ConversationMessage[]>(
    { queryKey: ['conversations', 'messages'] },
    (messages) =>
      messages?.map((message) => ({
        ...message,
        sources: message.sources.map((source) => patchSource(summary, source)),
      })),
  );
  qc.setQueriesData<GameDetail>({ queryKey: ['games', 'detail'] }, (game) =>
    game
      ? {
          ...game,
          manuals: game.manuals.map((manual) =>
            manual.id === summary.id
              ? {
                  ...manual,
                  title: summary.title,
                  author_name: cachedAuthorName(summary, manual.author_name),
                }
              : manual,
          ),
        }
      : game,
  );
  qc.setQueriesData<GameExplanation>({ queryKey: ['games', 'explanation'] }, (explanation) => {
    if (!explanation?.sections) return explanation;
    const sections = { ...explanation.sections };
    for (const key of Object.keys(sections) as ExplanationSectionKey[]) {
      const section = sections[key];
      if (section) {
        sections[key] = {
          ...section,
          sources: section.sources.map((s) => patchSource(summary, s)),
        };
      }
    }
    return { ...explanation, sections };
  });
}

const DETAILS_READ_KEYS = [manualsKey, ['games'], ['conversations']] as const;

/** Guarda los cambios del mismo manual en orden, incluso al cerrar y reabrir el diálogo. */
export function useUpdateManualDetails(manualId: string) {
  const qc = useQueryClient();
  const detailKey = manualDetailQueryOptions(manualId).queryKey;
  const mutationKey = [...manualsKey, 'update', manualId] as const;
  return useMutation({
    mutationKey,
    scope: { id: `manual:${manualId}` },
    mutationFn: (input: UpdateManualInput) => api.updateManual(manualId, input),
    onSuccess: async (summary, input) => {
      await Promise.all(DETAILS_READ_KEYS.map((queryKey) => qc.cancelQueries({ queryKey })));
      qc.setQueryData<ManualDetailResponse>(detailKey, (old) =>
        old ? { ...old, ...summary, pages: old.pages } : old,
      );
      qc.setQueryData<ManualSummary[]>(LIST_KEY, (old) =>
        old?.map((manual) => (manual.id === summary.id ? { ...manual, ...summary } : manual)),
      );
      patchCachedSources(qc, summary);
      let i18nKey: ParseKeys<'manual'> = input.anonymous
        ? 'feedback.details.hidden'
        : 'feedback.details.shown';
      if (input.anonymous === undefined) i18nKey = 'feedback.details.renamed';
      toast.success(createElement(LiveTrans, { ns: 'manual', i18nKey }), {
        id: 'manual-details',
      });
    },
    onSettled: () => {
      // Query aún cuenta esta petición. Actualizamos las lecturas cuando termine la cola.
      if (qc.isMutating({ mutationKey }) > 1) return;
      for (const queryKey of DETAILS_READ_KEYS) {
        qc.invalidateQueries({ queryKey }).catch(() => undefined);
      }
    },
  });
}

/** Borra un manual con update optimista de la lista y rollback ante error. */
export function useDeleteManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (manualId: string) => api.deleteManual(manualId),
    onMutate: async (manualId) => {
      await qc.cancelQueries({ queryKey: LIST_KEY });
      const previous = qc.getQueryData<ManualSummary[]>(LIST_KEY);
      qc.setQueryData<ManualSummary[]>(LIST_KEY, (old) => old?.filter((m) => m.id !== manualId));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(LIST_KEY, ctx.previous);
      toast.error(createElement(LiveTrans, { ns: 'manual', i18nKey: 'feedback.delete.error' }), {
        id: 'manual-delete-error',
        description: createElement(LiveTrans, {
          ns: 'manual',
          i18nKey: 'feedback.delete.errorDescription',
        }),
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY }).catch(() => undefined);
      // Borrar un manual cambia el pool del juego: refresca detalle, biblioteca
      // y explicación (si no, el hub muestra el manual borrado hasta recargar).
      qc.invalidateQueries({ queryKey: ['games'] }).catch(() => undefined);
    },
  });
}
