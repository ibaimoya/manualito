import { UserIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';

export function useUploadedByText(authorName: string | null): string {
  const { t } = useTranslation();
  return t('attribution.uploadedBy', { name: authorName ?? t('attribution.anonymous') });
}

/** Identifica a quien subió el archivo, que puede ser distinto del autor del juego. */
export function UploadedBy({
  authorName,
  id,
  className,
}: Readonly<{ authorName: string | null; id?: string; className?: string }>) {
  const text = useUploadedByText(authorName);
  return (
    <span
      id={id}
      title={text}
      className={cn(
        'block min-w-0 truncate text-[11px] font-normal leading-4 text-fg-3',
        className,
      )}
    >
      {text}
    </span>
  );
}

/** La etiqueta accesible de la fuente describe este avatar decorativo. */
export function UploaderAvatar({
  authorName,
  muted = false,
  className,
}: Readonly<{ authorName: string | null; muted?: boolean; className?: string }>) {
  const initial = authorName?.trim().charAt(0).toUpperCase() ?? '';
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold leading-none ring-2 ring-card',
        initial ? 'bg-primary-100 text-primary-700' : 'bg-surface-2 text-fg-3',
        muted && 'opacity-60',
        className,
      )}
    >
      {initial || <UserIcon size={16} weight="bold" />}
    </span>
  );
}
