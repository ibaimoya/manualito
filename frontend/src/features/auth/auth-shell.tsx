import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { LanguagePill } from '@/features/language/LanguagePill';
import { PrivacyPolicyModal } from '@/features/legal/PrivacyPolicyModal';
import { WelcomeBook } from '@/features/onboarding/WelcomeBook';
import { WelcomeThemeToggle } from '@/features/onboarding/WelcomeThemeToggle';
import { Monogram, Wordmark } from '@/shared/components/Brand';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import styles from './entry.module.css';

/** La cabecera y la ilustración permanecen montadas al cambiar de pantalla. */
export function AuthShell({
  children,
  illustration,
}: Readonly<{ children: ReactNode; illustration?: ReactNode }>) {
  const { t } = useTranslation('onboarding');
  const { t: authT } = useTranslation('auth');
  const pathname = useRouterState({ select: (state) => state.matches.at(-1)?.pathname });
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const welcome = pathname === '/onboarding';
  const content = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const heading = content.current?.querySelector('h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div
      className={styles.root}
      data-welcome={welcome}
      data-custom-illustration={Boolean(illustration)}
    >
      <header className={styles.header}>
        <a href="https://manualito.dev" className={styles.brand} aria-label={t('actions.website')}>
          <div className={styles.brandArtwork} aria-hidden="true">
            <Monogram size={34} radius={10} />
            <Wordmark size={23} />
          </div>
        </a>
        <div className={styles.preferences}>
          <WelcomeThemeToggle />
          <LanguagePill className={styles.language} />
        </div>
      </header>

      <main className={styles.main}>
        <motion.div
          className={styles.illustration}
          layout={reducedMotion ? false : 'position'}
          transition={{ layout: { duration: 0.24, ease: [0.23, 1, 0.32, 1] } }}
        >
          {illustration ?? <WelcomeBook />}
        </motion.div>
        <div ref={content} className={styles.panel}>
          {!welcome && (
            <Link to="/onboarding" className={styles.back}>
              <ArrowLeftIcon data-icon-motion="back" size={18} aria-hidden="true" />
              <span>{authT('actions.backToWelcome')}</span>
            </Link>
          )}
          {children}
        </div>
      </main>

      <footer className={styles.footer}>
        <button type="button" className={styles.privacy} onClick={() => setPrivacyOpen(true)}>
          <span>{t('actions.privacy')}</span>
        </button>
      </footer>
      <PrivacyPolicyModal open={privacyOpen} onOpenChange={setPrivacyOpen} />
    </div>
  );
}
