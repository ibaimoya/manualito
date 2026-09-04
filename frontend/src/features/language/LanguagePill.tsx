import { Globe } from 'lucide-react';
import { LANGUAGE_NAMES, useLanguage, type Language } from '@/app/language';
import { cn } from '@/shared/lib/cn';

/* El aria va en el idioma destino para quien no entiende el actual */
const SWITCH_LABELS: Record<Language, string> = {
  es: 'Cambiar el idioma a español',
  en: 'Switch language to English',
};

const OTHER_LANGUAGE: Record<Language, Language> = {
  es: 'en',
  en: 'es',
};

type Tone = 'light' | 'dark';

/* Pill fantasma de un toque, muestra el otro idioma en su forma nativa */
export function LanguagePill({
  tone = 'light',
  className,
}: Readonly<{ tone?: Tone; className?: string }>) {
  const { language, setLanguage } = useLanguage();
  const target = OTHER_LANGUAGE[language];
  return (
    <button
      type="button"
      aria-label={SWITCH_LABELS[target]}
      onClick={() => setLanguage(target)}
      className={cn(
        'hit-area inline-flex h-9 items-center gap-[7px] rounded-full text-[13px] font-semibold',
        // Lado del globo más prieto porque el círculo no llena su caja
        'pl-[11px] pr-[13px]',
        'transition-[color,scale] duration-[120ms] ease-[var(--ease-mn)]',
        'active:scale-[0.96] focus-visible:outline-none focus-visible:ring-4',
        tone === 'light' && 'text-fg-3 hover:text-fg focus-visible:ring-primary/20',
        tone === 'dark' &&
          'text-[rgba(255,248,240,0.55)] hover:text-[#FFF8F0] focus-visible:ring-[rgba(255,248,240,0.18)]',
        className,
      )}
    >
      <Globe size={15} strokeWidth={2} aria-hidden="true" />
      <span lang={target} className="[text-box:trim-both_cap_alphabetic]">
        {LANGUAGE_NAMES[target]}
      </span>
    </button>
  );
}
