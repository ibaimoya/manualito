import { describe, expect, it } from 'vitest';
import { mapApiError, mapHttpStatus } from '@/shared/api/error-mapper';

describe('error-mapper · mapHttpStatus', () => {
  it.each([
    [413, 'Archivo demasiado grande'],
    [415, 'Formato no soportado'],
    [422, 'No conseguimos leer el manual'],
    [404, 'Manual no encontrado'],
    [500, 'Algo ha fallado'],
    [502, 'Servicio cargando'],
    [503, 'Servicio no disponible'],
    [504, 'Tiempo de espera agotado'],
  ])('mapea %i → "%s"', (status, expectedTitle) => {
    const v = mapHttpStatus(status);
    expect(v.title).toBe(expectedTitle);
    expect(v.code).toBe(`http.${status}`);
  });

  it('400 y otros 4xx genéricos caen al fallback amistoso', () => {
    const v = mapHttpStatus(418);
    expect(v.code).toBe('http.418');
    expect(v.retryable).toBe(true);
    expect(v.severity).toBe('warning');
  });

  it('5xx genéricos marcan severity error', () => {
    const v = mapHttpStatus(599);
    expect(v.severity).toBe('error');
    expect(v.retryable).toBe(true);
  });

  it('413 usa un fallback neutral cuando el proxy no aporta un código de dominio', () => {
    // No debemos asumir si el cuerpo rechazado era imagen o PDF: un proxy
    // puede emitir el 413 antes de que la API llegue a clasificar la subida.
    const v = mapHttpStatus(413);
    expect(v.message).toBe('La subida supera el tamaño permitido.');
    expect(v.hint).toContain('archivo');
  });

  it('404 NO es retryable (el manual ya no existe)', () => {
    expect(mapHttpStatus(404).retryable).toBe(false);
  });
});

describe('error-mapper · mapApiError', () => {
  it('TypeError → vista de red', () => {
    const v = mapApiError(new TypeError('fetch failed'));
    expect(v.code).toBe('network');
    expect(v.severity).toBe('warning');
  });

  it('objeto con status numérico → usa tabla', () => {
    const v = mapApiError({ status: 502 });
    expect(v.code).toBe('http.502');
  });

  it('prioriza el código estable del backend sobre el status genérico', () => {
    const v = mapApiError({
      status: 404,
      raw: {
        detail: 'Juego no encontrado.',
        errors: [{ field: null, code: 'game_not_found', message: 'Juego no encontrado.' }],
      },
    });

    expect(v.code).toBe('game_not_found');
    expect(v.title).toBe('Juego no encontrado');
    expect(v.message).toContain('juego seleccionado');
  });

  it('distingue un PDF grande de una imagen grande aunque ambos sean 413', () => {
    const v = mapApiError({
      status: 413,
      raw: {
        detail: 'El PDF no puede superar 95 MB.',
        errors: [{ field: null, code: 'pdf_too_large', message: 'El PDF no puede superar 95 MB.' }],
      },
    });

    expect(v.code).toBe('pdf_too_large');
    expect(v.title).toBe('PDF demasiado grande');
    expect(v.message).toBe('El PDF puede ocupar como máximo 95 MB.');
  });

  it('explica el límite agregado de 95 MB para un manual de imágenes', () => {
    const v = mapApiError({
      status: 413,
      raw: {
        detail: 'El manual no puede superar 95 MB.',
        errors: [
          { field: null, code: 'manual_too_large', message: 'El manual no puede superar 95 MB.' },
        ],
      },
    });

    expect(v.code).toBe('manual_too_large');
    expect(v.title).toBe('Manual demasiado grande');
    expect(v.message).toBe('El conjunto de imágenes puede ocupar como máximo 95 MB.');
  });

  it('objeto con response.status → usa tabla', () => {
    const v = mapApiError({ response: { status: 504 } });
    expect(v.code).toBe('http.504');
  });

  it('basura → fallback "unknown"', () => {
    expect(mapApiError(undefined).code).toBe('unknown');
    expect(mapApiError('cualquier string').code).toBe('unknown');
    expect(mapApiError({ foo: 'bar' }).code).toBe('unknown');
  });
});
