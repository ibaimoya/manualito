import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { useUpdateManualDetails } from '@/features/manual/use-manuals';
import type { ManualSummary } from '@/shared/api/client';
import { useOpenSession } from '@/shared/hooks/useOpenSession';

/** Confirma si el manual debe identificar a quien lo subió. */
export function AuthorVisibilityDialog({
  open,
  onOpenChange,
  manual,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manual: ManualSummary;
}>) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const session = useOpenSession(open);
  return (
    <Dialog
      key={session}
      open={open}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancelRef.current?.focus();
      }}
    >
      <AuthorVisibilityConfirm
        manual={manual}
        cancelRef={cancelRef}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

function AuthorVisibilityConfirm({
  manual,
  cancelRef,
  onClose,
}: Readonly<{
  manual: ManualSummary;
  cancelRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}>) {
  const { t } = useTranslation('manual');
  const update = useUpdateManualDetails(manual.id);
  // Conserva la acción confirmada mientras se guarda y se cierra el diálogo.
  const [mode] = useState<'show' | 'hide'>(() => (manual.anonymous ? 'show' : 'hide'));
  const [failed, setFailed] = useState(false);
  const saving = update.isPending;

  function confirm(): void {
    if (saving) return;
    setFailed(false);
    update.mutate(
      { anonymous: mode === 'hide' },
      { onSuccess: onClose, onError: () => setFailed(true) },
    );
  }

  return (
    <>
      <DialogHeader
        title={t(`details.confirm.${mode}.title`)}
        description={t(`details.confirm.${mode}.text`)}
        onClose={onClose}
      />
      <DialogBody>
        {failed ? (
          <p role="alert" className="mb-3 text-sm text-error">
            {t('details.errors.network')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="ghost" onClick={onClose}>
            {t('buttons.cancel')}
          </Button>
          <Button type="button" loading={saving} onClick={confirm}>
            {t(`details.confirm.${mode}.action`)}
          </Button>
        </div>
      </DialogBody>
    </>
  );
}
