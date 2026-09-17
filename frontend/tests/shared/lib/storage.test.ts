import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onStorageWriteFail, storage, STORAGE_KEYS } from '@/shared/lib/storage';

const SETTINGS = { mode: 'dark', accent: 'blue' } as const;

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('onboarding flag', () => {
    it('isOnboardingSeen es false al inicio', () => {
      expect(storage.isOnboardingSeen()).toBe(false);
    });

    it('markOnboardingSeen conserva la marca al repetir la escritura', () => {
      storage.markOnboardingSeen();
      expect(storage.isOnboardingSeen()).toBe(true);
      storage.markOnboardingSeen();
      expect(storage.isOnboardingSeen()).toBe(true);
    });
  });

  describe('robustness contra datos corruptos', () => {
    it('tolera que el navegador deniegue el acceso a localStorage', () => {
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      const access = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('Storage access denied', 'SecurityError');
      });
      try {
        expect(storage.readSettings()).toEqual({ mode: 'light', accent: 'amber' });
        expect(storage.readLanguage()).toBe('es');
        expect(storage.isOnboardingSeen()).toBe(false);
        expect(() => storage.markOnboardingSeen()).not.toThrow();
        storage.writeSettings(SETTINGS);
        expect(listener).toHaveBeenCalledWith('denied', STORAGE_KEYS.settings);
      } finally {
        access.mockRestore();
        off();
      }
    });

    it('readSettings usa defaults cuando el JSON es inválido', () => {
      localStorage.setItem(STORAGE_KEYS.settings, '{');
      const s = storage.readSettings();
      expect(s.mode).toBe('light');
      expect(s.accent).toBe('amber');
    });

    it('readSettings usa defaults cuando el schema no valida', () => {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ mode: 'neon' }));
      expect(storage.readSettings().mode).toBe('light');
    });

    it('readSettings respeta valores válidos', () => {
      storage.writeSettings(SETTINGS);
      expect(storage.readSettings()).toEqual(SETTINGS);
    });
  });

  /* ============================================================
     Propagación de fallos de escritura
     ============================================================ */
  describe('onStorageWriteFail', () => {
    let setItemSpy: ReturnType<typeof vi.spyOn>;

    afterEach(() => {
      setItemSpy?.mockRestore();
    });

    it('dispara listener con reason="quota" cuando setItem tira QuotaExceededError', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new DOMException('Quota exceeded', 'QuotaExceededError') as DOMException & {
          code: number;
        };
        Object.defineProperty(err, 'code', { value: 22, configurable: true });
        throw err;
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      storage.writeSettings(SETTINGS);
      expect(listener).toHaveBeenCalledWith('quota', STORAGE_KEYS.settings);
      off();
    });

    it('reason="denied" cuando se rechaza por SecurityError', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      storage.writeSettings(SETTINGS);
      expect(listener).toHaveBeenCalledWith('denied', STORAGE_KEYS.settings);
      off();
    });

    it('reason="unknown" para errores no clasificados', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('boom');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      storage.writeSettings(SETTINGS);
      expect(listener).toHaveBeenCalledWith('unknown', STORAGE_KEYS.settings);
      off();
    });

    it('el unsubscribe devuelto detiene las notificaciones', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      off();
      storage.writeSettings(SETTINGS);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
