import type { ReactNode } from 'react';
import styles from './viewer-control-motion.module.css';

export type ViewerControlKind =
  'zoom-in' | 'zoom-out' | 'fit-page' | 'fit-width' | 'actual-size' | 'expand';

// Geometría regular de Phosphor (Plus, Minus, CornersOut, ArrowsHorizontal y
// ArrowsOutSimple) separada en las piezas que explican cada acción.
const glyphs: Record<Exclude<ViewerControlKind, 'actual-size'>, ReactNode> = {
  'zoom-in': (
    <path
      data-motion-part="zoom-in"
      d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"
    />
  ),
  'zoom-out': (
    <path
      data-motion-part="zoom-out"
      d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128Z"
    />
  ),
  'fit-page': (
    <>
      <path
        data-motion-part="corner-nw"
        d="M88,40H48a8,8,0,0,0-8,8V88a8,8,0,0,0,16,0V56H88a8,8,0,0,0,0-16Z"
      />
      <path
        data-motion-part="corner-ne"
        d="M216,48V88a8,8,0,0,1-16,0V56H168a8,8,0,0,1,0-16h40A8,8,0,0,1,216,48Z"
      />
      <path
        data-motion-part="corner-se"
        d="M208,160a8,8,0,0,0-8,8v32H168a8,8,0,0,0,0,16h40a8,8,0,0,0,8-8V168A8,8,0,0,0,208,160Z"
      />
      <path
        data-motion-part="corner-sw"
        d="M88,200H56V168a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H88a8,8,0,0,0,0-16Z"
      />
    </>
  ),
  'fit-width': (
    <>
      <path data-motion-part="width-line" d="M43.31,120H212.69v16H43.31Z" />
      <path
        data-motion-part="width-left"
        d="M50.34,90.34a8,8,0,0,1,11.32,11.32L43.31,120l-8,8,8,8,18.35,18.34a8,8,0,0,1-11.32,11.32l-32-32a8,8,0,0,1,0-11.32Z"
      />
      <path
        data-motion-part="width-right"
        d="M205.66,90.34l32,32a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32-11.32L212.69,136l8-8-8-8-18.35-18.34a8,8,0,0,1,11.32-11.32Z"
      />
    </>
  ),
  expand: (
    <>
      <path
        data-motion-part="expand-ne"
        d="M216,48V96a8,8,0,0,1-16,0V67.31l-50.34,50.35a8,8,0,0,1-11.32-11.32L188.69,56H160a8,8,0,0,1,0-16h48A8,8,0,0,1,216,48Z"
      />
      <path
        data-motion-part="expand-sw"
        d="M106.34,138.34,56,188.69V160a8,8,0,0,0-16,0v48a8,8,0,0,0,8,8H96a8,8,0,0,0,0-16H67.31l50.35-50.34a8,8,0,0,0-11.32-11.32Z"
      />
    </>
  ),
};

const SIZES: Record<Exclude<ViewerControlKind, 'actual-size'>, number> = {
  'zoom-in': 16,
  'zoom-out': 16,
  'fit-page': 20,
  'fit-width': 17,
  expand: 20,
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
      width={SIZES[kind]}
      height={SIZES[kind]}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[kind]}
    </svg>
  );
}
