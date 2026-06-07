import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Check, FileText, Info } from 'lucide-react';
import { z } from 'zod';
import { Progress } from '@/components/ui/progress';
import { useManualBootstrap } from '@/features/processing/useManualBootstrap';
import { storage } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';

type ProcessingStep = ReturnType<typeof useManualBootstrap>['steps'][number];

const processingSearchSchema = z.object({
  name: z.string().min(1).optional(),
});

export const Route = createFileRoute('/_app/processing/$manualId')({
  validateSearch: processingSearchSchema,
  component: ProcessingScreen,
});

function ProcessingScreen() {
  const { manualId } = Route.useParams();
  const { name } = Route.useSearch();
  const navigate = useNavigate();
  const safeName = name?.trim() ?? 'Manual sin nombre';

  // Registrar/touchear el manual en local apenas llega aquí.
  useEffect(() => {
    const existing = storage.listManuals().find((m) => m.manual_id === manualId);
    if (existing) {
      storage.touchManual(manualId);
      return;
    }
    storage.upsertManual({
      manual_id: manualId,
      name: safeName,
      created_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      chunks_indexed: 0,
    });
  }, [manualId, safeName]);

  const { steps, progress, done, hasAnyAnswer, result } = useManualBootstrap(manualId, safeName);
  const failed = done && !result && !hasAnyAnswer;

  // Cuando termine y haya al menos un acierto → navega al Result.
  useEffect(() => {
    if (done && result) {
      const timer = setTimeout(() => {
        navigate({ to: '/result/$manualId', params: { manualId } }).catch(() => undefined);
      }, 600); // pequeña pausa para que el usuario vea "completo"
      return () => clearTimeout(timer);
    }
  }, [done, result, navigate, manualId]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-4xl">
      <header className="border-b border-border px-4 py-3">
        <h1 className="font-display text-base font-bold">Procesando «{safeName}»</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-6">
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

        <Progress
          value={progress}
          aria-label={`Progreso: ${progress} por ciento`}
          aria-valuetext={`${progress}%`}
        />

        <ol className="overflow-hidden rounded-2xl border border-border">
          {steps.map((s, idx) => (
            <li
              key={s.id}
              className={cn('flex items-center gap-3 p-4', idx > 0 ? 'border-t border-border' : '')}
            >
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                  s.state === 'done' && 'bg-success-bg text-success',
                  s.state === 'running' && 'bg-primary-100 text-primary',
                  s.state === 'failed' && 'bg-error-bg text-error',
                  s.state === 'pending' && 'bg-surface text-fg-3',
                )}
                aria-hidden="true"
              >
                <StepStatusIcon state={s.state} />
              </span>
              <div className="flex-1">
                <div
                  className={cn(
                    'text-sm font-semibold',
                    s.state === 'pending' ? 'text-fg-3' : 'text-fg',
                  )}
                >
                  {s.label}
                </div>
                <StepDetail step={s} />
              </div>
            </li>
          ))}
        </ol>

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

function StepDetail({ step }: Readonly<{ step: ProcessingStep }>) {
  if (step.state === 'failed' && step.error) {
    return <div className="mono text-xs text-error">{step.error}</div>;
  }
  if (step.text) {
    return <div className="mono text-xs text-fg-3">{step.text}</div>;
  }
  return null;
}

function StepStatusIcon({ state }: Readonly<{ state: ProcessingStep['state'] }>) {
  if (state === 'done') return <Check size={16} strokeWidth={2.5} />;
  if (state === 'running') {
    return (
      <span
        className="block h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent"
        style={{ animation: 'mn-spin 0.9s linear infinite' }}
      />
    );
  }
  if (state === 'failed') return <span className="font-bold">!</span>;
  return <span className="block h-1.5 w-1.5 rounded-full bg-current" />;
}
