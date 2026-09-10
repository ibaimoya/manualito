import { Link } from '@tanstack/react-router';
import { type UseQueryResult } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError, type ManualDetailResponse } from '@/shared/api/client';
import { RecoveryContent } from '@/shared/components/recovery/RecoveryContent';
import { Button } from '@/components/ui/button';
import styles from '@/shared/components/recovery/recovery.module.css';

export function ManualRecovery({
  query,
}: Readonly<{ query: UseQueryResult<ManualDetailResponse> }>) {
  const { t } = useTranslation('manual');
  const { t: commonT } = useTranslation();
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const empty = query.data !== undefined;
  const state = missing ? 'missing' : empty ? 'empty' : 'load';

  return (
    <div className="grid min-h-full items-center overflow-y-auto px-6 py-8">
      <RecoveryContent
        kind={missing ? 'not-found' : 'error'}
        retrying={query.isFetching}
        title={t(`errors.${state}.title`)}
        description={t(`errors.${state}.description`)}
      >
        <div className={styles.actions}>
          {!missing && (
            <Button
              className={styles.primary}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RotateCw size={18} aria-hidden="true" />
              {commonT('actions.retry')}
            </Button>
          )}
          <Button
            asChild
            variant={missing ? 'primary' : 'secondary'}
            className={missing ? styles.primary : styles.secondary}
          >
            <Link to="/history">{t('errors.load.historyLink')}</Link>
          </Button>
        </div>
      </RecoveryContent>
    </div>
  );
}
