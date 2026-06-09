import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/globals.css';
import { App } from './app/App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in document');
}

// En desarrollo no registramos service worker propio; si quedó uno de un build
// anterior (Docker/preview en este mismo origen) seguiría sirviendo assets
// cacheados y "tapando" los cambios. Lo limpiamos para que dev sirva siempre
// código fresco. En producción este bloque se elimina (dead-code) y el SW de la
// PWA sigue intacto.
async function clearDevBrowserCaches(): Promise<void> {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
  }
  if ('caches' in globalThis) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

if (import.meta.env.DEV) {
  await clearDevBrowserCaches().catch(() => undefined);
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
