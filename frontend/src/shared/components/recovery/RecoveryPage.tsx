import { useEffect, useRef, useState } from 'react';
import {
  CaretDownIcon,
  EnvelopeSimpleIcon,
  EnvelopeSimpleOpenIcon,
  ArrowsClockwiseIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/shared/components/Brand';
import { RecoveryContent, type RecoveryKind } from './RecoveryContent';
import styles from './recovery.module.css';

/** Sin contextos de sesión, tema o router, también funciona como último recurso. */
export function RecoveryPage({
  kind = 'error',
  onRetry,
  message,
}: Readonly<{
  kind?: RecoveryKind;
  onRetry?: () => void | Promise<void>;
  message?: string;
}>) {
  const { t } = useTranslation('shell');
  const root = useRef<HTMLDivElement>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  useEffect(() => {
    root.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, []);

  async function retry() {
    setRetrying(true);
    setRetryFailed(false);
    try {
      await onRetry?.();
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div ref={root} className={styles.root}>
      <header className={styles.header}>
        <a href="/" aria-label="Manualito" className={styles.brand}>
          <Wordmark size={25} className={styles.brandArtwork} />
        </a>
      </header>
      <main className={styles.main}>
        <RecoveryContent
          kind={kind}
          retrying={retrying}
          title={t(`recovery.${kind}.title`)}
          description={t(`recovery.${kind}.description`)}
        >
          <div className={styles.actions}>
            {onRetry && (
              <Button className={styles.primary} loading={retrying} onClick={() => void retry()}>
                <ArrowsClockwiseIcon data-icon-motion="rotate" size={18} aria-hidden="true" />
                {t('recovery.retry')}
              </Button>
            )}
            <Button
              asChild
              className={onRetry ? styles.secondary : styles.primary}
              variant={onRetry ? 'secondary' : 'primary'}
            >
              <a href="/">{t('recovery.home')}</a>
            </Button>
          </div>
          {retryFailed && (
            <p role="status" className={styles.retryNotice}>
              {t('recovery.retryFailed')}
            </p>
          )}
          {import.meta.env.DEV && message && (
            <details className={styles.details}>
              <summary>
                {t('recovery.details')}
                <CaretDownIcon data-icon-motion="down" size={16} aria-hidden="true" />
              </summary>
              <pre>{message}</pre>
            </details>
          )}
          <footer className={styles.footer}>
            <a href="mailto:support@manualito.dev">
              <span className={styles.supportIcon} aria-hidden="true">
                <EnvelopeSimpleIcon size={20} />
                <EnvelopeSimpleOpenIcon size={20} />
              </span>
              {t('recovery.support')}
            </a>
          </footer>
        </RecoveryContent>
      </main>
    </div>
  );
}
