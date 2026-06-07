import { createFileRoute } from '@tanstack/react-router';
import { AuthShell } from '@/features/auth/auth-shell';
import { ForgotForm } from '@/features/auth/forgot-form';

export const Route = createFileRoute('/_public/forgot')({
  component: ForgotScreen,
});

function ForgotScreen() {
  return (
    <AuthShell>
      <ForgotForm />
    </AuthShell>
  );
}
