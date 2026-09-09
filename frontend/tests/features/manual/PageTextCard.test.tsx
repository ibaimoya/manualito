import { fireEvent, isInaccessible, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PageTextCard } from '@/features/manual/PageTextCard';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  onDirtyChange: () => undefined,
};

describe('PageTextCard', () => {
  it('conserva el scroll, los párrafos OCR y la coincidencia activa al alternar confianza', () => {
    const { rerender } = render(<PageTextCard {...props} showConfidence={false} />, {
      wrapper: TooltipProvider,
    });
    const article = screen.getByRole('article', { name: 'Página 1 de 1' });
    const scroller = article.firstElementChild!;
    const paragraphs = within(article).getAllByRole('paragraph');
    const activeMark = article.querySelector('mark[data-active-match]');
    scroller.scrollTop = 120;

    expect(paragraphs.map((paragraph) => paragraph.textContent)).toEqual([
      'Coloca el tablero.\n\nReparte las cartas.',
      'El tablero tiene casillas.',
    ]);
    expect(activeMark?.closest('p')).toBe(paragraphs[1]);

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
      expect(screen.getByLabelText(/97 por ciento/).parentElement?.hasAttribute('inert')).toBe(
        !showConfidence,
      );
      expect(isInaccessible(screen.getByLabelText('Confianza OCR: sin dato'))).toBe(
        !showConfidence,
      );
    }
  });

  it('conserva el punto de lectura al entrar y salir de edición', () => {
    const { rerender } = render(<PageTextCard {...props} showConfidence={false} />, {
      wrapper: TooltipProvider,
    });
    const scroller = screen.getByRole('article').firstElementChild!;
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);

    rerender(<PageTextCard {...props} showConfidence={false} editing />);
    const editor = screen.getByRole('textbox');
    expect(editor).toHaveFocus();
    expect(editor.scrollTop).toBe(120);
    expect(editor).toHaveValue(page.ocr_lines.map((line) => line.text).join('\n'));

    editor.scrollTop = 180;
    fireEvent.scroll(editor);
    rerender(<PageTextCard {...props} showConfidence={false} />);
    expect(screen.getByRole('article').firstElementChild!.scrollTop).toBe(180);
  });

  it('acompaña cada tramo coloreado con su porcentaje y una explicación accesible', async () => {
    const user = userEvent.setup();
    const lines = [
      {
        text: 'Reparte cinco cartas.',
        confidence: 0.96,
        label: 'Alta, 96 por ciento',
        value: '96%',
      },
      { text: 'Roba una carta.', confidence: 0.8, label: 'Media, 80 por ciento', value: '80%' },
      { text: 'Pasa el turno.', confidence: 0.62, label: 'Baja, 62 por ciento', value: '62%' },
    ];
    render(
      <PageTextCard {...props} needle="" page={{ ...page, ocr_lines: lines }} showConfidence />,
      { wrapper: TooltipProvider },
    );

    await user.tab();
    for (const line of lines) {
      const paragraph = screen.getByText(line.text).closest('p')!;
      const help = within(paragraph.parentElement!).getByRole('button', {
        name: `Confianza OCR de esta línea: ${line.label}`,
      });
      expect(help).toHaveTextContent(line.value);
      await user.tab();
      expect(help).toHaveFocus();
      await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent(line.label));
    }
  });

  it('guarda únicamente cambios válidos y comunica si el borrador está sucio', async () => {
    const user = userEvent.setup();
    const saves: string[] = [];
    const dirtyStates: boolean[] = [];
    render(
      <PageTextCard
        {...props}
        showConfidence={false}
        editing
        onSave={(text) => saves.push(text)}
        onDirtyChange={(dirty) => dirtyStates.push(dirty)}
      />,
      { wrapper: TooltipProvider },
    );
    const editor = screen.getByRole('textbox');
    const save = screen.getByRole('button', { name: 'Guardar' });

    expect(save).toBeDisabled();
    expect(dirtyStates).toEqual([]);
    await user.keyboard('{Control>}s{/Control}');
    expect(saves).toEqual([]);

    fireEvent.change(editor, { target: { value: '  \n ' } });
    expect(save).toBeDisabled();
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(dirtyStates.at(-1)).toBe(true);

    fireEvent.change(editor, { target: { value: 'a'.repeat(20_001) } });
    expect(save).toBeDisabled();
    expect(editor).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(editor, { target: { value: 'Coloca dos fichas.' } });
    expect(save).toBeEnabled();
    expect(editor).toHaveAttribute('aria-invalid', 'false');
    await user.keyboard('{Control>}s{/Control}');
    expect(saves).toEqual(['Coloca dos fichas.']);

    fireEvent.change(editor, {
      target: { value: page.ocr_lines.map((line) => line.text).join('\n') },
    });
    expect(save).toBeDisabled();
    expect(dirtyStates.at(-1)).toBe(false);
    expect(editor.closest('form')?.querySelector('[aria-live]')).toBeNull();
  });

  it('mantiene el borrador hasta que el padre confirma cancelar y bloquea acciones durante guardado', async () => {
    const user = userEvent.setup();
    let cancelRequests = 0;
    const onCancelEdit = () => {
      cancelRequests += 1;
    };
    const { rerender } = render(
      <PageTextCard {...props} showConfidence={false} editing onCancelEdit={onCancelEdit} />,
      { wrapper: TooltipProvider },
    );
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'Mi corrección' } });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancelRequests).toBe(1);
    expect(editor).toHaveValue('Mi corrección');

    rerender(
      <PageTextCard {...props} showConfidence={false} editing saving onCancelEdit={onCancelEdit} />,
    );
    expect(editor).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    expect(editor).toHaveValue('Mi corrección');
  });

  it('no anuncia porcentajes ni leyenda cuando la página carece de confianza OCR', () => {
    const noConfidence = {
      ...page,
      ocr_confidence_mean: null,
      ocr_lines: page.ocr_lines.map((line) => ({ ...line, confidence: null })),
    };
    render(<PageTextCard {...props} page={noConfidence} showConfidence />, {
      wrapper: TooltipProvider,
    });

    expect(screen.getByRole('article')).toHaveTextContent('Reparte las cartas.');
    expect(
      screen.queryAllByLabelText(/Confianza OCR/).filter((chip) => !isInaccessible(chip)),
    ).toHaveLength(0);
    const legend = screen.queryByText('Confianza OCR');
    expect(legend === null || isInaccessible(legend)).toBe(true);
  });
});
