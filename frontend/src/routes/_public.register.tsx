import { createFileRoute, useRouter } from '@tanstack/react-router';
import { RegisterForm } from '@/features/auth/register-form';

export const Route = createFileRoute('/_public/register')({
  component: RegisterScreen,
});

function RegisterScreen() {
  const router = useRouter();
  return (
    <RegisterForm onAuthenticated={() => router.navigate({ to: '/home' }).catch(() => undefined)} />
  );
}
