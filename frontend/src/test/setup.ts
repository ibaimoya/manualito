import '@testing-library/jest-dom/vitest';
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

// Polyfill mínimo para crypto.randomUUID en jsdom (Node 24 ya lo tiene global,
// pero por si algún test corre antes de que window se inicialice del todo).
if (typeof globalThis.crypto?.randomUUID !== 'function') {
  (globalThis as unknown as { crypto: { randomUUID: () => string } }).crypto = {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
  };
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
