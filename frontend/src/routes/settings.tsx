import { createFileRoute } from '@tanstack/react-router';
import { Moon, Sun, SunMoon, Type, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme, type AccentVariant, type Density, type ThemeMode } from '@/app/theme';
import { useDarkMode } from '@/shared/hooks/useMediaQuery';
import { storage } from '@/shared/lib/storage';

export const Route = createFileRoute('/settings')({
  component: SettingsScreen,
});

const APP_VERSION = '0.1.0';

function SettingsScreen() {
  const theme = useTheme();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  // Para indicar al usuario qué tema está REALMENTE viendo cuando el
  // modo es 'auto' (sigue el SO).  Catálogo bug #37.
  const systemPrefersDark = useDarkMode();
  const currentSystemTheme = systemPrefersDark ? 'oscuro' : 'claro';
  const modeHint =
    theme.mode === 'auto'
      ? `Sigue el sistema (actualmente: ${currentSystemTheme})`
      : undefined;

  function wipeAll(): void {
    storage.wipeAll();
    storage.resetOnboarding();
    toast.success('Historial borrado');
    setConfirmingWipe(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pb-10 pt-4 md:max-w-2xl md:px-8 md:pt-10">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Ajustes
        </h1>
      </header>

      <Group title="Apariencia">
        <Row label="Modo" hint={modeHint}>
          <SegmentedControl<ThemeMode>
            value={theme.mode}
            onChange={theme.setMode}
            ariaLabel="Modo de color"
            options={[
              { value: 'light', label: 'Claro', icon: <Sun size={14} /> },
              { value: 'dark', label: 'Oscuro', icon: <Moon size={14} /> },
              { value: 'auto', label: 'Auto', icon: <SunMoon size={14} /> },
            ]}
          />
        </Row>
        <Row label="Densidad" hint="Espaciado del contenido">
          <SegmentedControl<Density>
            value={theme.density}
            onChange={theme.setDensity}
            ariaLabel="Densidad"
            options={[
              { value: 'compact', label: 'Compacta' },
              { value: 'comfy', label: 'Cómoda' },
            ]}
          />
        </Row>
        <Row label="Color de acento" hint="Color del CTA principal">
          <SegmentedControl<AccentVariant>
            value={theme.accent}
            onChange={theme.setAccent}
            ariaLabel="Color de acento"
            options={[
              { value: 'amber', label: 'Ámbar' },
              { value: 'blue', label: 'Azul' },
            ]}
          />
        </Row>
        <Row label="Tamaño de texto" hint="Próximamente">
          <Button size="sm" variant="ghost" disabled>
            <Type size={16} /> Sistema
          </Button>
        </Row>
      </Group>

      <Group title="Privacidad y datos">
        {/*
          Indicador estático (no toggle): el comportamiento es siempre activo
          por diseño — las fotos no se guardan en el backend tras OCR.
          Catálogo bug #14: evitamos un Switch interactivo que el usuario
          podría intentar tocar pensando que cambia algo.  Badge + role
          'status' deja claro que es informativo, no accionable.
        */}
        <Row
          label="Borrar fotos tras procesar"
          hint="Siempre activo. Tus fotos solo viajan al servidor cuando creas un manual."
        >
          <Badge role="status" ariaLabel="Borrado tras procesar: siempre activo">
            <ImageIcon size={12} aria-hidden="true" /> Siempre activo
          </Badge>
        </Row>
        <Row label="Borrar historial">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-error hover:bg-error-bg"
            onClick={() => setConfirmingWipe(true)}
          >
            <Trash2 size={14} />
            Borrar todo
          </Button>
        </Row>
        {confirmingWipe ? (
          <div
            role="alertdialog"
            aria-label="Confirmar borrado del historial"
            className="border-t border-border bg-error-bg p-4"
          >
            <p className="text-sm font-semibold text-error">
              ¿Borrar todos los manuales y conversaciones de este dispositivo?
            </p>
            <p className="mt-1 text-xs text-fg-2">
              Esta acción no se puede deshacer.  El servidor mantiene los manuales indexados.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmingWipe(false)}>
                Cancelar
              </Button>
              <Button size="sm" variant="destructive" onClick={wipeAll}>
                Borrar todo
              </Button>
            </div>
          </div>
        ) : null}
      </Group>

      <p className="mono mt-2 text-center text-[11px] text-fg-3 tracking-[0.1em]">
        v {APP_VERSION} · phi4 · ChromaDB · FastAPI
      </p>
    </div>
  );
}

function Group({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.1em] text-fg-3">
        {title}
      </h2>
      <Card className="divide-y divide-border overflow-hidden">{children}</Card>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex-1">
        <div className="font-semibold text-fg">{label}</div>
        {hint ? <div className="text-xs text-fg-3">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Badge({
  children,
  role,
  ariaLabel,
}: Readonly<{
  children: ReactNode;
  role?: string;
  ariaLabel?: string;
}>) {
  return (
    <span
      role={role}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success"
    >
      {children}
    </span>
  );
}
