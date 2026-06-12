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

// Un SW residual de un build serviría assets viejos en dev; en prod este bloque es dead-code.
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
