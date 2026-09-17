import { GlobeSimpleIcon } from '@phosphor-icons/react';
import { LANGUAGE_NAMES, useLanguage, type Language } from '@/app/language';
import { cn } from '@/shared/lib/cn';
import styles from './language-pill.module.css';

/* El aria va en el idioma destino para quien no entiende el actual */
const SWITCH_LABELS: Record<Language, string> = {
  es: 'Cambiar el idioma a español',
  en: 'Switch language to English',
};

const OTHER_LANGUAGE: Record<Language, Language> = {
  es: 'en',
  en: 'es',
};

export function LanguagePill({ className }: Readonly<{ className?: string }>) {
  const { language, setLanguage } = useLanguage();
  const target = OTHER_LANGUAGE[language];
  return (
    <button
      type="button"
      lang={target}
      aria-label={SWITCH_LABELS[target]}
      onClick={() => setLanguage(target)}
      className={cn(
        styles.pill,
        'hit-area inline-flex h-9 items-center gap-[7px] rounded-full text-[13px] font-semibold',
        // Lado del globo más prieto porque el círculo no llena su caja
        'pl-[11px] pr-[13px]',
        'active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4',
        'text-fg-3 hover:text-fg focus-visible:ring-primary/20',
        className,
      )}
    >
      <GlobeSimpleIcon size={20} aria-hidden="true" />
      <span className={styles.labels} aria-hidden="true">
        {(['es', 'en'] as const).map((language) => (
          <span key={language} lang={language} data-active={target === language}>
            {LANGUAGE_NAMES[language]}
          </span>
        ))}
      </span>
    </button>
  );
}
