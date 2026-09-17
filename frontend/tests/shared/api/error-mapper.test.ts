import { describe, expect, it } from 'vitest';
import i18n from '@/app/i18n';
import es from '@/locales/es/errors.json';
import en from '@/locales/en/errors.json';
import { mapApiError, mapHttpStatus } from '@/shared/api/error-mapper';
import { ApiError } from '@/shared/api/http';

const serverMessage = 'Mensaje del servidor que no debe mostrarse.';

function backendError(code: string, status = 422, params: unknown = {}) {
  return new ApiError(status, {
    detail: serverMessage,
    errors: [{ field: null, code, message: serverMessage, params }],
  });
}

describe('localización de errores', () => {
  it('ambos idiomas cubren los mismos códigos y no comparten copia sin traducir', () => {
    expect(Object.keys(en.code).sort()).toEqual(Object.keys(es.code).sort());
    for (const code of Object.keys(es.code) as (keyof typeof es.code)[]) {
      for (const field of ['title', 'message', 'hint'] as const) {
        expect(en.code[code][field]).not.toBe(es.code[code][field]);
      }
    }
  });

  it.each(['es', 'en'] as const)(
    'traduce todo el catálogo en %s sin texto crudo ni variables pendientes',
    async (language) => {
      await i18n.changeLanguage(language);
      const catalog = language === 'es' ? es : en;
      for (const [code, copy] of Object.entries(catalog.code)) {
        const view = backendError(code, 422, { min: 12, max: 95 }).view;
        expect(view.code).toBe(code);
        expect(view.title).toBe(copy.title);
        expect(view.message).toBe(copy.message.replace('{{min}}', '12').replace('{{max}}', '95'));
        expect(view.hint).toBe(copy.hint);
        expect(JSON.stringify(view)).not.toMatch(/Mensaje del servidor|{{|⟦/);
      }
    },
  );

  it('conserva el error y sus datos, pero resuelve la vista en el idioma actual', async () => {
    const error = backendError('invalid_credentials', 401);
    expect(error.view.message).toBe(es.code.invalid_credentials.message);
    await i18n.changeLanguage('en');
    expect(error.view.message).toBe('The email, username or password is incorrect.');
    expect(error.view.code).toBe('invalid_credentials');
    expect(error.view.retryable).toBe(false);
    expect(error.raw).toHaveProperty('detail', serverMessage);
    await i18n.changeLanguage('es');
    expect(error.view.message).toBe(es.code.invalid_credentials.message);
  });

  it.each([400, 401, 403, 404, 409, 413, 415, 418, 422, 429, 500, 502, 503, 504, 599])(
    'un código nuevo en HTTP %i usa una respuesta local, nunca detail o message',
    async (status) => {
      await i18n.changeLanguage('en');
      const error = backendError('future_error', status);
      expect(error.view.message).toBe(mapHttpStatus(status).message);
      expect(error.view.code).toBe('future_error');
      expect(mapApiError({ status, raw: { detail: serverMessage } }).message).toBe(
        mapHttpStatus(status).message,
      );
    },
  );

  it.each([null, 'html del proxy', { errors: [] }, { errors: [null] }, { errors: [{ code: 42 }] }])(
    'un cuerpo no reconocido usa la traducción HTTP',
    (raw) => expect(mapApiError({ status: 500, raw }).message).toBe(es.http['500'].message),
  );

  it.each([
    {},
    { max: '95' },
    { max: -1 },
    { max: 2.5 },
    { max: Number.MAX_SAFE_INTEGER + 1 },
    { max: Number.NaN },
    { max: Infinity },
  ])('un límite inválido no deja marcadores de traducción visibles', (params) => {
    const view = backendError('pdf_too_large', 413, params).view;
    expect(view.message).toBe(es.http['413'].message);
    expect(view.code).toBe('pdf_too_large');
  });

  it('usa los límites reales sin confundir PDF, imagen, páginas y longitud', async () => {
    await i18n.changeLanguage('en');
    expect(backendError('image_too_large', 413, { max: 30 }).view.message).toContain('30 MB');
    expect(backendError('pdf_too_large', 413, { max: 80 }).view.message).toContain('80 MB');
    expect(backendError('manual_too_many_pages', 413, { max: 25 }).view.message).toContain(
      '25 pages',
    );
    expect(backendError('password_too_short', 422, { min: 14 }).view.message).toContain(
      '14 characters',
    );
    expect(backendError('username_too_long', 422, { max: 60 }).view.message).toContain(
      '60 characters',
    );
  });

  it('los fallbacks no atribuyen errores genéricos a OCR o a un manual', async () => {
    await i18n.changeLanguage('en');
    expect(mapHttpStatus(404).title).toBe('Resource not found');
    expect(mapHttpStatus(422).title).toBe('Invalid details');
    expect(mapHttpStatus(502).title).toBe('Service unavailable');
    expect(mapHttpStatus(404).retryable).toBe(false);
    expect(mapHttpStatus(599).severity).toBe('error');
    expect(backendError('manual_busy', 409).view.retryable).toBe(true);
  });

  it('mantiene los errores de red y timeout al envolverlos y al cambiar de idioma', async () => {
    const network = new ApiError(undefined, new TypeError('Failed to fetch'));
    const timeout = new ApiError(504, new DOMException('Timeout', 'TimeoutError'));
    await i18n.changeLanguage('en');
    expect(mapApiError(network).message).toBe(en.network.message);
    expect(mapApiError(timeout).message).toBe(en.http['504'].message);
    expect(mapApiError(undefined).message).toBe(en.unknown.message);
    expect(mapApiError(new Error(serverMessage)).message).toBe(en.unknown.message);
  });
});
