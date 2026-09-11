import * as RadioGroup from '@radix-ui/react-radio-group';
import { motion } from 'motion/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { ManualViewGlyph } from './ManualViewGlyph';

export type ManualView = 'text' | 'original' | 'compare';

const options = ['text', 'original', 'compare'] as const;

export function ManualViewSwitch({
  value,
  onChange,
}: Readonly<{
  value: ManualView;
  onChange: (view: ManualView) => void;
}>) {
  return (
    <>
      <ViewOptions value={value} onChange={onChange} wide />
      <ViewOptions value={value === 'compare' ? 'text' : value} onChange={onChange} />
    </>
  );
}

function ViewOptions({
  value,
  onChange,
  wide = false,
}: Readonly<{
  value: ManualView;
  onChange: (view: ManualView) => void;
  wide?: boolean;
}>) {
  const { t } = useTranslation('manual');
  const indicatorId = useId();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <RadioGroup.Root
      aria-label={t('workspace.view')}
      value={value}
      onValueChange={(next) => onChange(next as ManualView)}
      orientation="horizontal"
      className={cn('items-center gap-1', wide ? 'hidden @5xl/app:flex' : 'flex @5xl/app:hidden')}
    >
      {options
        .filter((option) => wide || option !== 'compare')
        .map((option) => (
          <RadioGroup.Item
            key={option}
            value={option}
            className="manual-view-option relative inline-flex min-h-10 items-center justify-center gap-2 rounded-[4px] px-2 text-[13px] font-medium text-fg-2 hover:bg-fg/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=checked]:text-fg @2xl/app:px-3"
          >
            <ManualViewGlyph view={option} selected={option === value} />
            {t(`workspace.${option}`)}
            {option === value && (
              <motion.span
                aria-hidden="true"
                initial={false}
                layoutId={reducedMotion ? undefined : indicatorId}
                className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 bg-fg"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </RadioGroup.Item>
        ))}
    </RadioGroup.Root>
  );
}
