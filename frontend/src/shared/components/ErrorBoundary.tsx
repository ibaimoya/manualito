import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

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
 *
 * Si el caller no pasa `fallback`, se renderiza una pantalla genérica
 * con tono "calm + accionable" (igual estilo que ScreenError del bundle).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // En producción se debería enviar a un servicio de errores (Sentry, ...).
    // Para el TFG: console.error es suficiente — no llamar nunca a console.log
    // con datos sensibles del usuario.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <DefaultErrorView error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorView({ error, reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center"
    >
      <div
        className="grid place-items-center rounded-full"
        style={{
          width: 96,
          height: 96,
          background: 'var(--m-error-bg)',
          color: 'var(--m-error)',
        }}
      >
        <AlertTriangle size={40} strokeWidth={1.6} aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-bold text-fg">Algo ha fallado</h1>
        <p className="mt-2 text-base text-fg-2">
          Hemos encontrado un error inesperado.  Recarga la página o vuelve a intentarlo.
        </p>
      </div>
      <button
        onClick={() => {
          reset();
          const runtimeWindow = (globalThis as unknown as { window?: Window }).window;
          if (runtimeWindow !== undefined) {
            runtimeWindow.location.reload();
          }
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-body text-base font-semibold text-fg-inv shadow-sm transition-colors hover:bg-primary-600"
      >
        <RefreshCw size={18} strokeWidth={2} />
        Recargar
      </button>
      {import.meta.env.DEV ? (
        <pre className="mono mt-4 max-w-xl overflow-auto rounded-md bg-surface p-3 text-left text-xs text-fg-3">
          {error.message}
        </pre>
      ) : null}
    </div>
  );
}
