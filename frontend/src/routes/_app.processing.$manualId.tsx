import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { CheckIcon, FileTextIcon, InfoIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ScreenTopBar } from '@/app/Topbar';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/shared/api/client';
import { mapApiError } from '@/shared/api/error-mapper';
import { RecoveryContent } from '@/shared/components/recovery/RecoveryContent';
import recoveryStyles from '@/shared/components/recovery/recovery.module.css';
import {
  manualDetailQueryOptions,
  manualProcessingQueryOptions,
} from '@/features/manual/use-manuals';
import { tourTarget } from '@/features/tutorial/targets';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/processing/$manualId')({
  validateSearch: z.object({ name: z.string().min(1).optional() }),
  component: ProcessingScreen,
});

function ProcessingScreen() {
  const { t } = useTranslation('capture');
  const { manualId } = Route.useParams();
  const { name } = Route.useSearch();
  const navigate = useNavigate();
  const safeName = name?.trim() ?? t('processing.unnamed');

  const processing = useQuery(manualProcessingQueryOptions(manualId));
  const status = processing.data?.status;
  const indexed = status !== undefined && status !== 'indexing' && status !== 'failed';
  // El detalle resuelve a qué juego pertenece el manual ya indexado.
  const detail = useQuery({ ...manualDetailQueryOptions(manualId), enabled: indexed });
  const gameId = detail.data?.game_id ?? null;
  const failedQuery = [processing, detail].find(
    (query) => query.isError || (query.isPending && query.isFetched),
  );
  const failed = status === 'failed' || Boolean(failedQuery);

  // Pausa breve para que se vea el 100 % antes de saltar al hub del juego.
  useEffect(() => {
    if (!indexed || failed || gameId === null) return;
    const timer = setTimeout(() => {
      navigate({ to: '/game/$gameId', params: { gameId }, replace: true }).catch(() => undefined);
    }, 600);
    return () => clearTimeout(timer);
  }, [indexed, failed, gameId, navigate]);

  const pageCount = processing.data?.page_count ?? 0;
  const completedPages = indexed ? pageCount : (processing.data?.completed_pages ?? 0);
  const progress = pageCount > 0 ? Math.round((completedPages / pageCount) * 100) : 0;

  if (failed) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <ScreenTopBar crumb={safeName} />
        <div className="grid flex-1 items-center px-6 py-8">
          <ProcessingError
            processingFailed={status === 'failed'}
            error={failedQuery?.error ?? null}
            retrying={failedQuery?.isFetching ?? false}
            onRetry={() => failedQuery?.refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar crumb={safeName} />

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-4" {...tourTarget('processing-status')}>
          <div className="relative grid h-28 w-28 place-items-center rounded-full bg-primary-100">
            <div
              className={cn(
                'absolute inset-0 rounded-full border-4 border-transparent',
                'border-t-primary',
                indexed && 'opacity-0',
              )}
              style={indexed ? undefined : { animation: 'mn-spin 1.4s linear infinite' }}
              aria-hidden="true"
            />
            {indexed ? (
              <CheckIcon size={40} className="feedback-enter text-primary-700" aria-hidden="true" />
            ) : (
              <FileTextIcon size={40} className="text-primary-700" aria-hidden="true" />
            )}
          </div>
          <div className="text-center">
            <h2 className="font-display text-xl font-bold tracking-tight text-fg">
              {t('processing.title')}
            </h2>
            <p className="mt-1 max-w-xs text-sm text-fg-2">{t('processing.description')}</p>
          </div>
        </div>

        <div className="flex flex-col gap-6" {...tourTarget('processing-progress')}>
          <Progress
            value={progress}
            aria-label={t('processing.progressLabel', { progress })}
            aria-valuetext={`${progress}%`}
          />
          {pageCount > 0 ? (
            <p className="mono text-center text-xs text-fg-3">
              {t('processing.pageCount', { count: pageCount, completed: completedPages })}
            </p>
          ) : null}
        </div>

        <p
          className="flex items-center justify-center gap-2 text-xs text-fg-3"
          {...tourTarget('processing-info')}
        >
          <InfoIcon aria-hidden="true" size={14} />
          {t('processing.info')}
        </p>
      </div>
    </div>
  );
}

function ProcessingError({
  processingFailed,
  error,
  retrying,
  onRetry,
}: Readonly<{
  processingFailed: boolean;
  error: Error | null;
  retrying: boolean;
  onRetry: () => Promise<unknown> | undefined;
}>) {
  const { t } = useTranslation('capture');
  const { t: commonT } = useTranslation();
  // Reintentar consulta el estado, no vuelve a procesar el archivo.
  const [failure, setFailure] = useState(error);
  if (error && error !== failure) setFailure(error);
  const notFound = !processingFailed && failure instanceof ApiError && failure.status === 404;
  const offline = !processingFailed && mapApiError(failure).code === 'network';
  let kind: 'not-found' | 'offline' | 'error' = offline ? 'offline' : 'error';
  if (notFound) kind = 'not-found';
  const copy = processingFailed
    ? 'failure'
    : ({ 'not-found': 'notFound', offline: 'connection', error: 'load' } as const)[kind];

  return (
    <RecoveryContent
      kind={kind}
      retrying={!processingFailed && retrying}
      title={t(`processing.${copy}Title`)}
      description={t(`processing.${copy}Description`)}
    >
      <div className={recoveryStyles.actions} {...tourTarget('processing-actions')}>
        {processingFailed ? (
          <Button asChild className={recoveryStyles.primary}>
            <Link to="/capture/source">{t('processing.uploadAnother')}</Link>
          </Button>
        ) : (
          !notFound && (
            <Button
              className={recoveryStyles.primary}
              loading={retrying}
              onClick={() => void onRetry()}
            >
              <ArrowClockwiseIcon data-icon-motion="rotate" size={20} aria-hidden="true" />
              {commonT('actions.retry')}
            </Button>
          )
        )}
        <Button
          asChild
          variant={notFound ? 'primary' : 'secondary'}
          className={notFound ? recoveryStyles.primary : recoveryStyles.secondary}
        >
          <Link to="/history">{t('processing.backToLibrary')}</Link>
        </Button>
      </div>
    </RecoveryContent>
  );
}
