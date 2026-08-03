import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider, useLanguage } from '@/app/language';

function LanguageProbe() {
  const { language, setLanguage } = useLanguage();
  return (
    <div>
      <p data-testid="language">{language}</p>
      <button onClick={() => setLanguage('en')}>en</button>
      <button onClick={() => setLanguage('es')}>es</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <LanguageProvider>
      <LanguageProbe />
    </LanguageProvider>,
  );
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'es';
  });

  it('arranca en español y lo aplica al lang del html', () => {
    renderProbe();
    expect(screen.getByTestId('language').textContent).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('cambiar a inglés actualiza html.lang y persiste', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByText('en'));
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('manualito.language')).toBe('"en"');
  });

  it('lee el idioma persistido al montar', () => {
    localStorage.setItem('manualito.language', '"en"');
    renderProbe();
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('un valor corrupto en storage cae al español por defecto', () => {
    localStorage.setItem('manualito.language', '"klingon"');
    renderProbe();
    expect(screen.getByTestId('language').textContent).toBe('es');
  });

  it('repetir el idioma actual no rompe ni cambia nada', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'es' }));
    expect(screen.getByTestId('language').textContent).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('useLanguage fuera del provider lanza un error claro', () => {
    expect(() => render(<LanguageProbe />)).toThrow(/LanguageProvider/);
  });
});
