import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useTextWave } from '@/shared/hooks/useTextWave';
import styles from '@/features/auth/entry.module.css';

export function WelcomeHeading() {
  const { t } = useTranslation('onboarding');
  const wave = useTextWave<HTMLSpanElement>();
  const title = t('welcome.title');

  return (
    <h1 className={styles.title} aria-label={title}>
      <span {...wave} aria-hidden="true">
        {title.split(' ').map((word, wordIndex) => (
          <Fragment key={`${word}-${wordIndex}`}>
            {wordIndex > 0 && ' '}
            <span className={styles.word}>
              {Array.from(word, (letter, letterIndex) => (
                <span key={`${letter}-${letterIndex}`} data-text-wave>
                  {letter}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </h1>
  );
}
