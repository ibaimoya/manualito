import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpainFlag } from '@/features/language/flags';
import { useFlagWave } from '@/features/language/useFlagWave';

function systemPreferences() {
  // Solo sustituimos la consulta al sistema que jsdom no implementa.
  const original = window.matchMedia;
  const preferences = { reduced: false, coarse: false };
  const media = Object.assign(new EventTarget(), {
    matches: true,
    media: '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
  });
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === media.media ? (media as unknown as MediaQueryList) : original(query),
  );
  return (preference: keyof typeof preferences, value: boolean) =>
    act(() => {
      preferences[preference] = value;
      media.matches = !preferences.reduced && !preferences.coarse;
      media.dispatchEvent(new Event('change'));
    });
}

function FlagButton() {
  const waveRef = useFlagWave<HTMLButtonElement>();
  return (
    <button ref={waveRef}>
      <SpainFlag />
      Español
    </button>
  );
}

function renderWave() {
  render(<FlagButton />, { wrapper: StrictMode });
  const host = screen.getByRole('button', { name: 'Español' });
  const stripes = host.querySelector('[data-flag-wave]');
  if (!stripes) throw new Error('No se ha montado la bandera de España');
  return { host, stripes, flat: stripes.getAttribute('d') };
}

function nextFrame() {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

afterEach(() => vi.restoreAllMocks());

describe('useFlagWave con Motion real', () => {
  it('deforma las franjas al entrar y vuelve al trazado plano al salir', async () => {
    systemPreferences();
    const { host, stripes, flat } = renderWave();
    fireEvent.mouseEnter(host);
    await waitFor(() => expect(stripes.getAttribute('d')).not.toBe(flat));

    fireEvent.mouseLeave(host);
    await waitFor(() => expect(stripes.getAttribute('d')).toBe(flat));
    await nextFrame();
    expect(stripes.getAttribute('d')).toBe(flat);
  });

  it('retoma desde la forma actual al volver a entrar durante el regreso', async () => {
    systemPreferences();
    const { host, stripes, flat } = renderWave();
    fireEvent.mouseEnter(host);
    await waitFor(() => expect(stripes.getAttribute('d')).not.toBe(flat));
    const entering = stripes.getAttribute('d');
    fireEvent.mouseLeave(host);
    await waitFor(() => {
      expect(stripes.getAttribute('d')).not.toBe(entering);
      expect(stripes.getAttribute('d')).not.toBe(flat);
    });
    const interrupted = stripes.getAttribute('d');
    fireEvent.mouseEnter(host);
    // Motion puede actualizar el instante al detenerse, pero no debe volver al inicio plano.
    expect(stripes.getAttribute('d')).not.toBe(flat);
    await nextFrame();
    expect(stripes.getAttribute('d')).not.toBe(flat);
    await waitFor(() => expect(stripes.getAttribute('d')).not.toBe(interrupted));

    fireEvent.mouseLeave(host);
    await waitFor(() => expect(stripes.getAttribute('d')).toBe(flat));
  });

  it.each(['reduced', 'coarse'] as const)(
    'cancela en caliente por %s y permite una nueva entrada sin reproducirse al restaurar',
    async (preference) => {
      const setPreference = systemPreferences();
      const { host, stripes, flat } = renderWave();
      fireEvent.mouseEnter(host);
      await waitFor(() => expect(stripes.getAttribute('d')).not.toBe(flat));

      setPreference(preference, true);
      expect(stripes.getAttribute('d')).toBe(flat);
      fireEvent.mouseLeave(host);
      fireEvent.mouseEnter(host);
      await nextFrame();
      expect(stripes.getAttribute('d')).toBe(flat);

      setPreference(preference, false);
      await nextFrame();
      await nextFrame();
      expect(stripes.getAttribute('d')).toBe(flat);
      fireEvent.mouseLeave(host);
      fireEvent.mouseEnter(host);
      await waitFor(() => expect(stripes.getAttribute('d')).not.toBe(flat));
    },
  );
});
