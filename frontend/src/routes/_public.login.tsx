import { createFileRoute, useRouter } from '@tanstack/react-router';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginScreen,
});

/**
 * Solo se redirige a rutas internas: empieza por "/" pero no por "//" ni "/\"
 * (que el navegador resolvería como URL externa → open redirect / phishing).
 */
function safeInternalRedirect(target: string | undefined): string | null {
  if (!target?.startsWith('/')) return null;
  if (target.startsWith('//') || target.startsWith('/\\')) return null;
  return target;
}

function LoginScreen() {
  const router = useRouter();
  const { redirect } = Route.useSearch();
  const onAuthenticated = () => {
    const dest = safeInternalRedirect(redirect);
    if (dest) {
      router.history.push(dest);
    } else {
      router.navigate({ to: '/home' }).catch(() => undefined);
    }
  };
  return (
    <AuthShell>
      <LoginForm onAuthenticated={onAuthenticated} />
    </AuthShell>
  );
}
