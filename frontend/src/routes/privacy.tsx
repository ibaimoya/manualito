import { createFileRoute, Link, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { LockUp } from '@/shared/components/Brand';
import { PrivacySections } from '@/features/legal/PrivacySections';

/** Página legal neutral (con o sin sesión): se enlaza desde el consentimiento y desde Ajustes. */
export const Route = createFileRoute('/privacy')({
  component: PrivacyScreen,
});

function PrivacyScreen() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // Si se llegó aquí navegando (Ajustes, consentimiento) volvemos atrás; si se
  // abrió en directo (URL pegada, recarga) no hay historial → vamos al inicio.
  const goBack = () => {
    if (canGoBack) {
      router.history.back();
    } else {
      router.navigate({ to: '/' }).catch(() => undefined);
    }
  };
  return (
    // h-dvh exacto: body{overflow:hidden} exige que el scroll viva en <main>.
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-1.5 border-b border-border bg-bg/95 px-3 backdrop-blur md:px-6">
        <button
          type="button"
          onClick={goBack}
          aria-label="Volver"
          className="grid size-10 place-items-center rounded-xl text-fg-2 transition-colors hover:bg-surface hover:text-fg"
        >
          <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <Link to="/" aria-label="Manualito · ir al inicio">
          <LockUp scale={0.7} withTagline={false} />
        </Link>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-10 md:px-8 md:py-14">
        <article className="mx-auto max-w-[680px]">
          <div className="text-center">
            <span
              aria-hidden="true"
              className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-100 text-primary-700 shadow-xs"
            >
              <ShieldCheck size={26} strokeWidth={2} />
            </span>
            <p className="mono mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-700">
              Legal
            </p>
            <h1 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight md:text-4xl">
              Política de privacidad
            </h1>
            <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
              Qué guardamos y para qué, sin pelearte con la letra pequeña. Si algo no se entiende,
              escríbenos.
            </p>
          </div>

          <PrivacySections className="mt-9" />

          <p className="mono mt-6 text-center text-[11px] tracking-[0.12em] text-fg-3">
            Manualito
          </p>
        </article>
      </main>
    </div>
  );
}
