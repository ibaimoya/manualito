import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Check, FileText, LogOut, Moon, Sun, SunMoon, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useTheme, type AccentVariant, type ThemeMode } from '@/app/theme';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Avatar } from '@/shared/components/Avatar';
import { authApi } from '@/shared/api/auth';
import { useAuth, useLogout } from '@/features/auth/use-auth';
import { storage } from '@/shared/lib/storage';

const RESEND_COOLDOWN = 45;

export const Route = createFileRoute('/_app/settings')({
  component: SettingsScreen,
});

function SettingsScreen() {
  const theme = useTheme();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  // Para indicar al usuario qué tema está REALMENTE viendo cuando el
  // modo es 'auto' (sigue el SO).
  const systemPrefersDark = useNamedMediaQuery('darkMode');
  const currentSystemTheme = systemPrefersDark ? 'oscuro' : 'claro';
  const modeHint =
    theme.mode === 'auto' ? `Sigue el sistema (actualmente: ${currentSystemTheme})` : undefined;

  function wipeAll(): void {
    storage.wipeAll();
    storage.resetOnboarding();
    toast.success('Historial borrado');
    setConfirmingWipe(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-[var(--m-space-5)] px-[var(--m-space-5)] pb-10 pt-[var(--m-space-4)] md:max-w-3xl md:px-[var(--m-space-8)] md:pt-[var(--m-space-8)]">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Ajustes</h1>
      </header>

      <AccountSection />

      <Group title="Apariencia">
        <Row label="Tema" hint={modeHint}>
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

      <Group title="Privacidad y datos">
        <Row
          label="Archivos del manual"
          hint="Se guardan asociados al manual y se eliminan al borrarlo."
        >
          <Badge role="status" ariaLabel="Archivos gestionados por el servidor">
            <FileText size={12} aria-hidden="true" /> Servidor
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
              Esta acción no se puede deshacer. El servidor mantiene los manuales indexados.
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
  const [cooldown, setCooldown] = useState(0);
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(user?.email ?? ''),
    onSuccess: () => setCooldown(RESEND_COOLDOWN),
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!user) return null;
  const verified = user.email_verified_at !== null;
  const displayName = user.username || user.email;

  return (
    <Group title="Cuenta" hint="Tu perfil y tu acceso">
      <div className="flex items-center gap-3.5 p-4">
        <Avatar name={displayName} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-fg">{displayName}</p>
          <p className="truncate text-sm text-fg-3">{user.email}</p>
        </div>
      </div>

      <Row
        label="Email"
        hint={verified ? 'Verificado · tu cuenta está protegida' : 'Aún sin verificar'}
      >
        <EmailVerificationControl
          verified={verified}
          cooldown={cooldown}
          sending={resend.isPending}
          onResend={() => resend.mutate()}
        />
      </Row>

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

function EmailVerificationControl({
  verified,
  cooldown,
  sending,
  onResend,
}: Readonly<{
  verified: boolean;
  cooldown: number;
  sending: boolean;
  onResend: () => void;
}>) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success">
        <Check size={13} strokeWidth={2.5} aria-hidden="true" /> Verificado
      </span>
    );
  }
  if (cooldown > 0) {
    return (
      <span className="shrink-0 text-xs font-semibold text-fg-3">Reenviado · {cooldown}s</span>
    );
  }
  return (
    <Button type="button" size="sm" variant="secondary" loading={sending} onClick={onResend}>
      {sending ? 'Enviando…' : 'Reenviar verificación'}
    </Button>
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
  children,
}: Readonly<{
  label: string;
  hint?: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex items-center gap-[var(--m-space-3)] p-[var(--m-space-4)]">
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
