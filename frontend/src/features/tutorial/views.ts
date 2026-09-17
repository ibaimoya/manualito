import { useLayoutEffect } from 'react';
import type { TourId, TourTarget, TutorialView } from './types';

type ViewState = Readonly<{
  value: TutorialView;
  select: (value: TutorialView) => void;
  ready: boolean;
  targets: Partial<Record<TutorialView, readonly TourTarget[]>>;
}>;

const screens = new Map<TourId, ViewState>();

export function tutorialViews(id: TourId): ViewState | undefined {
  return screens.get(id);
}

// El recorrido cambia la vista con el mismo estado que sus controles y la devuelve al cerrar.
export function useTutorialViews<T extends TutorialView>(
  id: TourId,
  value: T,
  select: (value: T) => void,
  targets: Partial<Record<T, readonly TourTarget[]>>,
  ready = true,
): void {
  useLayoutEffect(() => {
    const state: ViewState = {
      value,
      select: (next) => select(next as T),
      targets,
      ready,
    };
    screens.set(id, state);
    return () => {
      if (screens.get(id) === state) screens.delete(id);
    };
  }, [id, value, select, targets, ready]);
}
