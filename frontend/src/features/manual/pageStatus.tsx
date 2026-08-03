import type { ParseKeys } from 'i18next';
import { AlertTriangle, Check, Copy, LoaderCircle, Pencil, X, type LucideIcon } from 'lucide-react';
import i18n from '@/app/i18n';
import type { ManualDetailPage } from '@/shared/api/client';

/** Estado de lectura de una página (fuente única para rail, chip y cajón). */
export type PageStatusKey = 'ok' | 'low' | 'edited' | 'duplicate' | 'processing' | 'failed';
export type PageStatusTone = 'success' | 'warning' | 'accent' | 'error';

export interface PageStatusMeta {
  key: PageStatusKey;
  label: string;
  short: string;
  Icon: LucideIcon;
  tone: PageStatusTone;
  tip: string;
}

type ManualKey = ParseKeys<'manual'>;

type PageStatusDefinition = Omit<PageStatusMeta, 'label' | 'short' | 'tip'> & {
  label: ManualKey;
  short: ManualKey;
  tip: ManualKey;
};

const META: Record<PageStatusKey, PageStatusDefinition> = {
  duplicate: {
    key: 'duplicate',
    label: 'status.duplicate.label',
    short: 'status.duplicate.short',
    Icon: Copy,
    tone: 'warning',
    tip: 'status.duplicate.tip',
  },
  edited: {
    key: 'edited',
    label: 'status.edited.label',
    short: 'status.edited.short',
    Icon: Pencil,
    tone: 'accent',
    tip: 'status.edited.tip',
  },
  failed: {
    key: 'failed',
    label: 'status.failed.label',
    short: 'status.failed.short',
    Icon: X,
    tone: 'error',
    tip: 'status.failed.tip',
  },
  low: {
    key: 'low',
    label: 'status.low.label',
    short: 'status.low.short',
    Icon: AlertTriangle,
    tone: 'warning',
    tip: 'status.low.tip',
  },
  ok: {
    key: 'ok',
    label: 'status.ok.label',
    short: 'status.ok.short',
    Icon: Check,
    tone: 'success',
    tip: 'status.ok.tip',
  },
  processing: {
    key: 'processing',
    label: 'status.processing.label',
    short: 'status.processing.short',
    Icon: LoaderCircle,
    tone: 'accent',
    tip: 'status.processing.tip',
  },
};

function resolveStatus(definition: PageStatusDefinition): PageStatusMeta {
  return {
    ...definition,
    label: i18n.t(definition.label, { ns: 'manual' }),
    short: i18n.t(definition.short, { ns: 'manual' }),
    tip: i18n.t(definition.tip, { ns: 'manual' }),
  };
}

export function pageStatus(page: ManualDetailPage): PageStatusMeta {
  if (page.ocr_status === 'pending' || page.ocr_status === 'processing') {
    return resolveStatus(META.processing);
  }
  if (page.ocr_status === 'failed') return resolveStatus(META.failed);
  // Reutilizada de otra página idéntica: prima sobre la calidad del texto copiado,
  // porque lo relevante es que esta copia no se procesa ni cuenta para la explicación.
  if (page.dedup_status === 'reused') return resolveStatus(META.duplicate);
  if (page.text_source === 'user_edit') return resolveStatus(META.edited);
  if (page.text_quality === 'low_confidence') return resolveStatus(META.low);
  return resolveStatus(META.ok);
}

export function pageStatusLegend(): readonly PageStatusMeta[] {
  return [META.ok, META.low, META.edited, META.duplicate, META.processing, META.failed].map(
    resolveStatus,
  );
}

/** Clases fg/bg por tono, para los puntos de estado que no usan <Badge>. */
export const STATUS_TONE_CLASS: Record<PageStatusTone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  accent: 'bg-accent-100 text-accent',
  error: 'bg-error-bg text-error',
};

/** Solo color de texto, para iconos de la leyenda y la tira móvil. */
export const STATUS_FG_CLASS: Record<PageStatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent',
  error: 'text-error',
};

export type ConfidenceTone = 'success' | 'warning' | 'error';

type ConfidenceDefinition = Readonly<{
  label: ManualKey;
  tone: ConfidenceTone;
  range: ManualKey;
}>;

const CONFIDENCE_META: ReadonlyArray<ConfidenceDefinition> = [
  { label: 'confidence.labels.high', tone: 'success', range: 'confidence.ranges.high' },
  { label: 'confidence.labels.medium', tone: 'warning', range: 'confidence.ranges.medium' },
  { label: 'confidence.labels.low', tone: 'error', range: 'confidence.ranges.low' },
];

/** Confianza OCR de una línea (0–1) → etiqueta + tono semántico por umbral. */
export function confidenceTone(confidence: number): { label: string; tone: ConfidenceTone } {
  const definition =
    confidence >= 0.9
      ? CONFIDENCE_META[0]!
      : confidence >= 0.75
        ? CONFIDENCE_META[1]!
        : CONFIDENCE_META[2]!;
  return {
    label: i18n.t(definition.label, { ns: 'manual' }),
    tone: definition.tone,
  };
}

export function confidenceLegend(): ReadonlyArray<{
  label: string;
  tone: ConfidenceTone;
  range: string;
}> {
  return CONFIDENCE_META.map((definition) => ({
    label: i18n.t(definition.label, { ns: 'manual' }),
    tone: definition.tone,
    range: i18n.t(definition.range, { ns: 'manual' }),
  }));
}

/** Fondo suave + color del borde-acento izquierdo de la fila de confianza. */
export const CONFIDENCE_ROW_CLASS: Record<ConfidenceTone, string> = {
  success: 'border-l-success bg-success-bg',
  warning: 'border-l-warning bg-warning-bg',
  error: 'border-l-error bg-error-bg',
};
