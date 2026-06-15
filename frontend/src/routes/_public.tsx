import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

/** Área sin sesión (login/registro/recuperar): si ya hay sesión, va a Home. */
export const Route = createFileRoute('/_public')({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: '/home' });
    }
  },
  component: Outlet,
});
