import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, type ManualSummary } from '@/shared/api/client';

/** Raíz de las claves de cache de manuales (lista + detalle). */
const MANUALS_KEY = ['manuals'] as const;
const LIST_KEY = [...MANUALS_KEY, 'list'] as const;

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
 * Conjunto de manuales/juegos del usuario con un manual indexándose ahora.
 * Alimenta las ruletas contextuales en cualquier pantalla que muestre el juego.
 */
export function useProcessingManuals() {
  const { data } = useQuery(manualsQueryOptions());
  return useMemo(() => {
    const manualIds = new Set<string>();
    const gameIds = new Set<string>();
    for (const manual of data ?? []) {
      if (manual.status === 'indexing') {
        manualIds.add(manual.id);
        gameIds.add(manual.game_id);
      }
    }
    return { manualIds, gameIds };
  }, [data]);
}

/** Detalle de un manual con páginas + OCR ("GET /api/manuals/{id}"). */
export function manualDetailQueryOptions(manualId: string) {
  return queryOptions({
    queryKey: [...MANUALS_KEY, 'detail', manualId],
    queryFn: ({ signal }) => api.getManual(manualId, signal),
    staleTime: 60_000,
  });
}

/** Progreso de indexado del manual; se re-sondea mientras siga en "indexing". */
export function manualProcessingQueryOptions(manualId: string) {
  return queryOptions({
    queryKey: [...MANUALS_KEY, 'processing', manualId],
    queryFn: ({ signal }) => api.getManualProcessing(manualId, signal),
    refetchInterval: (query) => (query.state.data?.status === 'indexing' ? 1_500 : false),
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
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY }).catch(() => undefined);
      // Borrar un manual cambia el pool del juego: refresca detalle, biblioteca
      // y explicación (si no, el hub muestra el manual borrado hasta recargar).
      qc.invalidateQueries({ queryKey: ['games'] }).catch(() => undefined);
    },
  });
}
