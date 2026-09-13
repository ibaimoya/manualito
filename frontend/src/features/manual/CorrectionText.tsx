import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import type { OcrLine, OcrLineCorrection } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';

export type SearchRange = { start: number; end: number; index: number };

export function searchRanges(text: string, needle: string): SearchRange[] {
  if (!needle) return [];
  const ranges: SearchRange[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  while (true) {
    const start = lower.indexOf(needle, from);
    if (start < 0) return ranges;
    ranges.push({ start, end: start + needle.length, index: ranges.length });
    from = start + needle.length;
  }
}

function codepointOffsets(text: string): number[] {
  const offsets = [0];
  for (const codepoint of Array.from(text)) offsets.push(offsets.at(-1)! + codepoint.length);
  return offsets;
}

function correctionRange(
  correction: OcrLineCorrection,
  offsets: readonly number[],
  textLength: number,
) {
  const start = offsets[Math.max(0, correction.start)] ?? textLength;
  const end = offsets[Math.max(correction.start, correction.end)] ?? textLength;
  return { ...correction, start, end };
}

export function CorrectionText({
  line,
  lineStart,
  search,
  activeIndex,
  correctionLabel,
}: Readonly<{
  line: OcrLine;
  lineStart: number;
  search: readonly SearchRange[];
  activeIndex: number | null;
  correctionLabel: (correction: OcrLineCorrection) => string;
}>): ReactNode {
  const text = line.text;
  const offsets = codepointOffsets(text);
  const corrections = (line.corrections ?? [])
    .filter(
      (correction) => correction.source === 'consenso-llm' && correction.start < correction.end,
    )
    .map((correction) => correctionRange(correction, offsets, text.length))
    .filter((correction) => correction.end > correction.start)
    .sort((a, b) => a.start - b.start);
  const localSearch = search
    .map((match) => ({
      ...match,
      globalStart: match.start,
      start: Math.max(0, match.start - lineStart),
      end: Math.min(text.length, match.end - lineStart),
    }))
    .filter((match) => match.start < match.end);
  const boundaries = new Set<number>([0, text.length]);
  for (const correction of corrections) {
    boundaries.add(correction.start);
    boundaries.add(correction.end);
  }
  for (const match of localSearch) {
    boundaries.add(match.start);
    boundaries.add(match.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const groups: Array<{ correction: OcrLineCorrection | null; nodes: ReactNode[] }> = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    const correction = corrections.find((item) => start >= item.start && end <= item.end) ?? null;
    const matches = localSearch.filter((match) => start >= match.start && end <= match.end);
    let node: ReactNode = text.slice(start, end);
    if (matches.length > 0) {
      const match = matches[0]!;
      const active = match.index === activeIndex;
      const anchor =
        match.index === activeIndex && match.globalStart >= lineStart && start === match.start;
      node = (
        <mark
          key={`search-${lineStart + start}`}
          data-active-match={anchor || undefined}
          className={cn(
            'rounded-[3px]',
            active ? 'bg-primary text-fg-inv' : 'bg-primary-100 text-primary-700',
          )}
        >
          {node}
        </mark>
      );
    }
    const previous = groups.at(-1);
    if (previous?.correction === correction) previous.nodes.push(node);
    else groups.push({ correction, nodes: [node] });
  }
  return groups.map((group, index) => {
    if (!group.correction) return <span key={`plain-${index}`}>{group.nodes}</span>;
    const label = correctionLabel(group.correction);
    return (
      <Tooltip key={`correction-${index}`} content={label} touch>
        <span
          // El foco permite consultar la corrección sin impedir seleccionar el texto.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          className="underline decoration-dotted decoration-1 underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {group.nodes}
        </span>
      </Tooltip>
    );
  });
}
