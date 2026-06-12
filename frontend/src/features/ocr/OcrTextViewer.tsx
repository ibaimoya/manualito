import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/shared/lib/cn';
import { useDebouncedCallback } from '@/shared/hooks/useDebouncedCallback';
import type { OcrLine } from '@/shared/lib/storage';

/** Visor del texto extraído por OCR o desde PDF (vive dentro de OcrTextSheet). */

type OcrTextView = 'plain' | 'lines';

export interface OcrTextViewerProps {
  lines: OcrLine[];
  onClose?: () => void;
}

function confidenceTone(c: number | null): 'neutral' | 'success' | 'warning' | 'error' {
  if (c === null) return 'neutral';
  if (c >= 0.85) return 'success';
  if (c >= 0.5) return 'warning';
  return 'error';
}

function stableLineKey(line: OcrLine): string {
  let hash = Math.round((line.confidence ?? 0) * 1000);
  for (const char of line.text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash.toString(36);
}

export function OcrTextViewer({ lines, onClose }: Readonly<OcrTextViewerProps>) {
  const [view, setView] = useState<OcrTextView>('plain');
  const [copied, setCopied] = useState(false);
  // Mantiene visible el feedback de copia durante un instante.
  const resetCopiedSoon = useDebouncedCallback(() => setCopied(false), 1500);

  const plainText = useMemo(
    () => lines.map((l) => l.text).join('\n'),
    [lines],
  );
  const nonBlankCount = useMemo(
    () => lines.filter((l) => l.text.trim().length > 0).length,
    [lines],
  );

  async function handleCopyAll(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(plainText);
    } catch {
      // Sin clipboard (contexto no seguro): el feedback visual basta.
    }
    setCopied(true);
    resetCopiedSoon();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      {/* Franja superior sticky: tabs + contador */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg px-4 py-3">
        <SegmentedControl<OcrTextView>
          value={view}
          onChange={setView}
          ariaLabel="Vista del texto extraído"
          options={[
            { value: 'plain', label: 'Texto plano' },
            { value: 'lines', label: 'Por líneas' },
          ]}
        />
        <div className="flex-1" />
        <span
          className="mono whitespace-nowrap text-[11px] tracking-[0.04em] text-fg-3"
          aria-live="polite"
        >
          {nonBlankCount} {nonBlankCount === 1 ? 'línea' : 'líneas'}
        </span>
      </div>

      {/* key={view}: cambiar de vista remonta y re-dispara el fade-in. */}
      <div
        key={view}
        className={cn('min-h-0 flex-1 overflow-auto', `ocr-body--${view}`)}
      >
        {view === 'plain' ? (
          <PlainView text={plainText} />
        ) : (
          <LinesView lines={lines} />
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="flex shrink-0 gap-2 border-t border-border bg-bg p-3">
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => {
            handleCopyAll().catch(() => undefined);
          }}
          className="flex-1"
        >
          {copied ? <Check size={18} strokeWidth={2} /> : <Copy size={18} strokeWidth={2} />}
          {copied ? '¡Copiado!' : 'Copiar todo'}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

/* ─── Vistas ─────────────────────────────────────────────────────────── */

function PlainView({ text }: Readonly<{ text: string }>) {
  // pre-wrap + selección: se pueden copiar trozos sueltos.
  return (
    <pre
      className={cn(
        'm-0 select-text whitespace-pre-wrap break-words',
        'px-5 py-5 font-mono text-sm leading-relaxed text-fg',
      )}
      style={{ fontFeatureSettings: '"zero" on' }}
      data-testid="ocr-plain-view"
    >
      {text || '—'}
    </pre>
  );
}

type LineRow =
  | { kind: 'spacer'; key: string }
  | {
      kind: 'line';
      key: string;
      number: number;
      text: string;
      pct: number | null;
      tone: 'neutral' | 'success' | 'warning' | 'error';
      stagger: number;
    };

function buildRows(lines: OcrLine[]): LineRow[] {
  const seenKeys = new Map<string, number>();
  const rows: LineRow[] = [];
  // El numerador #001..#NNN salta las líneas en blanco.
  let number = 0;
  for (const line of lines) {
    const baseKey = stableLineKey(line);
    const occurrence = seenKeys.get(baseKey) ?? 0;
    seenKeys.set(baseKey, occurrence + 1);
    const key = `${baseKey}-${occurrence}`;

    if (!line.text.trim()) {
      rows.push({ kind: 'spacer', key });
      continue;
    }

    number += 1;
    rows.push({
      kind: 'line',
      key,
      number,
      text: line.text,
      pct: line.confidence === null ? null : Math.round(line.confidence * 100),
      tone: confidenceTone(line.confidence),
      stagger: Math.min(number, 16),
    });
  }
  return rows;
}

function LinesView({ lines }: Readonly<{ lines: OcrLine[] }>) {
  const rows = useMemo(() => buildRows(lines), [lines]);
  return (
    <div className="px-2 py-3" data-testid="ocr-lines-view">
      {rows.map((row) => {
        if (row.kind === 'spacer') {
          return (
            <div
              key={row.key}
              aria-hidden="true"
              className="h-2"
            />
          );
        }

        return (
          <OcrLineRow
            key={row.key}
            number={row.number}
            text={row.text}
            pct={row.pct}
            tone={row.tone}
            stagger={row.stagger}
          />
        );
      })}
    </div>
  );
}

type OcrLineRowProps = Readonly<{
  number: number;
  text: string;
  pct: number | null;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  stagger: number;
}>;

function OcrLineRow({ number, text, pct, tone, stagger }: OcrLineRowProps) {
  const [selected, setSelected] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => setSelected((v) => !v)}
      className={cn(
        'ocr-line flex w-full items-start gap-2.5 rounded-xl border-0 px-2.5 py-2 text-left',
        'min-h-[44px] cursor-pointer text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        // El override global (hover:none) neutraliza el hover en táctil.
        selected
          ? 'bg-primary-100 hover:bg-primary-100'
          : 'bg-transparent hover:bg-surface',
      )}
      style={{ ['--i' as never]: stagger }}
    >
      <span
        className="mono mt-1 w-9 shrink-0 text-[11px] tracking-[0.04em] text-fg-3"
        aria-hidden="true"
      >
        {`#${String(number).padStart(3, '0')}`}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 text-[14.5px] leading-snug',
          selected ? 'font-medium text-primary-900' : 'font-normal text-fg',
        )}
      >
        {text}
      </span>
      <Badge tone={tone} className="mt-0.5 min-w-[44px] shrink-0 justify-center">
        {pct === null ? 's/c' : `${pct}%`}
      </Badge>
    </button>
  );
}
