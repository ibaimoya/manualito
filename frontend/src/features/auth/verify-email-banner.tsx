import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/shared/api/auth';
import { useAuth } from './use-auth';

const DISMISS_KEY = 'manualito.verifyBanner.dismissed';
const RESEND_COOLDOWN = 45;

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
  const [cooldown, setCooldown] = useState(0);
  const resend = useMutation({
    mutationFn: (email: string) => authApi.resendVerification(email),
    onSuccess: () => setCooldown(RESEND_COOLDOWN),
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
  const resendLabel = resend.isPending ? 'Enviando…' : 'Reenviar';

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-3 border-b border-b-accent/20 border-l-[3px] border-l-accent bg-accent/10 px-4 py-2.5 text-sm"
    >
      <Info size={18} className="shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-fg">Verifica tu email para asegurar tu cuenta.</p>
      {cooldown > 0 ? (
        <span className="shrink-0 text-xs font-semibold text-fg-3">Reenviado · {cooldown}s</span>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={resend.isPending}
          onClick={() => resend.mutate(user.email)}
          className="shrink-0"
        >
          {resendLabel}
        </Button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descartar aviso"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-3 hover:text-fg-2"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
