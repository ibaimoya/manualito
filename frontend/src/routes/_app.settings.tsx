import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, FileText, LogOut, Moon, Sun, SunMoon } from 'lucide-react';
import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme, type AccentVariant, type ThemeMode } from '@/app/theme';
import { DeleteAccountButton } from '@/features/account/DeleteAccount';
import { useAuth, useLogout } from '@/features/auth/use-auth';
import { Avatar } from '@/shared/components/Avatar';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/settings')({
  component: SettingsScreen,
});

function SettingsScreen() {
  const theme = useTheme();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-[var(--m-space-5)] px-[var(--m-space-5)] pb-10 pt-[var(--m-space-4)] md:max-w-3xl md:px-[var(--m-space-8)] md:pt-[var(--m-space-8)]">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Ajustes</h1>
      </header>

      <AccountSection />

      <Group title="Apariencia">
        {/* Hint estático: un caption que cambia con la selección reflowea. */}
        <Row label="Tema" hint="Claro, oscuro o el del sistema" stacked>
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
      </Group>

      <PrivacyDataSection />

      <footer className="mt-2 flex justify-center">
        <Link
          to="/privacy"
          className="text-xs font-medium text-fg-3 underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Política de privacidad
        </Link>
      </footer>
    </div>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const logout = useLogout();

  if (!user) return null;
  const displayName = user.username || user.email;

  return (
    <Group title="Cuenta">
      <Link
        to="/profile"
        className="flex items-center gap-3.5 p-4 transition-colors hover:bg-surface-2"
      >
        <Avatar
          name={displayName}
          size={52}
          color={user.avatar_color}
          figure={user.avatar_figure}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-fg">{displayName}</p>
          <p className="truncate text-sm text-fg-3">Editar perfil, seguridad y verificación</p>
        </div>
        <ChevronRight size={18} strokeWidth={2} className="shrink-0 text-fg-3" aria-hidden="true" />
      </Link>

      <Row label="Cerrar sesión" hint="En este dispositivo">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-error hover:bg-error-bg"
          loading={logout.isPending}
          onClick={() => logout.mutate()}
        >
          <LogOut size={14} strokeWidth={2} />
          Salir
        </Button>
      </Row>
    </Group>
  );
}

function PrivacyDataSection() {
  const { user } = useAuth();

  return (
    <Group title="Privacidad y datos">
      <Row
        label="Archivos del manual"
        hint="Se guardan en el servidor y se eliminan al borrar el manual o la cuenta."
      >
        <Badge role="status" ariaLabel="Archivos gestionados por el servidor">
          <FileText size={12} aria-hidden="true" /> Servidor
        </Badge>
      </Row>
      {user ? (
        <Row
          label="Borrar cuenta"
          hint="Elimina tu perfil, manuales, conversaciones y sesiones asociadas."
        >
          <DeleteAccountButton username={user.username} />
        </Row>
      ) : null}
    </Group>
  );
}

function Group({
  title,
  hint,
  children,
}: Readonly<{ title: string; hint?: string; children: ReactNode }>) {
  return (
    <section aria-label={title}>
      <div className="mb-2.5 px-1">
        <h2 className="font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-fg-3">{hint}</p> : null}
      </div>
      <Card className="divide-y divide-border overflow-hidden">{children}</Card>
    </section>
  );
}

function Row({
  label,
  hint,
  stacked,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  /** Control ancho: en móvil baja bajo el label (el hint cabe en una línea). */
  stacked?: boolean;
  children: ReactNode;
}>) {
  return (
    <div
      className={cn(
        'gap-[var(--m-space-3)] p-[var(--m-space-4)]',
        stacked ? 'flex flex-col items-end md:flex-row md:items-center' : 'flex items-center',
      )}
    >
      <div className={cn('flex-1', stacked && 'self-stretch')}>
        <div className="font-semibold text-fg">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-fg-3">{hint}</div> : null}
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
