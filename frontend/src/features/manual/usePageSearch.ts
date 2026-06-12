import { useDeferredValue, useMemo, useState } from 'react';
import type { ManualDetailPage } from '@/shared/api/client';

/**
 * Búsqueda client-side sobre el texto de las páginas: hits por página y un
 * cursor global para saltar de coincidencia en coincidencia (prev/next).
 */

interface PageMatch {
  pageNumber: number;
  /** Índice de la coincidencia dentro de su página (para resaltado activo). */
  indexInPage: number;
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  const haystack = text.toLowerCase();
  while (true) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

export function usePageSearch(pages: readonly ManualDetailPage[]) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  // El barrido se recalcula con el valor diferido, sin bloquear el input.
  const deferredQuery = useDeferredValue(query);
  const needle = deferredQuery.trim().toLowerCase();

  const { hitsByPage, matches } = useMemo(() => {
    const hits = new Map<number, number>();
    const all: PageMatch[] = [];
    if (needle.length === 0) return { hitsByPage: hits, matches: all };
    for (const page of pages) {
      const text = page.ocr_lines.map((line) => line.text).join('\n');
      const count = countOccurrences(text, needle);
      hits.set(page.page_number, count);
      for (let index = 0; index < count; index += 1) {
        all.push({ pageNumber: page.page_number, indexInPage: index });
      }
    }
    return { hitsByPage: hits, matches: all };
  }, [pages, needle]);

  const active = matches.length > 0 ? matches[cursor % matches.length]! : null;

  function search(next: string): void {
    setQuery(next);
    setCursor(0);
  }

  function step(delta: 1 | -1): PageMatch | null {
    if (matches.length === 0) return null;
    const next = (cursor + delta + matches.length) % matches.length;
    setCursor(next);
    return matches[next]!;
  }

  return {
    query,
    needle,
    search,
    hitsByPage,
    totalHits: matches.length,
    pagesWithHits: hitsByPage.size === 0 ? 0 : [...hitsByPage.values()].filter((n) => n > 0).length,
    active,
    step,
  };
}
