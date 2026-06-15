import { useState } from 'react';
import { ExternalLink, Info, X } from 'lucide-react';
import { useAuth } from './use-auth';
import { useResendVerification } from './use-resend-verification';

const DISMISS_KEY = 'manualito.verifyBanner.dismissed';
// Mailpit captura cualquier correo saliente; su UI vive en el 8025 (compose.yaml).
const MAILPIT_URL = import.meta.env.VITE_MAILPIT_URL || 'http://localhost:8025';

function readDismissed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Aviso soft (no bloqueante) para verificar el email. Se autogestiona: no
 * renderiza si hay verificación, no hay sesión o se descartó esta sesión.
 */
export function VerifyEmailBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);
  const { cooldown, resend } = useResendVerification(user?.email ?? '');

  if (!user) return null;
  if (user.email_verified_at !== null || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      globalThis.sessionStorage?.setItem(DISMISS_KEY, '1');
    } catch {
      /* almacenamiento no disponible: se descarta solo en memoria */
    }
  };
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-b-accent/20 border-l-[3px] border-l-accent bg-accent/10 px-4 py-2.5 text-sm"
    >
      {/* En pantallas estrechas la frase ocupa su línea y las acciones bajan. */}
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
        <Info size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-fg">Verifica tu email para asegurar tu cuenta.</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <a
          href={MAILPIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
        >
          Abrir mi correo
          <ExternalLink size={13} strokeWidth={2.25} aria-hidden="true" />
        </a>
        <span aria-hidden="true" className="text-fg-3">
          ·
        </span>
        {cooldown > 0 ? (
          <span className="text-xs font-semibold text-fg-3">Reenviado · {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="text-sm font-semibold text-accent hover:underline disabled:opacity-60"
          >
            {resend.isPending ? 'Enviando…' : 'Reenviar'}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Descartar aviso"
          className="grid size-8 place-items-center rounded-lg text-fg-3 hover:text-fg-2"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
