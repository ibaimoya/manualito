import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ManualDetailResponse } from '@/shared/api/client';
import { manualDetailQueryOptions } from './use-manuals';

/** El estado vivo de procesamiento prevalece sobre un detalle todavía en caché. */
export function useManualProcessing(manual: ManualDetailResponse) {
  const queryClient = useQueryClient();
  const indexing = manual.status === 'indexing';
  const processing = useQuery({
    queryKey: ['manuals', 'processing', manual.id],
    queryFn: ({ signal }) => api.getManualProcessing(manual.id, signal),
    enabled: indexing,
    refetchInterval: 1500,
  });
  const finished = indexing && processing.data != null && processing.data.status !== 'indexing';

  useEffect(() => {
    if (finished) {
      void queryClient.invalidateQueries({
        queryKey: manualDetailQueryOptions(manual.id).queryKey,
      });
    }
  }, [finished, queryClient, manual.id]);

  return { busy: indexing && !finished, processing };
}
