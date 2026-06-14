import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { PrivacySections } from '@/features/legal/PrivacySections';

/**
 * Pantalla legal dentro del shell de la app (sidebar + breadcrumb "Inicio ›
 * Política de privacidad"), no una página suelta. Es pública: el guard de "_app"
 * deja pasar "/privacy" sin sesión. El consentimiento previo al registro usa
 * además "PrivacyPolicyModal", así que el aviso legal siempre está accesible.
 */
export const Route = createFileRoute('/_app/privacy')({
  component: PrivacyScreen,
});

function PrivacyScreen() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-14 pt-6 md:px-8 md:pt-10">
      <header className="text-center">
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
      </header>

      <PrivacySections className="mt-9" />
    </div>
  );
}
