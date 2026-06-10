import { createFileRoute, useRouter } from '@tanstack/react-router';
import { AuthShell } from '@/features/auth/auth-shell';
import { RegisterForm } from '@/features/auth/register-form';

export const Route = createFileRoute('/_public/register')({
  component: RegisterScreen,
});

function RegisterScreen() {
  const router = useRouter();
  return (
    <AuthShell>
      <RegisterForm
        onAuthenticated={() => router.navigate({ to: '/home' }).catch(() => undefined)}
      />
    </AuthShell>
  );
}
