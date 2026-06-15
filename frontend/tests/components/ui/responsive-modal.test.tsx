import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';

const DESKTOP_QUERY = '(min-width: 768px)';

/** matchMedia controlable: permite cruzar el breakpoint a mitad de test. */
function mockViewport(initialDesktop: boolean) {
  let desktop = initialDesktop;
  const listeners = new Set<() => void>();
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === DESKTOP_QUERY ? desktop : false;
        },
        media: query,
        onchange: null,
        addEventListener: (_: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return {
    spy,
    setDesktop(next: boolean) {
      desktop = next;
      for (const cb of [...listeners]) cb();
    },
  };
}

function DraftProbe() {
  const [value, setValue] = useState('');
  return (
    <input aria-label="borrador" value={value} onChange={(e) => setValue(e.target.value)} />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ResponsiveModal', () => {
  it('cruzar el breakpoint con el modal abierto conserva el borrador del formulario', async () => {
    const viewport = mockViewport(false);
    render(
      <ResponsiveModal open onOpenChange={() => undefined} title="Editar" description="d">
        <DraftProbe />
      </ResponsiveModal>,
    );
    expect(document.querySelector('[data-mn-sheet]')).not.toBeNull();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('borrador'), 'sin guardar');

    // Rotación del dispositivo: pasa a desktop sin perder lo escrito.
    act(() => viewport.setDesktop(true));
    expect(document.querySelector('[data-mn-dialog]')).not.toBeNull();
    expect(document.querySelector('[data-mn-sheet]')).toBeNull();
    expect(screen.getByLabelText('borrador')).toHaveValue('sin guardar');
  });

  it('contentClassName se aplica también en la variante móvil', () => {
    mockViewport(false);
    render(
      <ResponsiveModal
        open
        onOpenChange={() => undefined}
        title="Editar"
        contentClassName="max-w-lg"
      >
        <p>contenido</p>
      </ResponsiveModal>,
    );
    const sheet = document.querySelector('[data-mn-sheet]');
    expect(sheet).not.toBeNull();
    expect(sheet!.className).toContain('max-w-lg');
    expect(sheet!.className).not.toContain('max-w-md');
  });
});
