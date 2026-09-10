import type { AnyRouter, NavigateOptions } from '@tanstack/react-router';
import { readMediaSnapshot } from '@/shared/hooks/useMediaQuery';
import './entry-transition.css';

const ENTRY_PATHS = ['/onboarding', '/login', '/register', '/forgot'];

export const entryViewTransition = {
  types: ({ fromLocation, toLocation, pathChanged }) => {
    const fromEntry = ENTRY_PATHS.includes(fromLocation?.pathname ?? '');
    const toEntry = ENTRY_PATHS.includes(toLocation.pathname);
    if (
      !pathChanged ||
      !fromEntry ||
      !toEntry ||
      readMediaSnapshot('(prefers-reduced-motion: reduce)')
    ) {
      return false;
    }
    return ['entry'];
  },
} satisfies Exclude<NavigateOptions<AnyRouter>['viewTransition'], boolean | undefined>;
