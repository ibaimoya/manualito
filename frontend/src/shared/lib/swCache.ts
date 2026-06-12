// Debe coincidir con el cacheName de runtimeCaching en vite.config.ts.
const API_SW_CACHE = 'api';

/** Purga las respuestas de /api que el service worker tenga cacheadas. */
export async function clearApiSwCache(): Promise<void> {
  try {
    await globalThis.caches?.delete(API_SW_CACHE);
  } catch {
    // Sin Cache Storage (contexto no seguro): no hay nada que purgar.
  }
}
