import { type ReactNode } from 'react';
import { LockUp, Meeple } from '@/shared/components/Brand';

/**
 * Lienzo de las pantallas sin sesión (login/registro/recuperar): fondo cálido,
 * logo y tarjeta centrada. Escritorio y móvil comparten layout (la tarjeta se
 * adapta al ancho).
 */
export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // h-dvh + scroll interno: con body{overflow:hidden}, un min-h que crece
    // dejaría el formulario cortado sin scroll en viewports bajos. El fondo
    // decorativo va `fixed` para no desplazarse con el contenido.
    <div className="relative h-dvh overflow-y-auto bg-surface">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(55% 45% at 85% 10%, rgba(224,122,31,.12), transparent 60%),' +
            'radial-gradient(45% 40% at 6% 96%, rgba(44,110,145,.10), transparent 60%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -bottom-16 -right-14 text-fg opacity-[0.04]"
      >
        <Meeple size={400} />
      </div>
      <div className="relative mx-auto flex min-h-full w-full max-w-[420px] flex-col items-center justify-center gap-6 px-6 py-10">
        <LockUp withTagline={false} />
        <div className="w-full rounded-2xl border border-border bg-bg p-7 shadow-md sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
