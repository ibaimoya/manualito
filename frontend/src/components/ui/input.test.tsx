import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Input } from './input';
import { Label } from './label';

describe('Input', () => {
  it('renderiza un input que acepta texto', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="nombre" />);
    const i = screen.getByRole('textbox', { name: 'nombre' });
    await user.type(i, 'Catan');
    expect(i).toHaveValue('Catan');
  });

  it('respeta disabled', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="x" disabled />);
    const i = screen.getByRole('textbox', { name: 'x' });
    await user.type(i, 'hola');
    expect(i).toHaveValue('');
  });

  it('Label con htmlFor + Input con id se asocian para a11y', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="game">Nombre del juego</Label>
        <Input id="game" placeholder="Catan…" />
      </div>,
    );
    expect(screen.getByLabelText('Nombre del juego')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  // ─── preset prop (refactor J1, bug #29) ──────────────────────────────
  describe('preset', () => {
    it('"game-name" aplica capitalización de palabras y spellcheck=false', () => {
      render(<Input aria-label="g" preset="game-name" />);
      const i = screen.getByRole('textbox', { name: 'g' });
      expect(i).toHaveAttribute('inputmode', 'text');
      expect(i).toHaveAttribute('enterkeyhint', 'done');
      expect(i).toHaveAttribute('autocapitalize', 'words');
      expect(i).toHaveAttribute('autocomplete', 'off');
      expect(i).toHaveAttribute('spellcheck', 'false');
    });

    it('"search" produce type=search con enterKeyHint search', () => {
      // Cuando type=search los inputs dejan de ser role="textbox" y
      // pasan a role="searchbox" — así lo localizamos.
      render(<Input aria-label="q" preset="search" />);
      const i = screen.getByRole('searchbox', { name: 'q' });
      expect(i).toHaveAttribute('type', 'search');
      expect(i).toHaveAttribute('inputmode', 'search');
      expect(i).toHaveAttribute('enterkeyhint', 'search');
      expect(i).toHaveAttribute('autocapitalize', 'none');
    });

    it('"chat-message" capitaliza oraciones y abre teclado de envío', () => {
      render(<Input aria-label="msg" preset="chat-message" />);
      const i = screen.getByRole('textbox', { name: 'msg' });
      expect(i).toHaveAttribute('enterkeyhint', 'send');
      expect(i).toHaveAttribute('autocapitalize', 'sentences');
      expect(i).toHaveAttribute('spellcheck', 'true');
    });

    it('props del callsite sobrescriben el preset', () => {
      // Si el callsite pone autoCapitalize="none" explícito, gana
      // sobre el "words" del preset 'game-name'.
      render(
        <Input
          aria-label="g"
          preset="game-name"
          autoCapitalize="none"
          spellCheck
        />,
      );
      const i = screen.getByRole('textbox', { name: 'g' });
      expect(i).toHaveAttribute('autocapitalize', 'none');
      expect(i).toHaveAttribute('spellcheck', 'true');
    });

    it('"free" (default) no aplica preset', () => {
      render(<Input aria-label="x" />);
      const i = screen.getByRole('textbox', { name: 'x' });
      expect(i).not.toHaveAttribute('inputmode');
      expect(i).not.toHaveAttribute('enterkeyhint');
    });
  });
});
