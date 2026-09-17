import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { LanguageProvider } from '@/app/language';
import { LanguageCards } from '@/features/language/LanguageCards';

function renderCards() {
  return render(
    <LanguageProvider>
      <LanguageCards />
    </LanguageProvider>,
  );
}

describe('LanguageCards', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'es';
  });

  it('muestra las dos tarjetas con nombres nativos y el español marcado', () => {
    renderCards();
    const group = screen.getByRole('radiogroup', { name: /Idioma de la interfaz/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Español/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('elegir English mueve la selección, aplica html.lang y persiste', async () => {
    const user = userEvent.setup();
    renderCards();
    await user.click(screen.getByRole('radio', { name: /English/ }));
    expect(screen.getByRole('radio', { name: /English/ })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('manualito.language')).toBe('"en"');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderCards();
    expect(await axe(container)).toHaveNoViolations();
  });
});
