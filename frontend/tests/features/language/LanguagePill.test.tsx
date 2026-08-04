import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { LanguageProvider } from '@/app/language';
import { LanguagePill } from '@/features/language/LanguagePill';

function renderPill(props?: Readonly<{ tone?: 'light' | 'dark' }>) {
  return render(
    <LanguageProvider>
      <LanguagePill {...props} />
    </LanguageProvider>,
  );
}

describe('LanguagePill', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'es';
  });

  it('muestra el otro idioma en su forma nativa con su atributo lang', () => {
    renderPill();
    const label = screen.getByText('English');
    expect(label).toHaveAttribute('lang', 'en');
  });

  it('el aria va en el idioma destino', () => {
    renderPill();
    expect(screen.getByRole('button', { name: 'Switch language to English' })).toBeInTheDocument();
  });

  it('un toque cambia el idioma y el pill pasa a ofrecer el anterior', async () => {
    const user = userEvent.setup();
    renderPill();
    await user.click(screen.getByRole('button', { name: 'Switch language to English' }));
    expect(document.documentElement.lang).toBe('en');
    const label = screen.getByText('Español');
    expect(label).toHaveAttribute('lang', 'es');
    expect(screen.getByRole('button', { name: 'Cambiar el idioma a español' })).toBeInTheDocument();
  });

  it('el tono oscuro conserva el mismo comportamiento', async () => {
    const user = userEvent.setup();
    renderPill({ tone: 'dark' });
    await user.click(screen.getByRole('button', { name: 'Switch language to English' }));
    expect(document.documentElement.lang).toBe('en');
  });

  it('no tiene violaciones de accesibilidad', async () => {
    const { container } = renderPill();
    expect(await axe(container)).toHaveNoViolations();
  });
});
