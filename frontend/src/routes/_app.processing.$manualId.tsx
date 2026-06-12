import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FileText, Info } from 'lucide-react';
import { z } from 'zod';
import { ScreenTopBar } from '@/app/Topbar';
import { Progress } from '@/components/ui/progress';
import {
  manualDetailQueryOptions,
  manualProcessingQueryOptions,
} from '@/features/manual/use-manuals';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/processing/$manualId')({
  validateSearch: z.object({ name: z.string().min(1).optional() }),
  component: ProcessingScreen,
});

function ProcessingScreen() {
  const { manualId } = Route.useParams();
  const { name } = Route.useSearch();
  const navigate = useNavigate();
  const safeName = name?.trim() ?? 'Manual sin nombre';

  const processing = useQuery(manualProcessingQueryOptions(manualId));
  const status = processing.data?.status;
  const indexed = status !== undefined && status !== 'indexing' && status !== 'failed';
  // El detalle resuelve a qué juego pertenece el manual ya indexado.
  const detail = useQuery({ ...manualDetailQueryOptions(manualId), enabled: indexed });
  const gameId = detail.data?.game_id ?? null;
  const failed = status === 'failed' || processing.isError || detail.isError;

  // Pausa breve para que se vea el 100 % antes de saltar al hub del juego.
  useEffect(() => {
    if (gameId === null) return;
    const timer = setTimeout(() => {
      navigate({ to: '/game/$gameId', params: { gameId }, replace: true }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [gameId, navigate]);

  const pageCount = processing.data?.page_count ?? 0;
  const completedPages = indexed ? pageCount : (processing.data?.completed_pages ?? 0);
  const progress = pageCount > 0 ? Math.round((completedPages / pageCount) * 100) : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar crumb={safeName} />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="relative grid h-28 w-28 place-items-center rounded-full bg-primary-100">
            <div
              className={cn(
                'absolute inset-0 rounded-full border-4 border-transparent',
                failed ? 'border-t-error' : 'border-t-primary',
              )}
              style={failed ? undefined : { animation: 'mn-spin 1.4s linear infinite' }}
              aria-hidden="true"
            />
            <FileText
              size={40}
              className={failed ? 'text-error' : 'text-primary-700'}
              strokeWidth={1.5}
            />
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-bold tracking-tight text-fg">
              {failed ? 'No se ha podido procesar' : 'Leyendo tu manual…'}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-fg-2">
              {failed
                ? 'Revisa el archivo o vuelve a intentarlo con otro manual.'
                : 'Puede tardar más con PDFs o varias páginas. Puedes minimizar la app si quieres.'}
            </p>
          </div>
        </div>

        {failed ? null : (
          <>
            <Progress
              value={progress}
              aria-label={`Progreso: ${progress} por ciento`}
              aria-valuetext={`${progress}%`}
            />
            {pageCount > 0 ? (
              <p className="mono text-center text-xs text-fg-3">
                {completedPages}/{pageCount} páginas
              </p>
            ) : null}
          </>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-fg-3">
          <Info size={14} />
          {failed
            ? 'No se ha guardado ningun resultado util para este manual.'
            : 'Tus archivos se usan para procesar e indexar este manual.'}
        </p>
      </div>
    </div>
  );
}
