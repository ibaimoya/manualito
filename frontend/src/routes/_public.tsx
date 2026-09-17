import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { AuthShell } from '@/features/auth/auth-shell';

/** Área sin sesión (login/registro/recuperar): si ya hay sesión, va a Home. */
export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: '/home' });
    }
  },
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <AuthShell>
      <Outlet />
    </AuthShell>
  );
}
