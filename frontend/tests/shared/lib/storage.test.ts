import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  onStorageWriteFail,
  storage,
  STORAGE_KEYS,
  type ManualRecord,
  type QAMessage,
} from '@/shared/lib/storage';

const SAMPLE: ManualRecord = {
  manual_id: 'catan-abc',
  name: 'Catan',
  created_at: '2026-05-26T10:00:00.000Z',
  last_opened_at: '2026-05-26T10:00:00.000Z',
  chunks_indexed: 12,
};

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('manuales', () => {
    it('listManuals devuelve [] cuando no hay nada', () => {
      expect(storage.listManuals()).toEqual([]);
    });

    it('upsertManual añade y luego lista', () => {
      storage.upsertManual(SAMPLE);
      expect(storage.listManuals()).toEqual([SAMPLE]);
    });

    it('upsertManual de un manual existente lo mueve al principio sin duplicar', () => {
      const a: ManualRecord = { ...SAMPLE, manual_id: 'a' };
      const b: ManualRecord = { ...SAMPLE, manual_id: 'b' };
      storage.upsertManual(a);
      storage.upsertManual(b);
      // Reupsert de 'a' debe moverlo al principio.
      storage.upsertManual({ ...a, chunks_indexed: 99 });
      const list = storage.listManuals();
      expect(list).toHaveLength(2);
      expect(list[0]?.manual_id).toBe('a');
      expect(list[0]?.chunks_indexed).toBe(99);
      expect(list[1]?.manual_id).toBe('b');
    });

    it('touchManual actualiza last_opened_at y mueve al principio', async () => {
      const a: ManualRecord = { ...SAMPLE, manual_id: 'a' };
      const b: ManualRecord = {
        ...SAMPLE,
        manual_id: 'b',
        last_opened_at: '2025-01-01T00:00:00.000Z',
      };
      storage.upsertManual(b);
      storage.upsertManual(a);
      // a está delante; ahora toqueamos b → debe ir delante de a.
      storage.touchManual('b');
      const list = storage.listManuals();
      expect(list[0]?.manual_id).toBe('b');
      // Y last_opened_at de b debe haberse actualizado.
      expect(new Date(list[0]!.last_opened_at).getFullYear()).toBe(2026);
    });

    it('removeManual borra el manual y su Q&A asociado', () => {
      storage.upsertManual(SAMPLE);
      storage.appendQA(SAMPLE.manual_id, {
        id: 'msg-1',
        role: 'user',
        text: 'hola',
        ts: '2026-05-26T10:00:00.000Z',
      });
      storage.removeManual(SAMPLE.manual_id);
      expect(storage.listManuals()).toEqual([]);
      expect(storage.listQA(SAMPLE.manual_id)).toEqual([]);
    });

    it('removeManual también borra las líneas OCR asociadas', () => {
      storage.upsertManual(SAMPLE);
      storage.setOcrLines(SAMPLE.manual_id, [
        { text: 'línea', confidence: 0.9 },
      ]);
      storage.removeManual(SAMPLE.manual_id);
      expect(storage.getOcrLines(SAMPLE.manual_id)).toEqual([]);
    });
  });

  describe('ocr lines (slot dedicado por manual)', () => {
    it('getOcrLines devuelve [] si nunca se han escrito', () => {
      expect(storage.getOcrLines('no-existe')).toEqual([]);
    });

    it('setOcrLines + getOcrLines round-trip preservando confidence y orden', () => {
      const lines = [
        { text: 'Primera línea legible', confidence: 0.95 },
        { text: 'Línea media', confidence: 0.72 },
        { text: 'Línea borrosa', confidence: 0.31 },
      ];
      storage.setOcrLines('m-1', lines);
      const out = storage.getOcrLines('m-1');
      expect(out).toEqual(lines);
      // Orden importa: el viewer pinta por número de línea.
      expect(out.map((l) => l.confidence)).toEqual([0.95, 0.72, 0.31]);
    });

    it('setOcrLines acepta lista vacía (OCR sin texto detectado)', () => {
      storage.setOcrLines('m-vacio', []);
      expect(storage.getOcrLines('m-vacio')).toEqual([]);
    });

    it('aísla líneas por manual_id (no hay cross-pollination)', () => {
      storage.setOcrLines('m-a', [{ text: 'A', confidence: 0.9 }]);
      storage.setOcrLines('m-b', [{ text: 'B', confidence: 0.8 }]);
      expect(storage.getOcrLines('m-a')).toEqual([{ text: 'A', confidence: 0.9 }]);
      expect(storage.getOcrLines('m-b')).toEqual([{ text: 'B', confidence: 0.8 }]);
    });

    it('getOcrLines descarta payload corrupto y devuelve []', () => {
      // confidence fuera de [0, 1] → el schema Zod lo rechaza.
      localStorage.setItem(
        'manualito.ocr.m-x',
        JSON.stringify([{ text: 'mala', confidence: 1.7 }]),
      );
      expect(storage.getOcrLines('m-x')).toEqual([]);
    });

    it('wipeAll también borra las líneas OCR de todos los manuales', () => {
      storage.upsertManual(SAMPLE);
      storage.setOcrLines(SAMPLE.manual_id, [
        { text: 'x', confidence: 0.9 },
      ]);
      storage.wipeAll();
      expect(storage.getOcrLines(SAMPLE.manual_id)).toEqual([]);
    });
  });

  describe('q&a', () => {
    const msg: QAMessage = {
      id: 'm1',
      role: 'bot',
      text: 'respuesta',
      ts: '2026-05-26T10:00:00.000Z',
    };

    it('appendQA y listQA mantienen orden FIFO', () => {
      storage.appendQA('m', msg);
      storage.appendQA('m', { ...msg, id: 'm2', role: 'user' });
      const list = storage.listQA('m');
      expect(list).toHaveLength(2);
      expect(list[0]?.id).toBe('m1');
      expect(list[1]?.id).toBe('m2');
    });

    it('clearQA borra todo el historial de UN manual sin tocar otros', () => {
      storage.appendQA('a', msg);
      storage.appendQA('b', msg);
      storage.clearQA('a');
      expect(storage.listQA('a')).toEqual([]);
      expect(storage.listQA('b')).toHaveLength(1);
    });
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
    it('listManuals devuelve [] si el JSON está malformado', () => {
      localStorage.setItem(STORAGE_KEYS.manuals, 'no-json-{[');
      expect(storage.listManuals()).toEqual([]);
    });

    it('listManuals devuelve [] si el schema no valida', () => {
      localStorage.setItem(
        STORAGE_KEYS.manuals,
        JSON.stringify([{ manual_id: 1, name: null }]),
      );
      expect(storage.listManuals()).toEqual([]);
    });

    it('readSettings usa defaults cuando el JSON es inválido', () => {
      localStorage.setItem(STORAGE_KEYS.settings, '{');
      const s = storage.readSettings();
      expect(s.mode).toBe('light');
      expect(s.accent).toBe('amber');
    });

    it('readSettings respeta valores válidos', () => {
      storage.writeSettings({
        mode: 'dark',
        accent: 'blue',
        responseDetail: 'long',
      });
      const s = storage.readSettings();
      expect(s).toEqual({
        mode: 'dark',
        accent: 'blue',
        responseDetail: 'long',
      });
    });
  });

  describe('wipeAll', () => {
    it('borra manuales, Q&A y resultados pero deja settings', () => {
      storage.upsertManual(SAMPLE);
      storage.appendQA(SAMPLE.manual_id, {
        id: 'm1',
        role: 'user',
        text: 'x',
        ts: '2026-05-26T10:00:00.000Z',
      });
      storage.writeSettings({
        mode: 'dark',
        accent: 'amber',
        responseDetail: 'medium',
      });
      storage.wipeAll();
      expect(storage.listManuals()).toEqual([]);
      expect(storage.listQA(SAMPLE.manual_id)).toEqual([]);
      // settings se preserva — el usuario quiere mantener sus preferencias UI
      // al hacer "Borrar historial".
      expect(storage.readSettings().mode).toBe('dark');
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
      storage.upsertManual(SAMPLE);
      expect(listener).toHaveBeenCalledWith('quota', STORAGE_KEYS.manuals);
      off();
    });

    it('reason="denied" cuando se rechaza por SecurityError', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      storage.upsertManual(SAMPLE);
      expect(listener).toHaveBeenCalledWith('denied', STORAGE_KEYS.manuals);
      off();
    });

    it('reason="unknown" para errores no clasificados', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('boom');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      storage.upsertManual(SAMPLE);
      expect(listener).toHaveBeenCalledWith('unknown', STORAGE_KEYS.manuals);
      off();
    });

    it('el unsubscribe devuelto detiene las notificaciones', () => {
      setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
      const listener = vi.fn();
      const off = onStorageWriteFail(listener);
      off();
      storage.upsertManual(SAMPLE);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
