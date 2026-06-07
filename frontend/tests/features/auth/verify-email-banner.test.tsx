import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '@tests/_helpers/server';
import { ThemeProvider } from '@/app/theme';
import { VerifyEmailBanner } from '@/features/auth/verify-email-banner';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import type { AuthUser } from '@/shared/api/auth';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
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

  it('se puede descartar', async () => {
    const user = userEvent.setup();
    renderBanner(BASE);
    await user.click(screen.getByRole('button', { name: /Descartar aviso/i }));
    expect(screen.queryByText(/Verifica tu email/i)).not.toBeInTheDocument();
  });
});
