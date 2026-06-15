import { createFileRoute, redirect } from '@tanstack/react-router';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { storage } from '@/shared/lib/storage';

export const Route = createFileRoute('/onboarding')({
  // Se ve una vez por dispositivo: la URL directa redirige a /home.
  beforeLoad: () => {
    if (storage.isOnboardingSeen()) {
      throw redirect({ to: '/home' });
    }
  },
  component: Onboarding,
});
