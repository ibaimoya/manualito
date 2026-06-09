import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = Readonly<{
  children: ReactNode;
  fallback?: (err: Error, reset: () => void) => ReactNode;
}>;

interface State {
  error: Error | null;
}

/**
 * Error boundary genérico — React no atrapa errores en hooks/render salvo con esto.
 * Acompaña al `errorComponent` que TanStack Router instala por ruta.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // En producción se enviaría a un servicio de errores (Sentry, …).
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <FullPageError
          message={this.state.error.message}
          onRetry={() => {
            this.reset();
            globalThis.location?.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * Pantalla de error a página completa, calmada y accionable. La comparten el
 * ErrorBoundary y el `errorComponent` raíz del router. El enlace de inicio usa
 * `<a>` (recarga real) porque en estado de error el router puede no ser fiable.
 */
export function FullPageError({
  message,
  onRetry,
}: Readonly<{ message?: string; onRetry?: () => void }>) {
  return (
    <div role="alert" className="grid min-h-dvh place-items-center bg-bg px-6 py-10">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-5 grid size-[76px] place-items-center rounded-full bg-error-bg text-error">
          <AlertTriangle size={34} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Algo ha fallado</h1>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-fg-2">
          Hemos tenido un problema inesperado. Vuelve a intentarlo; si sigue pasando, recarga la
          página.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2.5">
          <Button
            type="button"
            size="lg"
            block
            onClick={onRetry ?? (() => globalThis.location?.reload())}
          >
            <RefreshCw size={18} strokeWidth={2} />
            Reintentar
          </Button>
          <Button asChild size="lg" block variant="ghost">
            <a href="/home">Volver al inicio</a>
          </Button>
        </div>
        {import.meta.env.DEV && message ? (
          <pre className="mono mt-5 max-w-full overflow-auto rounded-lg bg-surface p-3 text-left text-xs text-fg-3">
            {message}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
