import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NameManualSheet } from '@/features/upload/NameManualSheet';

/**
 * Mock matchMedia controlable para forzar mobile/desktop sin renderHook.
 * Encaja con la query semántica desktop = matchMedia('(min-width: 768px)').
 */
type Listener = (e: { matches: boolean; media: string }) => void;
const registry = new Map<string, { matches: boolean; listeners: Set<Listener> }>();

function installMatchMedia(defaults: Record<string, boolean>): void {
  registry.clear();
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => {
    let entry = registry.get(q);
    if (!entry) {
      entry = { matches: defaults[q] ?? false, listeners: new Set() };
      registry.set(q, entry);
    }
    return {
      matches: entry.matches,
      media: q,
      onchange: null,
      addEventListener: (_t: string, l: Listener) => entry!.listeners.add(l),
      removeEventListener: (_t: string, l: Listener) => entry!.listeners.delete(l),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  });
}

beforeEach(() => installMatchMedia({}));
afterEach(() => vi.restoreAllMocks());

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function makeFile() {
  return new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
}

describe('NameManualSheet (switch responsive Sheet ↔ Dialog)', () => {
  it('en mobile (matchMedia false) monta el contenedor Sheet con data-mn-sheet', () => {
    installMatchMedia({ '(min-width: 768px)': false });
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    // El Sheet inyecta data-mn-sheet en su Content.
    expect(document.querySelector('[data-mn-sheet]')).not.toBeNull();
    expect(document.querySelector('[data-mn-dialog]')).toBeNull();
  });

  it('en desktop (matchMedia true) monta el contenedor Dialog con data-mn-dialog', () => {
    installMatchMedia({ '(min-width: 768px)': true });
    render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="camera"
        />,
      ),
    );
    expect(document.querySelector('[data-mn-dialog]')).not.toBeNull();
    expect(document.querySelector('[data-mn-sheet]')).toBeNull();
  });

  it('ambos paths comparten el mismo título "Ponle nombre al manual"', () => {
    installMatchMedia({ '(min-width: 768px)': true });
    const { rerender } = render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    expect(screen.getByText('Ponle nombre al manual')).toBeInTheDocument();
    installMatchMedia({ '(min-width: 768px)': false });
    rerender(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="gallery"
        />,
      ),
    );
    expect(screen.getByText('Ponle nombre al manual')).toBeInTheDocument();
  });

  it('subtitle cambia según source (mobile path)', () => {
    installMatchMedia({ '(min-width: 768px)': false });
    const { rerender } = render(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="pdf"
        />,
      ),
    );
    expect(screen.getByText(/procesarán todas las páginas/i)).toBeInTheDocument();
    rerender(
      wrap(
        <NameManualSheet
          open
          onOpenChange={() => undefined}
          files={[makeFile()]}
          source="camera"
        />,
      ),
    );
    expect(screen.getByText(/etiquetar la foto/i)).toBeInTheDocument();
  });
});
