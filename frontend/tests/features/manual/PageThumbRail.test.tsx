import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageThumbRail } from '@/features/manual/PageThumbRail';
import type { ManualDetailPage } from '@/shared/api/client';

const page: ManualDetailPage = {
  page_number: 1,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'low_confidence',
  dedup_status: 'none',
  image_available: true,
  image_width: 800,
  image_height: 1200,
  ocr_confidence_mean: 0.6,
  ocr_lines: [{ text: 'Reparte las cartas.', confidence: 0.6 }],
};

const secondPage: ManualDetailPage = {
  ...page,
  page_number: 2,
  ocr_status: 'completed',
  text_quality: 'ok',
};

function StatefulRail() {
  const [activePage, setActivePage] = useState(1);
  return (
    <PageThumbRail
      manualId="test-manual-001"
      pages={[page, secondPage]}
      activePage={activePage}
      hitsByPage={new Map()}
      onSelect={setActivePage}
    />
  );
}

function selectionIndicators(row: HTMLElement): HTMLElement[] {
  return Array.from(row.querySelectorAll<HTMLElement>('span[aria-hidden="true"]')).filter(
    (element) => element.className.includes('bg-fg') || element.className.includes('bg-primary'),
  );
}

describe('ayuda de las miniaturas', () => {
  it('separa la ayuda del estado de la selección de página sin anidar botones', async () => {
    const selected: number[] = [];
    const user = userEvent.setup();
    render(
      <PageThumbRail
        manualId="test-manual-001"
        pages={[page]}
        activePage={1}
        hitsByPage={new Map()}
        onSelect={(pageNumber) => selected.push(pageNumber)}
      />,
      { wrapper: TooltipProvider },
    );
    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    const button = within(rail).getByRole('button', { name: 'Página 1 · Poco clara' });

    expect(within(button.parentElement!).getAllByRole('button')).toHaveLength(2);
    expect(button.querySelector('button, a, [tabindex]')).toBeNull();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Estados de las páginas' })).toHaveFocus();
    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(selected).toEqual([1]);
    await user.tab();
    const help = within(rail).getByRole('button', { name: /El OCR no está seguro/ });
    expect(help).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('El OCR no está seguro');
    await user.click(help);
    expect(selected).toEqual([1]);
    await user.keyboard('{Escape}');
    expect(help).toHaveFocus();
  });

  it('en modo lector lista las páginas sin estados OCR ni leyenda', async () => {
    const selected: number[] = [];
    const user = userEvent.setup();
    render(
      <PageThumbRail
        manualId="test-manual-001"
        pages={[page, { ...secondPage, ocr_status: 'failed', ocr_lines: [] }]}
        activePage={1}
        hitsByPage={new Map([[2, 3]])}
        reader
        onSelect={(pageNumber) => selected.push(pageNumber)}
      />,
      { wrapper: TooltipProvider },
    );

    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    expect(within(rail).getAllByRole('button')).toHaveLength(2);
    expect(within(rail).getByRole('button', { name: 'Página 1' })).toBeInTheDocument();
    const second = within(rail).getByRole('button', { name: 'Página 2, 3 coincidencias' });
    expect(
      screen.queryByRole('button', { name: 'Estados de las páginas' }),
    ).not.toBeInTheDocument();
    expect(rail.querySelector('.help-indicator')).toBeNull();
    await user.click(second);
    expect(selected).toEqual([2]);
    await user.hover(second);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('permite selecciones repetidas y activación por teclado', async () => {
    const selected: number[] = [];
    const user = userEvent.setup();
    render(
      <PageThumbRail
        manualId="test-manual-001"
        pages={[page, secondPage]}
        activePage={1}
        hitsByPage={new Map()}
        onSelect={(pageNumber) => selected.push(pageNumber)}
      />,
      { wrapper: TooltipProvider },
    );

    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    const first = within(rail).getByRole('button', { name: 'Página 1 · Poco clara' });
    const second = within(rail).getByRole('button', { name: 'Página 2 · Texto disponible' });

    await user.click(second);
    await user.click(first);
    await user.click(second);
    expect(selected).toEqual([2, 1, 2]);

    first.focus();
    expect(first).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(selected).toEqual([2, 1, 2, 1]);
  });

  it('mueve la selección real entre páginas', async () => {
    const user = userEvent.setup();
    render(<StatefulRail />, { wrapper: TooltipProvider });

    const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
    const first = within(rail).getByRole('button', { name: 'Página 1 · Poco clara' });
    const second = within(rail).getByRole('button', { name: 'Página 2 · Texto disponible' });

    expect(first).toHaveAttribute('aria-current', 'true');
    expect(second).not.toHaveAttribute('aria-current');
    await user.click(second);
    expect(first).not.toHaveAttribute('aria-current');
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(selectionIndicators(first.parentElement!)).toHaveLength(0);
    expect(selectionIndicators(second.parentElement!)).toHaveLength(2);
  });

  it('retira el movimiento del indicador si reduced motion cambia durante la selección', async () => {
    const reducedQuery = '(prefers-reduced-motion: reduce)';
    const originalMatchMedia = window.matchMedia;
    let reduced = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const media = originalMatchMedia.call(window, query);
      if (query !== reducedQuery) return media;
      return {
        ...media,
        matches: reduced,
        addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === 'function')
            listeners.add(listener as (event: MediaQueryListEvent) => void);
        },
        removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
          if (typeof listener === 'function')
            listeners.delete(listener as (event: MediaQueryListEvent) => void);
        },
      } as MediaQueryList;
    });
    try {
      const user = userEvent.setup();
      render(<StatefulRail />, { wrapper: TooltipProvider });
      const rail = screen.getByRole('navigation', { name: 'Páginas del manual' });
      const first = within(rail).getByRole('button', { name: 'Página 1 · Poco clara' });
      const second = within(rail).getByRole('button', { name: 'Página 2 · Texto disponible' });

      await user.click(second);
      reduced = true;
      act(() => {
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
      });

      expect(first).not.toHaveAttribute('aria-current');
      expect(second).toHaveAttribute('aria-current', 'true');
      const indicators = selectionIndicators(second.parentElement!);
      expect(indicators).toHaveLength(2);
      expect(indicators.every((indicator) => indicator.style.transform === '')).toBe(true);
    } finally {
      matchMedia.mockRestore();
    }
  });
});
