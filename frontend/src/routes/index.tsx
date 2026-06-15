import { createFileRoute, redirect } from '@tanstack/react-router';
import { storage } from '@/shared/lib/storage';

/**
 * Ruta "/" — punto de entrada:
 *  - con sesión → "/home",
 *  - sin sesión → "/onboarding" (primera vez) o "/login" (ya visto).
 */
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: '/home' });
    }
    throw redirect({ to: storage.isOnboardingSeen() ? '/login' : '/onboarding' });
  },
});
