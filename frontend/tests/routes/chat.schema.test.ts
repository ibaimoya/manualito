import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Reproduce el schema usado en chat.$manualId.tsx (validateSearch).
 * Bug #10 del catálogo: el `q` debe estar limitado a 500 chars
 * para alinearse con el backend `QuestionRequest`.
 */
const chatSearchSchema = z.object({
  q: z.string().min(1).max(500).optional(),
});

describe('chatSearchSchema (bug #10)', () => {
  it('acepta una pregunta vacía (sin q)', () => {
    expect(chatSearchSchema.parse({})).toEqual({});
  });

  it('acepta una pregunta corta', () => {
    expect(chatSearchSchema.parse({ q: '¿Cómo gano?' }).q).toBe('¿Cómo gano?');
  });

  it('acepta hasta 500 caracteres', () => {
    const q = 'a'.repeat(500);
    expect(chatSearchSchema.parse({ q }).q).toBe(q);
  });

  it('rechaza 501 caracteres (URL injection / DoS)', () => {
    const q = 'a'.repeat(501);
    expect(() => chatSearchSchema.parse({ q })).toThrow();
  });

  it('rechaza string vacío explícito', () => {
    expect(() => chatSearchSchema.parse({ q: '' })).toThrow();
  });

  it('no acepta payloads enormes (10 KB)', () => {
    const q = 'a'.repeat(10_000);
    expect(() => chatSearchSchema.parse({ q })).toThrow();
  });
});
