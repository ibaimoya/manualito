import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onStorageWriteFail, storage, STORAGE_KEYS } from '@/shared/lib/storage';

const SETTINGS = { mode: 'dark', accent: 'blue', responseDetail: 'long' } as const;

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('onboarding flag', () => {
    it('isOnboardingSeen es false al inicio', () => {
      expect(storage.isOnboardingSeen()).toBe(false);
    });

    it('markOnboardingSeen lo marca y resetOnboarding lo limpia', () => {
      storage.markOnboardingSeen();
      expect(storage.isOnboardingSeen()).toBe(true);
      storage.resetOnboarding();
      expect(storage.isOnboardingSeen()).toBe(false);
    });
  });

  describe('robustness contra datos corruptos', () => {
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

  describe('wipeAll', () => {
    it('barre las claves legadas por manual pero deja settings y onboarding', () => {
      // Restos de versiones donde los manuales se cacheaban en localStorage.
      localStorage.setItem('manualito.manuals', JSON.stringify([{ manual_id: 'm1' }]));
      localStorage.setItem('manualito.qa.m1', JSON.stringify([{ id: 'x' }]));
      localStorage.setItem('manualito.result.m1', JSON.stringify({ summary: 's' }));
      localStorage.setItem('manualito.ocr.m1', JSON.stringify([{ text: 'línea' }]));
      storage.writeSettings(SETTINGS);
      storage.markOnboardingSeen();

      storage.wipeAll();

      expect(localStorage.getItem('manualito.manuals')).toBeNull();
      expect(localStorage.getItem('manualito.qa.m1')).toBeNull();
      expect(localStorage.getItem('manualito.result.m1')).toBeNull();
      expect(localStorage.getItem('manualito.ocr.m1')).toBeNull();
      // Las preferencias UI sobreviven a "Borrar datos locales".
      expect(storage.readSettings().mode).toBe('dark');
      expect(storage.isOnboardingSeen()).toBe(true);
    });

    it('no toca claves ajenas al prefijo legado', () => {
      localStorage.setItem('otra.app.clave', 'intacta');
      storage.wipeAll();
      expect(localStorage.getItem('otra.app.clave')).toBe('intacta');
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
        const err = new DOMException(
          'Quota exceeded',
          'QuotaExceededError',
        ) as DOMException & { code: number };
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
