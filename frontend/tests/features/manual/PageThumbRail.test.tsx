import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
});
