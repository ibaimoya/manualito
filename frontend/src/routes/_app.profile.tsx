import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCheck,
  Dices,
  Lock,
  LogOut,
  Mail,
  MessagesSquare,
  Pencil,
  ScrollText,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip } from '@/components/ui/tooltip';
import { EditProfileDialog } from '@/features/profile/EditProfileDialog';
import { accountStatsQueryOptions } from '@/features/profile/use-account';
import { useAuth, useLogout } from '@/features/auth/use-auth';
import { useResendVerification } from '@/features/auth/use-resend-verification';
import type { AuthUser } from '@/shared/api/auth';
import { Avatar } from '@/shared/components/Avatar';
import { SectionHead } from '@/shared/components/SectionHead';
import { elideEmail } from '@/shared/lib/elideEmail';

export const Route = createFileRoute('/_app/profile')({
  component: ProfileScreen,
});

function memberSince(iso: string): string {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(iso));
}

function ProfileScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return <ProfileLoaded user={user} />;
}

function ProfileLoaded({ user }: Readonly<{ user: AuthUser }>) {
  const logout = useLogout();
  const [editOpen, setEditOpen] = useState(false);
  const displayName = user.username || user.email;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-10 pt-5 md:px-8 md:pt-8">
      <Card className="p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar
            name={displayName}
            size={96}
            color={user.avatar_color}
            figure={user.avatar_figure}
          />
          <div className="min-w-56 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 truncate font-display text-2xl font-extrabold tracking-tight text-fg md:text-3xl">
                {displayName}
              </h1>
              {user.email_verified_at === null ? null : (
                <Tooltip content="Email verificado">
                  {/* translate-y: el nombre en minúsculas baja su centro óptico. */}
                  <button
                    type="button"
                    aria-label="Email verificado"
                    className="grid shrink-0 translate-y-[2px] cursor-help place-items-center rounded-full text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                  >
                    <BadgeCheck size={22} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </Tooltip>
              )}
            </div>
            <p className="mono mt-0.5 truncate text-sm text-fg-3">@{user.username}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-fg-2">
                <Mail size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-fg-3" />
                <span className="truncate">{elideEmail(user.email)}</span>
              </span>
              <VerificationBadge user={user} />
            </div>
            <p className="mono mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
              Miembro desde {memberSince(user.created_at)}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-52">
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} strokeWidth={2} />
              Editar perfil
            </Button>
            <Button asChild variant="secondary">
              <Link to="/security">
                <Lock size={16} strokeWidth={2} />
                Cuenta y seguridad
              </Link>
            </Button>
            <Button
              variant="ghost"
              className="text-error hover:bg-error-bg"
              loading={logout.isPending}
              onClick={() => logout.mutate()}
            >
              <LogOut size={16} strokeWidth={2} />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </Card>

      <section aria-label="Tu actividad">
        <SectionHead eyebrow="Tu actividad" title="En números" />
        <StatCards />
      </section>

      <EditProfileDialog open={editOpen} onOpenChange={setEditOpen} user={user} />
    </div>
  );
}

/** Solo para email sin verificar: el verificado luce su tick junto al nombre. */
function VerificationBadge({ user }: Readonly<{ user: AuthUser }>) {
  const { cooldown, resend } = useResendVerification(user.email);

  if (user.email_verified_at !== null) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning">
        <AlertTriangle size={12} strokeWidth={2.4} aria-hidden="true" />
        Sin verificar
      </span>
      {cooldown > 0 ? (
        <span className="text-xs font-semibold text-fg-3">Reenviado · {cooldown}s</span>
      ) : (
        <button
          type="button"
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="text-xs font-semibold text-accent hover:underline disabled:opacity-60"
        >
          {resend.isPending ? 'Enviando…' : 'Reenviar correo'}
        </button>
      )}
    </span>
  );
}

function StatCards() {
  const stats = useQuery(accountStatsQueryOptions());
  const items: ReadonlyArray<{
    label: string;
    value: number | undefined;
    icon: ReactNode;
    chipClass: string;
  }> = [
    {
      label: 'Juegos',
      value: stats.data?.games_count,
      icon: <Dices size={17} strokeWidth={2} />,
      chipClass: 'bg-primary-100 text-primary-700',
    },
    {
      label: 'Conversaciones',
      value: stats.data?.conversations_count,
      icon: <MessagesSquare size={17} strokeWidth={2} />,
      chipClass: 'bg-accent-100 text-accent',
    },
    {
      label: 'Manuales',
      value: stats.data?.manuals_count,
      icon: <ScrollText size={17} strokeWidth={2} />,
      chipClass: 'bg-primary-100 text-primary-700',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="p-4 md:p-5">
          <span
            aria-hidden="true"
            className={`mb-3 grid size-9 place-items-center rounded-xl ${item.chipClass}`}
          >
            {item.icon}
          </span>
          {stats.isPending ? (
            <span className="block h-8 w-10 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />
          ) : (
            <span className="block font-display text-3xl font-extrabold tracking-tight text-fg">
              {item.value ?? '—'}
            </span>
          )}
          <span className="mt-0.5 block text-xs text-fg-3">{item.label}</span>
        </Card>
      ))}
    </div>
  );
}
