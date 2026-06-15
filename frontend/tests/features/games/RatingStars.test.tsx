import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { RATE_LABELS, RatingStars } from '@/features/games/RatingStars';

describe('RatingStars · solo lectura', () => {
  it('expone la puntuación como etiqueta accesible', () => {
    render(<RatingStars value={3} />);
    expect(screen.getByLabelText('Valoración: 3 de 5')).toBeInTheDocument();
  });

  it('sin puntuación anuncia «Sin valorar»', () => {
    render(<RatingStars value={0} />);
    expect(screen.getByLabelText('Sin valorar')).toBeInTheDocument();
  });

  it('no renderiza botones (no es interactivo)', () => {
    render(<RatingStars value={4} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('RatingStars · interactivo', () => {
  it('renderiza 5 botones con su etiqueta descriptiva', () => {
    render(<RatingStars value={0} onSelect={() => undefined} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
    expect(buttons[4]).toHaveAccessibleName(`5 estrellas — ${RATE_LABELS[5]}`);
  });

  it('marca la puntuación actual con aria-pressed', () => {
    render(<RatingStars value={2} onSelect={() => undefined} />);
    expect(screen.getByRole('button', { name: /2 estrellas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /3 estrellas/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('al pulsar una estrella notifica la puntuación elegida', async () => {
    const onSelect = vi.fn();
    render(<RatingStars value={0} onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /4 estrellas/ }));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<RatingStars value={3} onSelect={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
