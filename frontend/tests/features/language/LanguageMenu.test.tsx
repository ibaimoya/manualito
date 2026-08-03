import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { LanguageProvider } from '@/app/language';
import { LanguageMenu } from '@/features/language/LanguageMenu';

function renderMenu() {
  return render(
    <LanguageProvider>
      <LanguageMenu />
    </LanguageProvider>,
  );
}

function trigger() {
  return screen.getByRole('button', { name: /Idioma de la interfaz|Interface language/i });
}

describe('LanguageMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'es';
  });

  it('el trigger muestra el código del idioma actual', () => {
    renderMenu();
    expect(trigger()).toHaveTextContent('ES');
  });

  it('abre el menú con ambos idiomas en su forma nativa y el actual marcado', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    const spanish = await screen.findByRole('menuitemradio', { name: /Español/ });
    const english = screen.getByRole('menuitemradio', { name: /English/ });
    expect(spanish).toHaveAttribute('aria-checked', 'true');
    expect(english).toHaveAttribute('aria-checked', 'false');
  });

  it('cambiar de idioma aplica el cambio sin cerrar el menú', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitemradio', { name: /English/ }));
    expect(document.documentElement.lang).toBe('en');
    expect(trigger()).toHaveTextContent('EN');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('clicar el idioma ya activo no cambia nada y el menú sigue abierto', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitemradio', { name: /Español/ }));
    expect(document.documentElement.lang).toBe('es');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('tras un cambio el menú se cierra solo pasados unos segundos', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await user.click(await screen.findByRole('menuitemradio', { name: /English/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument(), {
      timeout: 4000,
    });
  });

  it('Escape cierra el menú', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('abierto no tiene violaciones de accesibilidad', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    expect(await axe(await screen.findByRole('menu'))).toHaveNoViolations();
  });
});
