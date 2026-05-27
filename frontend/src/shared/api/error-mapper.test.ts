import { describe, expect, it } from 'vitest';
import { mapApiError, mapHttpStatus } from './error-mapper';

describe('error-mapper · mapHttpStatus', () => {
  it.each([
    [413, 'Foto demasiado grande'],
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

  it('413 NO es retryable transparente para que el usuario reduzca el tamaño', () => {
    // 413 es "retryable=true" en nuestra tabla porque la siguiente acción
    // (hacer foto más pequeña) tiene sentido.  Pero NO es transparente:
    // no debemos auto-retry el mismo file.  Aquí solo verificamos la copy.
    const v = mapHttpStatus(413);
    expect(v.hint).toContain('resolución');
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
