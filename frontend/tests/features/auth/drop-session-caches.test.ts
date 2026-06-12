import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { AUTH_ME_KEY, dropSessionCaches } from '@/features/auth/auth-queries';

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('dropSessionCaches', () => {
  it('vacía las queries de la cuenta y deja el marcador de sesión a null', async () => {
    const qc = new QueryClient();
    qc.setQueryData(AUTH_ME_KEY, { user: { id: 'u1' }, csrf_token: 'tok' });
    qc.setQueryData(['manuals', 'list'], [{ id: 'm1' }]);

    await dropSessionCaches(qc);

    expect(qc.getQueryData(['manuals', 'list'])).toBeUndefined();
    expect(qc.getQueryData(AUTH_ME_KEY)).toBeNull();
  });

  it('purga el bucket "api" del service worker cuando hay Cache Storage', async () => {
    const deleteSpy = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: deleteSpy },
    });

    await dropSessionCaches(new QueryClient());

    expect(deleteSpy).toHaveBeenCalledWith('api');
  });

  it('no falla sin Cache Storage ni cuando la purga lanza', async () => {
    await expect(dropSessionCaches(new QueryClient())).resolves.toBeUndefined();

    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: { delete: vi.fn().mockRejectedValue(new Error('denegado')) },
    });
    await expect(dropSessionCaches(new QueryClient())).resolves.toBeUndefined();
  });
});
