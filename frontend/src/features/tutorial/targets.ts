import type { TourTarget } from './types';

export const TOUR_ATTRIBUTE = 'data-tour';

type TourTargetProps = Readonly<{ 'data-tour': TourTarget }>;

export function tourTarget(target: TourTarget): TourTargetProps {
  return { 'data-tour': target };
}

// En diseños adaptables puede haber dos controles. Solo se señala el visible.
export function findTourTarget(target: TourTarget): HTMLElement | undefined {
  const candidates = document.querySelectorAll<HTMLElement>(`[${TOUR_ATTRIBUTE}="${target}"]`);
  for (const candidate of candidates) {
    if (isRevealed(candidate)) return candidate;
  }
  return undefined;
}

function isRevealed(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  return element.checkVisibility({ visibilityProperty: true });
}
