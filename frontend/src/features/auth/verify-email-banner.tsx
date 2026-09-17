import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowSquareOutIcon, InfoIcon, XIcon } from '@phosphor-icons/react';
import { useAuth } from './use-auth';
import { useResendVerification } from './use-resend-verification';

const DISMISS_KEY = 'manualito.verifyBanner.dismissed';

function readDismissed(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function VerifyEmailBanner() {
  const { t } = useTranslation('shell');
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(readDismissed);
  const { cooldown, resend } = useResendVerification(user?.email ?? '');
  const mailpitUrl = import.meta.env.VITE_MAILPIT_URL?.trim();

  if (!user) return null;
  if (user.email_verified_at !== null || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      globalThis.sessionStorage?.setItem(DISMISS_KEY, '1');
    } catch {
      // Sin almacenamiento, el aviso queda descartado durante esta visita.
    }
  };
  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-b-accent/20 border-l-[3px] border-l-accent bg-accent/10 px-4 py-2.5 text-sm"
    >
      {/* En pantallas estrechas la frase ocupa su línea y las acciones bajan. */}
      <div className="flex min-w-0 basis-full items-center gap-3 sm:flex-1 sm:basis-auto">
        <InfoIcon size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-fg">{t('banner.message')}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {mailpitUrl && (
          <a
            href={mailpitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent hover:underline"
          >
            {t('banner.openMail')}
            <ArrowSquareOutIcon size={13} aria-hidden="true" />
          </a>
        )}
        {cooldown > 0 ? (
          <span className="text-xs font-semibold text-fg-3">
            {t('banner.resent', { seconds: cooldown })}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => resend.mutate()}
            disabled={resend.isPending}
            className="min-h-11 text-sm font-semibold text-accent hover:underline disabled:opacity-60"
          >
            {resend.isPending ? t('banner.sending') : t('banner.resend')}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('banner.dismiss')}
          className="grid size-11 place-items-center rounded-lg text-fg-3 hover:text-fg-2"
        >
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
