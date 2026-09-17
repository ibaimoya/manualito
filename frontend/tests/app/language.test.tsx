import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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

function holdViewTransitions() {
  // Aislamos únicamente el calendario de capturas del navegador, ausente en jsdom.
  // El provider y la traducción siguen siendo reales.
  const pending: Array<{
    update: () => Promise<void>;
    finish: () => void;
    skip: ReturnType<typeof vi.fn>;
  }> = [];
  const start = vi.spyOn(document, 'startViewTransition').mockImplementation((options) => {
    const updated = Promise.withResolvers<void>();
    const ready = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    const skip = vi.fn(() => ready.reject(new DOMException('Transition skipped', 'AbortError')));
    pending.push({
      update: async () => {
        const callback = typeof options === 'function' ? options : options?.update;
        await callback?.();
        updated.resolve();
        ready.resolve();
      },
      finish: finished.resolve,
      skip,
    });
    return {
      ready: ready.promise,
      finished: finished.promise,
      updateCallbackDone: updated.promise,
      types: new Set(typeof options === 'object' ? options.types : []),
      skipTransition: skip,
    };
  });
  return { start, pending };
}

function reducedMotionPreference(initial = false) {
  // La preferencia del sistema es otra frontera que jsdom no implementa.
  const media = Object.assign(new EventTarget(), { matches: initial });
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  return (reduced: boolean) =>
    act(() => {
      media.matches = reduced;
      media.dispatchEvent(new Event('change'));
    });
}

afterEach(() => vi.restoreAllMocks());

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

  it('el título del documento sigue al idioma activo', async () => {
    const user = userEvent.setup();
    renderProbe();
    expect(document.title).toContain('Aprende juegos de mesa');
    await user.click(screen.getByText('en'));
    expect(document.title).toContain('Learn board games');
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
    const start = vi.spyOn(document, 'startViewTransition');
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'es' }));
    expect(screen.getByTestId('language').textContent).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(start).not.toHaveBeenCalled();
  });

  it('selecciona sin esperar a la captura y traduce dentro de ella, conservando el foco', async () => {
    const { start, pending } = holdViewTransitions();
    const user = userEvent.setup();
    renderProbe();
    const english = screen.getByRole('button', { name: 'en' });

    await user.click(english);
    expect(screen.getByTestId('language')).toHaveTextContent('en');
    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    expect(start).toHaveBeenCalledWith({ types: ['language'], update: expect.any(Function) });
    await user.click(english);
    expect(start).toHaveBeenCalledTimes(1);

    await act(() => pending[0]!.update());
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toContain('Learn board games');
    expect(english).toHaveFocus();
    expect(document.documentElement).toHaveAttribute('data-language-snapshot');
    await act(() => pending[0]!.finish());
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
  });

  it('una captura anterior pendiente no restaura un idioma descartado', async () => {
    const { pending } = holdViewTransitions();
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    await user.click(screen.getByRole('button', { name: 'es' }));

    await act(() => pending[0]!.update());
    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    await act(() => pending[1]!.update());
    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toContain('Aprende juegos de mesa');
    expect(localStorage.getItem('manualito.language')).toBe('"es"');
    expect(document.documentElement).toHaveAttribute('data-language-snapshot');
  });

  it('aplica directamente con movimiento reducido o la pestaña oculta', async () => {
    const setReducedMotion = reducedMotionPreference(true);
    const { start } = holdViewTransitions();
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    expect(document.documentElement.lang).toBe('en');
    expect(start).not.toHaveBeenCalled();

    setReducedMotion(false);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await user.click(screen.getByRole('button', { name: 'es' }));
    expect(document.documentElement.lang).toBe('es');
    expect(start).not.toHaveBeenCalled();
  });

  it('activar movimiento reducido cancela la captura y mantiene la última selección', async () => {
    const setReducedMotion = reducedMotionPreference();
    const { pending, start } = holdViewTransitions();
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    setReducedMotion(true);
    expect(pending[0]!.skip).toHaveBeenCalledOnce();
    expect(document.documentElement.lang).toBe('en');

    await user.click(screen.getByRole('button', { name: 'es' }));
    await act(() => pending[0]!.update());
    expect(document.documentElement.lang).toBe('es');
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    expect(localStorage.getItem('manualito.language')).toBe('"es"');
    setReducedMotion(false);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('retira la captura ya visible al activar movimiento reducido', async () => {
    const setReducedMotion = reducedMotionPreference();
    const { pending } = holdViewTransitions();
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    await act(() => pending[0]!.update());
    expect(document.documentElement).toHaveAttribute('data-language-snapshot');
    setReducedMotion(true);
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    expect(pending[0]!.skip).toHaveBeenCalledOnce();
  });

  it('finalizar una transición anterior no impide cancelar la actual al desmontar', async () => {
    const { pending } = holdViewTransitions();
    const user = userEvent.setup();
    const { unmount } = renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    await act(() => pending[0]!.update());
    await user.click(screen.getByRole('button', { name: 'es' }));
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    await act(() => pending[1]!.update());
    await act(() => pending[0]!.finish());
    expect(document.documentElement).toHaveAttribute('data-language-snapshot');
    unmount();
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
    expect(pending[1]!.skip).toHaveBeenCalledOnce();
  });

  it('una actualización pendiente tras desmontar no reactiva la captura', async () => {
    const { pending } = holdViewTransitions();
    const user = userEvent.setup();
    const { unmount } = renderProbe();
    await user.click(screen.getByRole('button', { name: 'en' }));
    unmount();
    await act(() => pending[0]!.update());
    expect(document.documentElement).not.toHaveAttribute('data-language-snapshot');
  });

  it('useLanguage fuera del provider lanza un error claro', () => {
    expect(() => render(<LanguageProbe />)).toThrow(/LanguageProvider/);
  });
});
