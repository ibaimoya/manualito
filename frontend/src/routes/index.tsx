import { createFileRoute, redirect } from '@tanstack/react-router';
import { storage } from '@/shared/lib/storage';

/**
 * Ruta `/` — redirige automáticamente:
 *  - `/onboarding` si el usuario nunca lo ha visto,
 *  - `/home` en cualquier otro caso.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const seen = storage.isOnboardingSeen();
    throw redirect({ to: seen ? '/home' : '/onboarding' });
  },
});
