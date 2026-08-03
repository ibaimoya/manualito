import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, useLanguage, type Language } from '@/app/language';
import { EnglishFlag, SpainFlag } from './flags';
import { useFlagSweep } from './useFlagSweep';

const CARD_CLASS = [
  'inline-flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5',
  'text-[13px] font-semibold text-fg-2 shadow-xs',
  'transition-[border-color,box-shadow,color,scale] duration-[120ms] ease-[var(--ease-mn)]',
  'hover:border-border-strong hover:text-fg hover:shadow-sm active:scale-[0.98]',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
  'data-[state=checked]:border-primary data-[state=checked]:text-fg',
  'data-[state=checked]:shadow-[0_0_0_1px_var(--m-primary-500),var(--m-shadow-sm)]',
].join(' ');

/* Con dos idiomas no hace falta menú, ambas opciones a la vista */
export function LanguageCards() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const sweepRef = useFlagSweep<HTMLButtonElement>();

  return (
    <RadioGroupPrimitive.Root
      value={language}
      onValueChange={(next) => setLanguage(next as Language)}
      orientation="horizontal"
      aria-label={t('accessibility.languageSelector')}
      className="flex gap-2.5"
    >
      <RadioGroupPrimitive.Item value="es" lang="es" className={CARD_CLASS}>
        <SpainFlag width={30} height={22} radius={5.5} />
        {LANGUAGE_NAMES.es}
      </RadioGroupPrimitive.Item>
      <RadioGroupPrimitive.Item ref={sweepRef} value="en" lang="en" className={CARD_CLASS}>
        <EnglishFlag width={30} height={22} radius={5.5} />
        {LANGUAGE_NAMES.en}
      </RadioGroupPrimitive.Item>
    </RadioGroupPrimitive.Root>
  );
}
