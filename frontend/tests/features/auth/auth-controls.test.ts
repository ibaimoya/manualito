import { describe, expect, it } from 'vitest';
import { emailFieldError, isEmail, passwordTooShortError } from '@/features/auth/auth-controls';

describe('auth-controls', () => {
  it('valida emails de forma lineal para feedback de cliente', () => {
    expect(isEmail('marta@example.com')).toBe(true);
    expect(isEmail('marta@example.co.uk')).toBe(true);
    expect(isEmail('marta.example.com')).toBe(false);
    expect(isEmail('marta@@example.com')).toBe(false);
    expect(isEmail('marta@localhost')).toBe(false);
    expect(isEmail('marta @example.com')).toBe(false);
  });

  it('muestra errores solo cuando corresponde', () => {
    expect(emailFieldError('', false)).toBeUndefined();
    expect(emailFieldError('', true)).toBe('Ese email no parece válido');
    expect(passwordTooShortError('corta', true)).toBe('Mínimo 12 caracteres');
    expect(passwordTooShortError('contraseña larga', true)).toBeUndefined();
  });
});
