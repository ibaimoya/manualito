import { describe, expect, it } from 'vitest';
import { cn } from '@/shared/lib/cn';

describe('cn', () => {
  it('merge clases simples', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('elimina duplicados Tailwind con precedencia (la última gana)', () => {
    // text-sm + text-lg → debe ganar el último (tw-merge).
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('soporta condicionales clsx', () => {
    const off = false as const;
    const on = true as const;
    expect(cn('base', off && 'hidden', on && 'visible')).toBe('base visible');
  });

  it('arrays y objetos clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});
