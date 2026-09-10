import { BookOpen, RefreshCw } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import recoveryStyles from './recovery.module.css';
import styles from './recovery-notice.module.css';

type RecoveryNoticeProps = Readonly<{
  title: string;
  description: string;
  onRetry: () => void;
  retrying: boolean;
}>;

export function RecoveryNotice({ title, description, onRetry, retrying }: RecoveryNoticeProps) {
  const { t } = useTranslation('shell');
  const titleId = useId();

  return (
    <section className={styles.notice} aria-labelledby={titleId}>
      <BookOpen className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p className={styles.description}>{description}</p>
      <Button className={recoveryStyles.primary} loading={retrying} onClick={onRetry}>
        <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
        {t('recovery.retry')}
      </Button>
    </section>
  );
}
