import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useRef } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { Dialog } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { PrivacySections } from '@/features/legal/PrivacySections';
import { Wordmark } from '@/shared/components/Brand';
import styles from './privacy.module.css';

export function PrivacyPolicyModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation('legal');
  const { t: common } = useTranslation();
  const title = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      contentClassName={styles.document}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        title.current?.focus({ preventScroll: true });
      }}
    >
      <header className={styles.header}>
        <div>
          <Wordmark size={18} className={styles.signature} />
          <DialogPrimitive.Title ref={title} tabIndex={-1} className={styles.title}>
            {t('modal.title')}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className={styles.description}>
            {t('modal.description')}
          </DialogPrimitive.Description>
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={common('actions.close')}
          onClick={() => onOpenChange(false)}
        >
          <XIcon size={20} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.body}>
        <PrivacySections className={styles.spread} headingLevel={3} />
      </div>
    </Dialog>
  );
}
