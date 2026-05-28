import { describe, expect, it, beforeAll, afterEach, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { server } from '@tests/_helpers/server';
import { useManualBootstrap } from '@/features/processing/useManualBootstrap';
import { storage } from '@/shared/lib/storage';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

describe('useManualBootstrap', () => {
  it('lanza 4 preguntas paralelas y termina marcando done=true', async () => {
    let calls = 0;
    server.use(
      http.post('/api/manuals/:id/questions', async () => {
        calls++;
        return HttpResponse.json({ answer: 'Respuesta ' + calls });
      }),
    );

    const { result } = renderHook(() => useManualBootstrap('m-1', 'Catan'));

    expect(result.current.done).toBe(false);
    expect(result.current.steps).toHaveLength(4);
    expect(result.current.steps.every((s) => s.state === 'pending' || s.state === 'running'))
      .toBe(true);

    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });

    expect(calls).toBe(4);
    expect(result.current.steps.filter((s) => s.state === 'done')).toHaveLength(4);
    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.manual_id).toBe('m-1');
    expect(result.current.result?.name).toBe('Catan');

    // Persistencia en localStorage.
    const saved = storage.getResult('m-1');
    expect(saved?.summary).toContain('Respuesta');
  });

  it('si algunas mutations fallan, done=true pero failed>0', async () => {
    let callIdx = 0;
    server.use(
      http.post('/api/manuals/:id/questions', async () => {
        callIdx++;
        if (callIdx % 2 === 0) {
          return HttpResponse.json({ detail: 'boom' }, { status: 500 });
        }
        return HttpResponse.json({ answer: 'ok ' + callIdx });
      }),
    );

    const { result } = renderHook(() => useManualBootstrap('m-2', 'Wingspan'));
    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });

    const failedCount = result.current.steps.filter((s) => s.state === 'failed').length;
    const doneCount = result.current.steps.filter((s) => s.state === 'done').length;
    expect(failedCount).toBeGreaterThan(0);
    expect(doneCount).toBeGreaterThan(0);
    expect(failedCount + doneCount).toBe(4);
    // result se persiste con strings vacíos en los huecos
    expect(result.current.result?.manual_id).toBe('m-2');
  });

  it('si TODAS fallan, sigue marcando done=true pero los campos van vacíos', async () => {
    server.use(
      http.post('/api/manuals/:id/questions', () =>
        HttpResponse.json({ detail: 'down' }, { status: 502 }),
      ),
    );

    const { result } = renderHook(() => useManualBootstrap('m-3', 'X'));
    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });
    expect(result.current.steps.every((s) => s.state === 'failed')).toBe(true);
    expect(result.current.result?.summary).toBe('');
    expect(result.current.result?.setup).toBe('');
  });

  it('al desmontar antes de terminar: NO escribe state ni persiste resultado', async () => {
    // Cubre el cleanup del useEffect: mountedRef=false + controller.abort.
    // Las mutations devuelven null (isAbortApiError), patchStep no se llama,
    // y storage.setResult NO se ejecuta porque mountedRef.current=false al
    // resolver Promise.allSettled.
    server.use(
      http.post('/api/manuals/:id/questions', async () => {
        await delay(300); // suficiente para desmontar antes
        return HttpResponse.json({ answer: 'late' });
      }),
    );

    const { unmount } = renderHook(() => useManualBootstrap('m-unmount', 'X'));
    // Desmontamos casi inmediato — antes de que las mutations terminen.
    unmount();
    // Esperamos a que las requests hubieran terminado para confirmar que
    // el cleanup hizo su trabajo (storage NO se escribe).
    await new Promise((r) => setTimeout(r, 400));
    expect(storage.getResult('m-unmount')).toBeNull();
  });
});
