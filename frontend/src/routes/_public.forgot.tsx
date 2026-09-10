import { createFileRoute } from '@tanstack/react-router';
import { ForgotForm } from '@/features/auth/forgot-form';

export const Route = createFileRoute('/_public/forgot')({
  component: ForgotScreen,
});

function ForgotScreen() {
  return <ForgotForm />;
}
