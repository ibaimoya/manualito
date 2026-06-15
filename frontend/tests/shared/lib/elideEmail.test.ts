import { describe, expect, it } from 'vitest';
import { elideEmail } from '@/shared/lib/elideEmail';

describe('elideEmail', () => {
  it('deja intactos los emails de longitud normal', () => {
    expect(elideEmail('ana@example.com')).toBe('ana@example.com');
    expect(elideEmail('ibaimoyaaroz@gmail.com')).toBe('ibaimoyaaroz@gmail.com');
  });

  it('acorta la parte local larga conservando el dominio', () => {
    expect(elideEmail('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@gmail.com')).toBe(
      'aaaaaaaaaaaaaaaaaa…@gmail.com',
    );
  });

  it('justo en el límite no toca nada', () => {
    const local = 'a'.repeat(18);
    expect(elideEmail(`${local}@x.es`)).toBe(`${local}@x.es`);
  });

  it('sin arroba (valor corrupto) lo devuelve tal cual', () => {
    expect(elideEmail('sin-arroba')).toBe('sin-arroba');
  });

  it('con límite corto (sidebar) recorta antes manteniendo el dominio', () => {
    expect(elideEmail('bvbbbbbbbbbbbbbbbb@gmail.com', 8)).toBe('bvbbbbbb…@gmail.com');
    expect(elideEmail('ana@x.es', 8)).toBe('ana@x.es');
  });
});
