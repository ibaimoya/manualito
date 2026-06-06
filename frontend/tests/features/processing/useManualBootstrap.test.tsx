import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { useManualBootstrap } from '@/features/processing/useManualBootstrap';
import { storage } from '@/shared/lib/storage';
import { server } from '@tests/_helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function readyManualResponse(manualId: string) {
  return {
    manual_id: manualId,
    status: 'active',
    page_count: 2,
    completed_pages: 2,
    failed_pages: 0,
    pages: [
      { page_number: 1, ocr_status: 'completed', text_quality: 'ok' },
      { page_number: 2, ocr_status: 'completed', text_quality: 'ok' },
    ],
  };
}

describe('useManualBootstrap', () => {
  it('espera al procesamiento y lanza 4 preguntas', async () => {
    let processingCalls = 0;
    let questionCalls = 0;
    server.use(
      http.get('/api/manuals/:id/processing', ({ params }) => {
        processingCalls++;
        return HttpResponse.json(readyManualResponse(String(params.id)));
      }),
      http.post('/api/manuals/:id/questions', async () => {
        questionCalls++;
        return HttpResponse.json({ answer: 'Respuesta ' + questionCalls });
      }),
    );

    const { result } = renderHook(() => useManualBootstrap('m-1', 'Catan'));

    expect(result.current.done).toBe(false);
    expect(result.current.steps).toHaveLength(5);

    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });

    expect(processingCalls).toBe(1);
    expect(questionCalls).toBe(4);
    expect(result.current.steps.filter((step) => step.state === 'done')).toHaveLength(5);
    expect(result.current.result?.manual_id).toBe('m-1');
    expect(result.current.result?.name).toBe('Catan');
    expect(storage.getResult('m-1')?.summary).toContain('Respuesta');
  });

  it('si algunas preguntas fallan, guarda resultado con huecos vacios', async () => {
    let callIndex = 0;
    server.use(
      http.get('/api/manuals/:id/processing', ({ params }) =>
        HttpResponse.json(readyManualResponse(String(params.id))),
      ),
      http.post('/api/manuals/:id/questions', async () => {
        callIndex++;
        if (callIndex % 2 === 0) {
          return HttpResponse.json({ detail: 'boom' }, { status: 500 });
        }
        return HttpResponse.json({ answer: 'ok ' + callIndex });
      }),
    );

    const { result } = renderHook(() => useManualBootstrap('m-2', 'Wingspan'));
    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });

    const failedCount = result.current.steps.filter((step) => step.state === 'failed').length;
    const doneCount = result.current.steps.filter((step) => step.state === 'done').length;
    expect(failedCount).toBeGreaterThan(0);
    expect(doneCount).toBeGreaterThan(0);
    expect(failedCount + doneCount).toBe(5);
    expect(result.current.result?.manual_id).toBe('m-2');
  });

  it('si el manual falla procesando, no lanza preguntas', async () => {
    let questionCalls = 0;
    server.use(
      http.get('/api/manuals/:id/processing', ({ params }) =>
        HttpResponse.json({
          ...readyManualResponse(String(params.id)),
          status: 'failed',
          completed_pages: 0,
          failed_pages: 2,
        }),
      ),
      http.post('/api/manuals/:id/questions', async () => {
        questionCalls++;
        return HttpResponse.json({ answer: 'late' });
      }),
    );

    const { result } = renderHook(() => useManualBootstrap('m-3', 'X'));
    await waitFor(() => expect(result.current.done).toBe(true), { timeout: 3000 });

    expect(questionCalls).toBe(0);
    expect(result.current.result).toBeNull();
    expect(result.current.steps.every((step) => step.state === 'failed')).toBe(true);
  });

  it('al desmontar antes de terminar no persiste resultado', async () => {
    server.use(
      http.get('/api/manuals/:id/processing', async ({ params }) => {
        await delay(300);
        return HttpResponse.json(readyManualResponse(String(params.id)));
      }),
    );

    const { unmount } = renderHook(() => useManualBootstrap('m-unmount', 'X'));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(storage.getResult('m-unmount')).toBeNull();
  });
});
