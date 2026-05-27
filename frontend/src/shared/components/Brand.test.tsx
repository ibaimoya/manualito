import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LockUp, Monogram, Wordmark, Meeple } from './Brand';

describe('Brand · Monogram', () => {
  it('expone aria-label "Manualito" para lectores de pantalla', () => {
    render(<Monogram size={48} />);
    expect(screen.getByRole('img', { name: 'Manualito' })).toBeInTheDocument();
  });

  it('respeta el size prop', () => {
    const { container } = render(<Monogram size={140} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.width).toBe('140px');
    expect(el.style.height).toBe('140px');
  });

  it('pasa a11y axe', async () => {
    const { container } = render(<Monogram size={48} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('Brand · Wordmark', () => {
  it('renderiza el nombre "Manualito"', () => {
    render(<Wordmark />);
    expect(screen.getByText(/Manualito/)).toBeInTheDocument();
  });
});

describe('Brand · LockUp', () => {
  it('renderiza monograma + wordmark + tagline por defecto', () => {
    render(<LockUp />);
    expect(screen.getByRole('img', { name: 'Manualito' })).toBeInTheDocument();
    expect(screen.getByText(/Manualito/)).toBeInTheDocument();
    expect(screen.getByText(/Manuales · sin barreras/i)).toBeInTheDocument();
  });

  it('oculta tagline cuando withTagline=false', () => {
    render(<LockUp withTagline={false} />);
    expect(screen.queryByText(/Manuales · sin barreras/i)).not.toBeInTheDocument();
  });
});

describe('Brand · Meeple', () => {
  it('renderiza un SVG y queda oculto a lectores de pantalla', () => {
    const { container } = render(<Meeple size={32} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
