import '@testing-library/jest-dom/vitest';
import type {} from 'vitest/jsdom';
import { randomUUID, webcrypto } from 'node:crypto';
import { afterEach, expect } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { toast } from 'sonner';
// El singleton arranca en español y los tests asertan ese copy
import i18n from '@/app/i18n';

configure({ asyncUtilTimeout: 3000 });

// jest-axe → expect(html).toHaveNoViolations()
expect.extend(toHaveNoViolations);

const testWindow = globalThis.window;

// jsdom no implementa View Transitions. Ejecutamos la actualización real del DOM;
// las capturas y su interpolación se comprueban en navegador.
Object.defineProperty(document, 'startViewTransition', {
  configurable: true,
  writable: true,
  value: ((options) => {
    const update = typeof options === 'function' ? options : options?.update;
    const updateCallbackDone = Promise.resolve()
      .then(() => update?.())
      .then(() => undefined);
    return {
      ready: updateCallbackDone,
      finished: updateCallbackDone,
      updateCallbackDone,
      types: new Set(typeof options === 'object' ? options.types : []),
      skipTransition: () => undefined,
    };
  }) satisfies Document['startViewTransition'],
});

// jsdom no ejecuta transiciones CSS. Su interpolación se comprueba en navegador.
Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value: () => [],
});

// jsdom no calcula geometría. El movimiento y la visibilidad se comprueban en navegador.
class LayoutObserver {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: LayoutObserver,
});
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: LayoutObserver,
});

// Vitest 4 conserva los globals de Storage de Node si ya existen.
// Los tests de navegador deben usar las instancias reales del mismo jsdom.
for (const key of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get: () => jsdom.window[key],
  });
}

// Limpia el DOM entre tests (jsdom es persistente por defecto).
afterEach(() => {
  cleanup();
  // Sonner conserva los avisos activos y los repone al montar otro Toaster.
  toast.dismiss();
  localStorage.clear();
  sessionStorage.clear();
  // Un test que cambie de idioma no debe contaminar a los siguientes
  if (i18n.language !== 'es') void i18n.changeLanguage('es');
});

// Fallback estándar para runtimes de test sin Web Crypto completa.
if (globalThis.crypto === undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
} else if (globalThis.crypto.randomUUID === undefined) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: randomUUID,
  });
}

// matchMedia → jsdom no la trae.
if (testWindow !== undefined && testWindow.matchMedia === undefined) {
  Object.defineProperty(testWindow, 'matchMedia', {
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
if (testWindow !== undefined) {
  Object.defineProperty(testWindow, 'scrollTo', {
    writable: true,
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(testWindow, 'scrollBy', {
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
  // jsdom tampoco desplaza la opción activa de los combobox; la geometría se verifica en navegador.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    writable: true,
    configurable: true,
    value: () => undefined,
  });
}
