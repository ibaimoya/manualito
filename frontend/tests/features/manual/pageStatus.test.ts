import { describe, expect, it } from 'vitest';
import { HourglassIcon, CircleNotchIcon } from '@phosphor-icons/react';
import { pageStatus, pageStatusLegend } from '@/features/manual/pageStatus';
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
  ocr_lines: [{ text: 'Reparte cinco cartas.', confidence: 0.97 }],
};

describe('información del estado de página', () => {
  it('distingue una página pendiente del procesamiento activo sin alterar su prioridad', () => {
    const queued = pageStatus({ ...page, ocr_status: 'pending', dedup_status: 'reused' });
    const running = pageStatus({ ...page, ocr_status: 'processing', dedup_status: 'reused' });

    expect(queued.key).toBe('processing');
    expect(queued.Icon).toBe(HourglassIcon);
    expect(running.key).toBe('processing');
    expect(running.Icon).toBe(CircleNotchIcon);
    expect(pageStatusLegend().find((status) => status.key === 'processing')?.Icon).toBe(
      HourglassIcon,
    );
  });

  it('describe el texto de un PDF sin atribuirlo a un OCR ni garantizar su calidad', () => {
    const status = pageStatus({
      ...page,
      text_source: 'pdf_text',
      text_quality: null,
      ocr_confidence_mean: null,
      ocr_lines: [{ text: 'Reparte cinco cartas.', confidence: null }],
    });

    expect(status.key).toBe('ok');
    expect(status.label).toBe('Texto disponible');
    expect(status.tip).not.toMatch(/OCR|calidad|correctamente/);
  });

  it.each([{ ocr_lines: [] }, { ocr_lines: [{ text: '  \n  ', confidence: null }] }])(
    'no presenta como disponible un resultado sin texto',
    ({ ocr_lines }) => {
      const status = pageStatus({ ...page, text_quality: 'empty', ocr_lines });

      expect(status.label).toBe('Sin texto disponible');
      expect(status.tone).toBe('neutral');
    },
  );

  it.each([
    ['processing', { ocr_status: 'processing' }],
    ['failed', { ocr_status: 'failed' }],
    ['duplicate', { dedup_status: 'reused' }],
    ['edited', { text_source: 'user_edit' }],
    ['low', { text_quality: 'low_confidence' }],
  ] as const)('conserva el estado %s aunque el texto esté vacío', (key, changes) => {
    expect(pageStatus({ ...page, ...changes, ocr_lines: [] }).key).toBe(key);
  });
});
