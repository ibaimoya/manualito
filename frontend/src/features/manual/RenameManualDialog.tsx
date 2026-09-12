import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUpdateManualDetails } from '@/features/manual/use-manuals';
import type { ManualSummary } from '@/shared/api/client';
import { useOpenSession } from '@/shared/hooks/useOpenSession';

export const MANUAL_TITLE_MAX = 255;

type FieldError = 'empty' | 'tooLong' | 'network';

/** Cada apertura conserva su borrador y queda aislada de respuestas anteriores. */
export function RenameManualDialog({
  open,
  onOpenChange,
  manual,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manual: ManualSummary;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const session = useOpenSession(open);
  return (
    <Dialog
      key={session}
      open={open}
      onOpenChange={onOpenChange}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }}
    >
      <RenameManualForm manual={manual} inputRef={inputRef} onClose={() => onOpenChange(false)} />
    </Dialog>
  );
}

function RenameManualForm({
  manual,
  inputRef,
  onClose,
}: Readonly<{
  manual: ManualSummary;
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}>) {
  const { t } = useTranslation('manual');
  const update = useUpdateManualDetails(manual.id);
  const [title, setTitle] = useState(manual.title ?? '');
  const [error, setError] = useState<FieldError | null>(null);
  const inputId = useId();
  const errorId = useId();

  const trimmed = title.trim();
  const saving = update.isPending;
  const fieldError = error === 'empty' || error === 'tooLong';

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (saving) return;
    const problem =
      trimmed.length === 0 ? 'empty' : trimmed.length > MANUAL_TITLE_MAX ? 'tooLong' : null;
    if (problem !== null) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    if (trimmed === (manual.title ?? '')) {
      onClose();
      return;
    }
    setError(null);
    update.mutate({ title: trimmed }, { onSuccess: onClose, onError: () => setError('network') });
  }

  function guardComposition(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault();
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader title={t('details.title')} description={t('details.help')} onClose={onClose} />
      <DialogBody className="flex flex-col gap-4">
        <div>
          <label htmlFor={inputId} className="mb-1.5 block px-3.5 text-sm font-semibold text-fg">
            {t('details.field')}
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            name="title"
            className="h-12 rounded-2xl"
            value={title}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            disabled={saving}
            aria-invalid={fieldError || undefined}
            aria-describedby={error ? errorId : undefined}
            onKeyDown={guardComposition}
            onChange={(event) => {
              setTitle(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? (
            <p id={errorId} role="alert" className="mt-1.5 px-3.5 text-xs text-error">
              {t(`details.errors.${error}`, { max: MANUAL_TITLE_MAX })}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('buttons.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('details.save')}
          </Button>
        </div>
      </DialogBody>
    </form>
  );
}
