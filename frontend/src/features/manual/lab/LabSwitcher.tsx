import { useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { LAB_ESCENARIOS, type LabEscenario } from '@/features/manual/lab/fixtures';
import { cn } from '@/shared/lib/cn';

export type LabVariant = '0' | 'a' | 'b' | 'c' | 'lang' | 'd' | 'e' | 'f';

export interface LabSearch {
  v: LabVariant;
  esc: LabEscenario;
  th: 'light' | 'dark';
  acc: 'warm' | 'blue';
  conf: boolean;
  pg: number;
}

const VARIANTS: readonly LabVariant[] = ['0', 'a', 'b', 'c', 'lang', 'd', 'e', 'f'];

function SwitcherButton({
  active,
  onClick,
  children,
}: Readonly<{ active: boolean; onClick: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mono shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase',
        active ? 'bg-fg text-bg' : 'text-fg-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}

/** Panel flotante de control del laboratorio, al estilo feature flag interno.
    En móvil queda plegado tras un disparador único para no tapar la interfaz. */
export function LabSwitcher({ search }: Readonly<{ search: LabSearch }>) {
  const navigate = useNavigate();
  const [openOnMobile, setOpenOnMobile] = useState(false);

  function patch(next: Partial<LabSearch>): void {
    navigate({
      to: '/lab',
      search: { ...search, ...next },
      replace: true,
    }).catch(() => undefined);
  }

  if (!openOnMobile) {
    return (
      <>
        <button
          type="button"
          aria-label="Abrir los controles del laboratorio"
          onClick={() => setOpenOnMobile(true)}
          className="mono fixed right-3 top-3 z-50 grid size-11 place-items-center rounded-xl border border-border-strong bg-card/95 text-[11px] font-bold text-fg-2 shadow-md backdrop-blur md:hidden"
        >
          LAB
        </button>
        <DesktopPanel search={search} patch={patch} className="hidden md:flex" />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar los controles del laboratorio"
        onClick={() => setOpenOnMobile(false)}
        className="mono fixed right-3 top-3 z-[60] grid size-11 place-items-center rounded-xl border border-border-strong bg-fg text-[11px] font-bold text-bg shadow-md md:hidden"
      >
        LAB
      </button>
      <DesktopPanel search={search} patch={patch} className="flex" />
    </>
  );
}

function DesktopPanel({
  search,
  patch,
  className,
}: Readonly<{
  search: LabSearch;
  patch: (next: Partial<LabSearch>) => void;
  className?: string;
}>) {
  return (
    <aside
      aria-label="Controles del laboratorio"
      className={cn(
        'fixed right-3 z-50 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border-strong bg-card/95 px-2 py-1.5 shadow-md backdrop-blur max-md:top-16 md:bottom-3',
        className,
      )}
    >
      <span className="flex items-center gap-0.5">
        {VARIANTS.map((variant) => (
          <SwitcherButton
            key={variant}
            active={search.v === variant}
            onClick={() => patch({ v: variant })}
          >
            v{variant}
          </SwitcherButton>
        ))}
      </span>
      <span className="h-4 w-px bg-border-strong" aria-hidden="true" />
      <span className="flex items-center gap-0.5">
        {LAB_ESCENARIOS.map((esc) => (
          <SwitcherButton key={esc} active={search.esc === esc} onClick={() => patch({ esc })}>
            {esc}
          </SwitcherButton>
        ))}
      </span>
      <span className="h-4 w-px bg-border-strong" aria-hidden="true" />
      <SwitcherButton
        active={search.th === 'dark'}
        onClick={() => patch({ th: search.th === 'dark' ? 'light' : 'dark' })}
      >
        {search.th}
      </SwitcherButton>
      <SwitcherButton
        active={search.acc === 'blue'}
        onClick={() => patch({ acc: search.acc === 'blue' ? 'warm' : 'blue' })}
      >
        {search.acc}
      </SwitcherButton>
      <SwitcherButton active={search.conf} onClick={() => patch({ conf: !search.conf })}>
        conf
      </SwitcherButton>
    </aside>
  );
}
