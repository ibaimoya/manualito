import { setupServer } from 'msw/node';
import { handlers } from './mswHandlers';

/**
 * Server MSW para tests Node (Vitest + jsdom).
 *
 * Uso por test que pegue al backend:
 *
 *   import { server } from '@tests/_helpers/server';
 *   import { beforeAll, afterEach, afterAll } from 'vitest';
 *
 *   beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
 *   afterEach(() => server.resetHandlers());
 *   afterAll(() => server.close());
 */
export const server = setupServer(...handlers);
