import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ExplanationBlocks } from '@/features/games/ExplanationBlocks';

const CONTENT = {
  setup: null,
  turns: null,
  victory: null,
};

describe('ExplanationBlocks', () => {
  it('no teclea textos que ya llegan en una respuesta generating inicial', async () => {
    render(
      <ExplanationBlocks
        summary="Catan va de construir y comerciar."
        content={{ ...CONTENT, setup: 'Monta el tablero y reparte piezas.' }}
      />,
    );

    expect(screen.getByText('Catan va de construir y comerciar.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /Preparación/ }));
    expect(screen.getByText('Monta el tablero y reparte piezas.')).toBeInTheDocument();
  });

  it('muestra completo al cerrar y reabrir un apartado que llegó después', async () => {
    const { rerender } = render(<ExplanationBlocks summary={null} content={CONTENT} />);

    rerender(
      <ExplanationBlocks
        summary={null}
        content={{ ...CONTENT, setup: 'Monta el tablero y reparte piezas.' }}
      />,
    );

    const user = userEvent.setup();
    const setup = screen.getByRole('button', { name: /Preparación/ });
    await user.click(setup);
    await waitFor(
      () => expect(screen.getByText('Monta el tablero y reparte piezas.')).toBeInTheDocument(),
      { timeout: 3000 },
    );

    await user.click(setup);
    await user.click(setup);
    expect(screen.getByText('Monta el tablero y reparte piezas.')).toBeInTheDocument();
  });
});
