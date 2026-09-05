import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { RatingStars } from '@/features/games/RatingStars';
import { useState } from 'react';

function RatingExample() {
  const [value, setValue] = useState(2);
  return <RatingStars value={value} onSelect={setValue} />;
}

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
    expect(buttons[4]).toHaveAccessibleName('5 estrellas — Es una locura');
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

  it('previsualiza sin cambiar la selección hasta pulsar y la conserva al retirar el ratón', async () => {
    render(<RatingExample />);
    const user = userEvent.setup();
    const second = screen.getByRole('button', { name: /2 estrellas/ });
    const fifth = screen.getByRole('button', { name: /5 estrellas/ });
    await user.hover(fifth);
    expect(second).toHaveAttribute('aria-pressed', 'true');
    expect(fifth).toHaveAttribute('aria-pressed', 'false');
    await user.click(fifth);
    await user.unhover(fifth);
    expect(fifth).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
  });

  it('permite elegir con teclado sin cambiar la puntuación solo por mover el foco', async () => {
    render(<RatingExample />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{Enter}');
    const first = screen.getAllByRole('button')[0];
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await user.tab();
    expect(screen.getByRole('button', { name: /2 estrellas/ })).toHaveFocus();
    expect(first).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: /2 estrellas/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = render(<RatingStars value={3} onSelect={() => undefined} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
