import { toast } from 'sonner';
import { apiErrorNotification, type ApiErrorNotification } from '@/shared/api/http';

/** Toast de error con el copy del mapper de la API (o el fallback dado). */
export function toastApiError(
  error: unknown,
  idPrefix: string,
  fallback: ApiErrorNotification,
): void {
  const notification = apiErrorNotification(error, idPrefix, fallback);
  toast.error(notification.title, {
    id: notification.id,
    description: notification.description,
  });
}
