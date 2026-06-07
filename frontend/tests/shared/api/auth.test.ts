import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@tests/_helpers/server';
import { unauthenticatedMe } from '@tests/_helpers/mswHandlers';
import { authApi } from '@/shared/api/auth';
import { ApiError } from '@/shared/api/http';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  document.cookie = 'manualito_csrf=; path=/; max-age=0';
});
afterAll(() => server.close());

const AUTH = {
  user: {
    id: 'u1',
    email: 'ana@example.com',
    username: 'ana',
    role: 'user',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    last_login_at: null,
    email_verified_at: null,
  },
  csrf_token: 'tok',
};

describe('authApi register/login', () => {
  it('register envía email/username/password y devuelve la sesión', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/register', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(AUTH, { status: 201 });
      }),
    );

    const res = await authApi.register({
      email: 'ana@example.com',
      username: 'ana',
      password: 'secret123',
    });

    expect(body).toEqual({ email: 'ana@example.com', username: 'ana', password: 'secret123' });
    expect(res.user.username).toBe('ana');
    expect(res.csrf_token).toBe('tok');
  });

  it('login envía identifier/password', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(AUTH);
      }),
    );

    const res = await authApi.login({ identifier: 'ana', password: 'secret123' });

    expect(body).toEqual({ identifier: 'ana', password: 'secret123' });
    expect(res.csrf_token).toBe('tok');
  });

  it('register con 409 lanza ApiError', async () => {
    server.use(http.post('/api/auth/register', () => HttpResponse.json({}, { status: 409 })));
    await expect(
      authApi.register({ email: 'a@b.com', username: 'a', password: 'secret123' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('authApi me', () => {
  it('devuelve el usuario actual cuando hay sesión', async () => {
    const res = await authApi.me();
    expect(res.user.email).toContain('@');
    expect(typeof res.csrf_token).toBe('string');
  });

  it('lanza ApiError 401 cuando no hay sesión', async () => {
    server.use(unauthenticatedMe());
    await expect(authApi.me()).rejects.toMatchObject({ status: 401 });
    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('authApi logout', () => {
  it('resuelve sin cuerpo ante un 204', async () => {
    await expect(authApi.logout()).resolves.toBeUndefined();
  });

  it('adjunta la cabecera X-CSRF-Token leída de la cookie', async () => {
    document.cookie = 'manualito_csrf=cookie-csrf-1; path=/';
    let header: string | null = null;
    server.use(
      http.post('/api/auth/logout', ({ request }) => {
        header = request.headers.get('X-CSRF-Token');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await authApi.logout();

    expect(header).toBe('cookie-csrf-1');
  });
});

describe('authApi flujos de email/contraseña', () => {
  it('verifyEmail envía el token', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/email/verify', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ detail: 'ok' });
      }),
    );
    const res = await authApi.verifyEmail('verif-token');
    expect(body).toEqual({ token: 'verif-token' });
    expect(res.detail).toBe('ok');
  });

  it('resendVerification y forgotPassword envían el email', async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post('/api/auth/email/resend', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ detail: 'sent' });
      }),
      http.post('/api/auth/password/forgot', async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ detail: 'sent' });
      }),
    );

    await authApi.resendVerification('ana@example.com');
    await authApi.forgotPassword('ana@example.com');

    expect(bodies).toEqual([{ email: 'ana@example.com' }, { email: 'ana@example.com' }]);
  });

  it('resetPassword envía token y nueva contraseña', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/auth/password/reset', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ detail: 'updated' });
      }),
    );
    const res = await authApi.resetPassword({ token: 'reset-token', password: 'newsecret123' });
    expect(body).toEqual({ token: 'reset-token', password: 'newsecret123' });
    expect(res.detail).toBe('updated');
  });
});
