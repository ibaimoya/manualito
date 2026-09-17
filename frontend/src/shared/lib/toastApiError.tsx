import type { ReactNode } from 'react';
import { Translation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http';

export function toastApiError(
  error: unknown,
  idPrefix: string,
  fallback: { title: ReactNode; id: string; description: ReactNode },
): void {
  if (error instanceof ApiError) {
    toast.error(<Translation ns="errors">{() => error.view.title}</Translation>, {
      id: `${idPrefix}-${error.view.code}`,
      description: <Translation ns="errors">{() => error.view.message}</Translation>,
    });
    return;
  }
  toast.error(fallback.title, { id: fallback.id, description: fallback.description });
}
