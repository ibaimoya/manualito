import { createFileRoute, redirect } from '@tanstack/react-router';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { storage } from '@/shared/lib/storage';

export const Route = createFileRoute('/onboarding')({
  // Si el usuario navega manualmente a /onboarding después de haberlo
  // visto (URL pegada, back/forward, marcador), redirigimos a /home.
  // El onboarding cinematográfico solo debe verse UNA vez por dispositivo.
  beforeLoad: () => {
    if (storage.isOnboardingSeen()) {
      throw redirect({ to: '/home' });
    }
  },
  component: Onboarding,
});
