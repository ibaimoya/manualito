import { createFileRoute, useRouter } from '@tanstack/react-router';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginScreen,
});

function LoginScreen() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const onAuthenticated = () => {
    if (redirect) {
      router.history.push(redirect);
    } else {
      void router.navigate({ to: '/home' });
    }
  };
  return (
    <AuthShell>
      <LoginForm onAuthenticated={onAuthenticated} />
    </AuthShell>
  );
}
