import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { request } from '@/shared/api/http';

it('mantiene el timeout mientras se descarga el cuerpo por HTTP', async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.write('{');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const fetch = globalThis.fetch;
  let receivedHeaders = false;
  // Node necesita una URL absoluta. El socket y la descarga son reales.
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const response = await fetch(new URL(String(input), origin), options);
    receivedHeaders = true;
    return response;
  });
  try {
    await expect(request('/slow-body', { timeoutMs: 500 })).rejects.toMatchObject({ status: 504 });
    expect(receivedHeaders).toBe(true);
  } finally {
    fetchSpy.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
