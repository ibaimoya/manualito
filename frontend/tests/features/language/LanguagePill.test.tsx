import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { LanguageProvider } from '@/app/language';
import { LanguagePill } from '@/features/language/LanguagePill';

function renderPill() {
  return render(
    <LanguageProvider>
      <LanguagePill />
    </LanguageProvider>,
  );
}

describe('LanguagePill', () => {
  it('cambia el idioma y activa la etiqueta y el nombre accesible del siguiente destino', async () => {
    const user = userEvent.setup();
    renderPill();
    const button = screen.getByRole('button', { name: 'Switch language to English' });
    const english = screen.getByText('English');
    const spanish = screen.getByText('Español');
    expect(button).toHaveAttribute('lang', 'en');
    expect(english).toHaveAttribute('lang', 'en');
    expect(english).toHaveAttribute('data-active', 'true');
    expect(spanish).toHaveAttribute('data-active', 'false');

    await user.click(button);

    expect(document.documentElement.lang).toBe('en');
    expect(button).toHaveAccessibleName('Cambiar el idioma a español');
    expect(button).toHaveAttribute('lang', 'es');
    expect(spanish).toHaveAttribute('lang', 'es');
    expect(spanish).toHaveAttribute('data-active', 'true');
    expect(english).toHaveAttribute('data-active', 'false');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderPill();
    expect(await axe(container)).toHaveNoViolations();
  });
});
