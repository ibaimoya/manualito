import type { ReactNode } from 'react';
import styles from './viewer-control-motion.module.css';

export type ViewerControlKind =
  'zoom-in' | 'zoom-out' | 'fit-page' | 'fit-width' | 'actual-size' | 'expand';

// Geometría de Lucide separada en las piezas que explican cada acción.
const glyphs: Record<Exclude<ViewerControlKind, 'actual-size'>, ReactNode> = {
  'zoom-in': <path data-motion-part="zoom-in" d="M12 5v14M5 12h14" />,
  'zoom-out': <path data-motion-part="zoom-out" d="M5 12h14" />,
  'fit-page': (
    <>
      <path data-motion-part="corner-nw" d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path data-motion-part="corner-ne" d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path data-motion-part="corner-se" d="M21 16v3a2 2 0 0 1-2 2h-3" />
      <path data-motion-part="corner-sw" d="M8 21H5a2 2 0 0 1-2-2v-3" />
    </>
  ),
  'fit-width': (
    <>
      <path data-motion-part="width-line" d="M3 12h18" />
      <path data-motion-part="width-left" d="m8 7-5 5 5 5" />
      <path data-motion-part="width-right" d="m16 7 5 5-5 5" />
    </>
  ),
  expand: (
    <>
      <path data-motion-part="expand-ne" d="M15 3h6v6m0-6-7 7" />
      <path data-motion-part="expand-sw" d="M9 21H3v-6m0 6 7-7" />
    </>
  ),
};

export function ViewerControlGlyph({ kind }: Readonly<{ kind: ViewerControlKind }>) {
  if (kind === 'actual-size') {
    return (
      <span aria-hidden="true" className={styles.ratio}>
        <span data-motion-part="ratio-digit">1</span>
        <span>:</span>
        <span data-motion-part="ratio-digit">1</span>
      </span>
    );
  }

  return (
    <svg
      className={`action-icon ${styles.glyph}`}
      width={kind === 'fit-width' ? 17 : 16}
      height={kind === 'fit-width' ? 17 : 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[kind]}
    </svg>
  );
}
