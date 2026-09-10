import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storage } from '@/shared/lib/storage';
import { WelcomeHeading } from './WelcomeHeading';
import styles from '@/features/auth/entry.module.css';

export function Onboarding() {
  const { t } = useTranslation('onboarding');
  const navigate = useNavigate();
  const latestNavigation = useRef(0);
  const [navigationError, setNavigationError] = useState(false);

  async function enter(to: '/register' | '/login') {
    const request = ++latestNavigation.current;
    setNavigationError(false);
    try {
      await navigate({ to });
      if (request === latestNavigation.current) storage.markOnboardingSeen();
    } catch {
      if (request === latestNavigation.current) setNavigationError(true);
    }
  }

  return (
    <div className={styles.content}>
      <WelcomeHeading />
      <p className={styles.description}>{t('welcome.description')}</p>
      <div className={styles.actions}>
        <Button size="lg" className={styles.primary} onClick={() => void enter('/register')}>
          <span>{t('actions.createAccount')}</span>
          <ArrowRight size={19} strokeWidth={2} aria-hidden="true" />
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className={styles.secondary}
          onClick={() => void enter('/login')}
        >
          {t('actions.signIn')}
        </Button>
      </div>
      {navigationError && (
        <p className={styles.error} role="alert">
          {t('errors.navigation')}
        </p>
      )}
    </div>
  );
}
