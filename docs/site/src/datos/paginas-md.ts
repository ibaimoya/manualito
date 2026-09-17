import type { CollectionEntry } from 'astro:content';

/* Única fuente de qué páginas tienen versión .md, la comparten el endpoint y el botón de copiar. */
export function tieneVersionMd(entrada: CollectionEntry<'docs'>): boolean {
  if (entrada.id === '' || entrada.id === 'index' || entrada.id === '404') return false;
  // La bibliografía se genera desde el bib y su markdown crudo no aporta nada.
  if (entrada.id === 'anexos/bibliografia') return false;
  return import.meta.env.DEV || !entrada.data.draft;
}
