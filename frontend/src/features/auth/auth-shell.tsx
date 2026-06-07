import { type ReactNode } from 'react';
import { LockUp } from '@/shared/components/Brand';

/**
 * Lienzo de las pantallas sin sesión (login/registro/recuperar): fondo cálido,
 * logo y tarjeta centrada. Escritorio y móvil comparten layout (la tarjeta se
 * adapta al ancho).
 */
export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface px-6 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(55% 45% at 85% 10%, rgba(224,122,31,.12), transparent 60%),' +
            'radial-gradient(45% 40% at 6% 96%, rgba(44,110,145,.10), transparent 60%)',
        }}
      />
      <div className="relative flex w-full max-w-[420px] flex-col items-center gap-6">
        <LockUp withTagline={false} />
        <div className="w-full rounded-2xl border border-border bg-bg p-7 shadow-md sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
