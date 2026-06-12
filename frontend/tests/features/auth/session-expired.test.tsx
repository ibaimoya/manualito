import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { http, HttpResponse } from 'msw';
import { Providers } from '@/app/Providers';
import { AUTH_ME_KEY } from '@/features/auth/auth-queries';
import { handleSessionExpired } from '@/features/auth/session-expired';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/http';
import { mapApiError } from '@/shared/api/error-mapper';
import { server } from '@tests/_helpers/server';

const { fakeRouter } = vi.hoisted(() => ({
  fakeRouter: {
    state: { location: { pathname: '/game/g1', href: '/game/g1' } },
    navigate: vi.fn(() => Promise.resolve()),
  },
}));
vi.mock('@/app/AppRouter', () => ({ router: fakeRouter }));

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  fakeRouter.navigate.mockClear();
  fakeRouter.state.location = { pathname: '/game/g1', href: '/game/g1' };
});

/** ApiError 401 con la forma real del backend (`errors[0].code`). */
function unauthorized(code: string): ApiError {
  const raw = { detail: 'x', errors: [{ field: null, code, message: 'x' }] };
  return new ApiError(mapApiError({ status: 401, raw }), 401, raw);
}

function expiredSessionResponse() {
  return HttpResponse.json(
    {
      detail: 'Autenticación requerida.',
      errors: [
        { field: null, code: 'authentication_required', message: 'Autenticación requerida.' },
      ],
    },
    { status: 401 },
  );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('handleSessionExpired (unidad)', () => {
  it('invalid_credentials (login o contraseña actual mal escrita) no redirige', async () => {
    handleSessionExpired(unauthorized('invalid_credentials'), new QueryClient());
    await flush();
    expect(fakeRouter.navigate).not.toHaveBeenCalled();
  });

  it('un 401 sin código del backend no redirige', async () => {
    const raw = { detail: 'Credenciales inválidas.' };
    handleSessionExpired(new ApiError(mapApiError({ status: 401, raw }), 401, raw), new QueryClient());
    await flush();
    expect(fakeRouter.navigate).not.toHaveBeenCalled();
  });

  it('errores que no son ApiError se ignoran', async () => {
    handleSessionExpired(new Error('boom'), new QueryClient());
    await flush();
    expect(fakeRouter.navigate).not.toHaveBeenCalled();
  });

  it('ya en /login no vuelve a redirigir', async () => {
    fakeRouter.state.location = { pathname: '/login', href: '/login' };
    handleSessionExpired(unauthorized('authentication_required'), new QueryClient());
    await flush();
    expect(fakeRouter.navigate).not.toHaveBeenCalled();
  });

  it('una ráfaga de 401 simultáneos navega una sola vez', async () => {
    const qc = new QueryClient();
    handleSessionExpired(unauthorized('authentication_required'), qc);
    handleSessionExpired(unauthorized('authentication_required'), qc);
    handleSessionExpired(unauthorized('authentication_required'), qc);
    await waitFor(() => expect(fakeRouter.navigate).toHaveBeenCalledTimes(1));
    await flush();
  });

  it('limpia la sesión y navega al login con la URL de regreso', async () => {
    const qc = new QueryClient();
    qc.setQueryData(AUTH_ME_KEY, { user: { id: 'u1' }, csrf_token: 'csrf' });
    qc.setQueryData(['games', 'detail', 'g1'], { id: 'g1' });

    handleSessionExpired(unauthorized('authentication_required'), qc);

    await waitFor(() => {
      expect(fakeRouter.navigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: '/game/g1' },
      });
    });
    expect(qc.getQueryData(AUTH_ME_KEY)).toBeNull();
    expect(qc.getQueryData(['games', 'detail', 'g1'])).toBeUndefined();
  });
});

/** Siembra sesión y lanza una query que el servidor responde con 401. */
function QueryProbe() {
  const qc = useQueryClient();
  useQuery({
    queryKey: ['probe'],
    queryFn: async ({ signal }) => {
      qc.setQueryData(AUTH_ME_KEY, { user: { id: 'u1' }, csrf_token: 'csrf' });
      return api.getManual('m-x', signal);
    },
    retry: false,
  });
  return <p>probe</p>;
}

function MutationProbe() {
  const { mutate } = useMutation({ mutationFn: () => api.reprocessManual('m-x') });
  useEffect(() => mutate(), [mutate]);
  return <p>probe</p>;
}

describe('handler 401 cableado al QueryClient de Providers', () => {
  it('una query con sesión que recibe 401 → toast y redirección al login', async () => {
    server.use(http.get('/api/manuals/:manualId', expiredSessionResponse));

    render(
      <Providers>
        <QueryProbe />
      </Providers>,
    );

    await waitFor(() => {
      expect(fakeRouter.navigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: '/game/g1' },
      });
    });
    expect(await screen.findByText('Tu sesión ha caducado')).toBeInTheDocument();
  });

  it('una mutación que recibe 401 también dispara la redirección', async () => {
    server.use(http.post('/api/manuals/:manualId/reprocess', expiredSessionResponse));

    render(
      <Providers>
        <MutationProbe />
      </Providers>,
    );

    await waitFor(() => {
      expect(fakeRouter.navigate).toHaveBeenCalledWith({
        to: '/login',
        search: { redirect: '/game/g1' },
      });
    });
  });
});
