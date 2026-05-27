import '@testing-library/jest-dom/vitest';
import { randomUUID, webcrypto } from 'node:crypto';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';

// jest-axe → expect(html).toHaveNoViolations()
expect.extend(toHaveNoViolations);

// Limpia el DOM entre tests (jsdom es persistente por defecto).
afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Fallback estándar para runtimes de test sin Web Crypto completa.
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
} else if (typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: randomUUID,
  });
}

// matchMedia → jsdom no la trae.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// scrollTo / scrollBy → jsdom las define pero su implementación llama a
// `notImplemented()` que emite warnings ruidosos cada vez que el
// scroll-restoration de TanStack Router los invoca al cambiar de ruta.
// Sobrescribimos incondicionalmente con no-op: silencia los warnings
// sin afectar a la lógica de los tests (en un browser real, los métodos
// sí mueven el scroll).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(window, 'scrollBy', {
    writable: true,
    configurable: true,
    value: () => undefined,
  });
  // El scroll-restoration de TanStack Router también llama a
  // `Element.prototype.scrollTo` sobre nodos concretos (sidebar,
  // contenedores con `overflow: auto`).  Mismo tratamiento.
  Object.defineProperty(Element.prototype, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => undefined,
  });
}
