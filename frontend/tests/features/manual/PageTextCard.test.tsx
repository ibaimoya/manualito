import { isInaccessible, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageTextCard } from '@/features/manual/PageTextCard';
import type { ManualDetailPage } from '@/shared/api/client';

const page: ManualDetailPage = {
  page_number: 1,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'ok',
  dedup_status: 'none',
  image_available: true,
  image_width: 800,
  image_height: 1200,
  ocr_confidence_mean: 0.97,
  ocr_lines: [
    { text: 'Coloca el tablero.\n\nReparte las cartas.', confidence: 0.97 },
    { text: 'El tablero tiene casillas.', confidence: null },
  ],
};

const props = {
  page,
  pageCount: 1,
  needle: 'tablero',
  activeMatch: 1,
  editing: false,
  busy: false,
  saving: false,
  reprocessing: false,
  onCancelEdit: () => undefined,
  onSave: () => undefined,
  onReprocessPage: () => undefined,
};

describe('PageTextCard', () => {
  it('conserva el scroll, los párrafos OCR y la coincidencia activa al alternar confianza', () => {
    const { rerender } = render(<PageTextCard {...props} showConfidence={false} />);
    const article = screen.getByRole('article', { name: 'Página 1 de 1' });
    const scroller = article.firstElementChild!;
    const paragraphs = within(article).getAllByRole('paragraph');
    const activeMark = article.querySelector('mark[data-active-match]');
    scroller.scrollTop = 120;

    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      'Coloca el tablero.',
      'Reparte las cartas.',
      'El tablero tiene casillas.',
    ]);
    expect(activeMark?.closest('p')).toBe(paragraphs[2]);

    for (const showConfidence of [true, false, true]) {
      rerender(<PageTextCard {...props} showConfidence={showConfidence} />);

      expect(article.firstElementChild).toBe(scroller);
      expect(scroller.scrollTop).toBe(120);
      expect(within(article).getAllByRole('paragraph')).toHaveLength(paragraphs.length);
      within(article)
        .getAllByRole('paragraph')
        .forEach((paragraph, index) => {
          expect(paragraph).toBe(paragraphs[index]);
        });
      expect(article.querySelectorAll('mark')).toHaveLength(2);
      expect(article.querySelectorAll('mark[data-active-match]')).toHaveLength(1);
      expect(article.querySelector('mark[data-active-match]')).toBe(activeMark);
      expect(isInaccessible(screen.getByLabelText(/97 por ciento/))).toBe(!showConfidence);
      expect(isInaccessible(screen.getByLabelText('Confianza OCR: sin dato'))).toBe(
        !showConfidence,
      );
    }
  });

  it('no anuncia porcentajes ni leyenda cuando la página carece de confianza OCR', () => {
    const noConfidence = {
      ...page,
      ocr_confidence_mean: null,
      ocr_lines: page.ocr_lines.map((line) => ({ ...line, confidence: null })),
    };
    render(<PageTextCard {...props} page={noConfidence} showConfidence />);

    expect(screen.getByRole('article')).toHaveTextContent('Reparte las cartas.');
    expect(
      screen.queryAllByLabelText(/Confianza OCR/).filter((chip) => !isInaccessible(chip)),
    ).toHaveLength(0);
    const legend = screen.queryByText('Confianza OCR');
    expect(legend === null || isInaccessible(legend)).toBe(true);
  });
});
