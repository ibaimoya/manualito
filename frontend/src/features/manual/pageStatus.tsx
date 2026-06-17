import { AlertTriangle, Check, Copy, LoaderCircle, Pencil, X, type LucideIcon } from 'lucide-react';
import type { ManualDetailPage } from '@/shared/api/client';

/** Estado de lectura de una página (fuente única para rail, chip y cajón). */
export type PageStatusKey = 'ok' | 'low' | 'edited' | 'duplicate' | 'processing' | 'failed';
export type PageStatusTone = 'success' | 'warning' | 'accent' | 'error';

export interface PageStatusMeta {
  key: PageStatusKey;
  /** Texto largo del chip. */
  label: string;
  /** Texto corto de la leyenda y miniaturas. */
  short: string;
  Icon: LucideIcon;
  /** Mapea 1:1 con los tonos de <Badge>. */
  tone: PageStatusTone;
  tip: string;
}

const META: Record<PageStatusKey, PageStatusMeta> = {
  ok: {
    key: 'ok',
    label: 'Escaneado correctamente',
    short: 'OK',
    Icon: Check,
    tone: 'success',
    tip: 'El OCR reconoció el texto de esta página con buena calidad.',
  },
  low: {
    key: 'low',
    label: 'Poco clara',
    short: 'Poco clara',
    Icon: AlertTriangle,
    tone: 'warning',
    tip: 'El OCR no está seguro de esta página. Puedes releerla o corregirla a mano.',
  },
  edited: {
    key: 'edited',
    label: 'Editada a mano',
    short: 'Editada',
    Icon: Pencil,
    tone: 'accent',
    tip: 'Corregiste el texto de esta página a mano.',
  },
  duplicate: {
    key: 'duplicate',
    label: 'Duplicada',
    short: 'Duplicada',
    Icon: Copy,
    tone: 'warning',
    tip: 'Esta página es idéntica a otra que ya habías subido. No se vuelve a leer porque no aporta nada nuevo, así que esta copia no cuenta para la explicación.',
  },
  processing: {
    key: 'processing',
    label: 'Procesando',
    short: 'Pendiente',
    Icon: LoaderCircle,
    tone: 'accent',
    tip: 'Esta página sigue en la cola de lectura.',
  },
  failed: {
    key: 'failed',
    label: 'Error de lectura',
    short: 'Error',
    Icon: X,
    tone: 'error',
    tip: 'No pudimos extraer texto de esta página. Reintenta o sube otra foto.',
  },
};

export function pageStatus(page: ManualDetailPage): PageStatusMeta {
  if (page.ocr_status === 'pending' || page.ocr_status === 'processing') return META.processing;
  if (page.ocr_status === 'failed') return META.failed;
  // Reutilizada de otra página idéntica: prima sobre la calidad del texto copiado,
  // porque lo relevante es que esta copia no se procesa ni cuenta para la explicación.
  if (page.dedup_status === 'reused') return META.duplicate;
  if (page.text_source === 'user_edit') return META.edited;
  if (page.text_quality === 'low_confidence') return META.low;
  return META.ok;
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

export const PAGE_STATUS_LEGEND: readonly PageStatusMeta[] = [
  META.ok,
  META.low,
  META.edited,
  META.duplicate,
  META.processing,
  META.failed,
];

// ── Confianza OCR por línea ──────────────────────────────────────────────
export type ConfidenceTone = 'success' | 'warning' | 'error';

/** Confianza OCR de una línea (0–1) → etiqueta + tono semántico por umbral. */
export function confidenceTone(confidence: number): { label: string; tone: ConfidenceTone } {
  if (confidence >= 0.9) return { label: 'Alta', tone: 'success' };
  if (confidence >= 0.75) return { label: 'Media', tone: 'warning' };
  return { label: 'Baja', tone: 'error' };
}

export const CONFIDENCE_LEGEND: ReadonlyArray<{
  label: string;
  tone: ConfidenceTone;
  range: string;
}> = [
  { label: 'Alta', tone: 'success', range: '≥ 90 %' },
  { label: 'Media', tone: 'warning', range: '75–89 %' },
  { label: 'Baja', tone: 'error', range: '< 75 %' },
];

/** Fondo suave + color del borde-acento izquierdo de la fila de confianza. */
export const CONFIDENCE_ROW_CLASS: Record<ConfidenceTone, string> = {
  success: 'border-l-success bg-success-bg',
  warning: 'border-l-warning bg-warning-bg',
  error: 'border-l-error bg-error-bg',
};
