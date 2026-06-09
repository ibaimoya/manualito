import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type ManualSummary } from '@/shared/api/client';

/** Raíz de las claves de cache de manuales (lista + detalle). */
export const MANUALS_KEY = ['manuals'] as const;
const LIST_KEY = [...MANUALS_KEY, 'list'] as const;

/** Lista de manuales del usuario (`GET /api/manuals`). */
export function manualsQueryOptions() {
  return queryOptions({
    queryKey: LIST_KEY,
    queryFn: async ({ signal }) => (await api.listManuals(undefined, signal)).manuals,
    staleTime: 30_000,
  });
}

/** Detalle de un manual con páginas + OCR (`GET /api/manuals/{id}`). */
export function manualDetailQueryOptions(manualId: string) {
  return queryOptions({
    queryKey: [...MANUALS_KEY, 'detail', manualId],
    queryFn: ({ signal }) => api.getManual(manualId, signal),
    staleTime: 60_000,
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
    onSettled: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
