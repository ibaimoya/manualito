import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import i18n from '@/app/i18n';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@tests/_helpers/server';
import { ThemeProvider } from '@/app/theme';
import { VerifyEmailBanner } from '@/features/auth/verify-email-banner';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import {
  resetResendCooldown,
  useResendVerification,
} from '@/features/auth/use-resend-verification';
import type { AuthUser } from '@/shared/api/auth';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  vi.unstubAllEnvs();
  server.resetHandlers();
  resetResendCooldown();
  try {
    sessionStorage.clear();
  } catch {
    /* noop */
  }
});
afterAll(() => server.close());

const BASE: AuthUser = {
  id: 'u1',
  email: 'ana@example.com',
  username: 'ana',
  role: 'user',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  last_login_at: null,
  email_verified_at: null,
  avatar_color: null,
  avatar_figure: null,
};

function renderBanner(user: AuthUser | null) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(AUTH_ME_KEY, user ? { user, csrf_token: 'x' } : null);
  return render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <VerifyEmailBanner />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('VerifyEmailBanner', () => {
  it('reenvía en el idioma actual aunque haya cambiado con el banner abierto', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/email/resend', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ detail: 'ok' });
      }),
    );
    renderBanner(BASE);
    await act(() => i18n.changeLanguage('en'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(body).toEqual({ email: 'ana@example.com', locale: 'en' }));
  });

  it('se muestra si el email no está verificado', () => {
    renderBanner(BASE);
    expect(screen.getByText(/Verifica tu email/i)).toBeInTheDocument();
  });

  it('no se muestra si ya está verificado', () => {
    renderBanner({ ...BASE, email_verified_at: '2026-01-02T00:00:00.000Z' });
    expect(screen.queryByText(/Verifica tu email/i)).not.toBeInTheDocument();
  });

  it('no se muestra sin sesión', () => {
    renderBanner(null);
    expect(screen.queryByText(/Verifica tu email/i)).not.toBeInTheDocument();
  });

  it('reenviar dispara la petición y entra en cooldown', async () => {
    const user = userEvent.setup();
    renderBanner(BASE);
    await user.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(await screen.findByText(/Reenviado/)).toBeInTheDocument();
  });

  it('el cooldown es compartido: otra instancia del hook también queda bloqueada', async () => {
    function SecondConsumer() {
      const { cooldown } = useResendVerification(BASE.email);
      return <output aria-label="cooldown gemelo">{cooldown > 0 ? 'bloqueado' : 'libre'}</output>;
    }
    const user = userEvent.setup();
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(AUTH_ME_KEY, { user: BASE, csrf_token: 'x' });
    render(
      <ThemeProvider>
        <QueryClientProvider client={qc}>
          <VerifyEmailBanner />
          <SecondConsumer />
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('cooldown gemelo')).toHaveTextContent('libre');
    await user.click(screen.getByRole('button', { name: 'Reenviar' }));
    expect(await screen.findByText(/Reenviado/)).toBeInTheDocument();
    expect(screen.getByLabelText('cooldown gemelo')).toHaveTextContent('bloqueado');
  });

  it('enlaza a la bandeja de Mailpit en pestaña nueva', () => {
    vi.stubEnv('VITE_MAILPIT_URL', 'http://localhost:9025');
    renderBanner(BASE);
    const link = screen.getByRole('link', { name: 'Abrir mi correo' });
    expect(link).toHaveAttribute('href', 'http://localhost:9025');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([undefined, '', '   '])('oculta el enlace sin bandeja configurada (%s)', (url) => {
    vi.stubEnv('VITE_MAILPIT_URL', url);
    renderBanner(BASE);
    expect(screen.queryByRole('link', { name: 'Abrir mi correo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reenviar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Descartar aviso' })).toBeEnabled();
  });

  it('se puede descartar', async () => {
    const user = userEvent.setup();
    renderBanner(BASE);
    await user.click(screen.getByRole('button', { name: /Descartar aviso/i }));
    expect(screen.queryByText(/Verifica tu email/i)).not.toBeInTheDocument();
  });
});
