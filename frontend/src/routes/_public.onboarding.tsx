import { createFileRoute } from '@tanstack/react-router';
import { Onboarding } from '@/features/onboarding/Onboarding';

export const Route = createFileRoute('/_public/onboarding')({
  component: Onboarding,
});
