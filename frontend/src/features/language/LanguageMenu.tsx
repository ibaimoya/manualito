import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, useLanguage, type Language } from '@/app/language';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { EnglishFlag, SpainFlag } from './flags';
import { useFlagSweep } from './useFlagSweep';
import { useFlagWave } from './useFlagWave';

const AUTO_CLOSE_MS = 2500;

const ITEM_CLASS =
  'group flex h-10 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold text-fg outline-none data-[highlighted]:bg-surface-2';

const CHECK_CLASS =
  'text-primary opacity-0 scale-90 transition-[opacity,scale] duration-[120ms] ease-[var(--ease-mn)] group-data-[state=checked]:opacity-100 group-data-[state=checked]:scale-100';

/* Trigger monocromo, un pill de color permanente competiría con el CTA */
export function LanguageMenu() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const sweepRef = useFlagSweep<HTMLDivElement>();
  const waveRef = useFlagWave<HTMLDivElement>();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const armAutoClose = useCallback(() => {
    clearTimer();
    timerRef.current = globalThis.setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const keepOpen = useCallback(
    (event: Event) => {
      event.preventDefault();
      armAutoClose();
    },
    [armAutoClose],
  );

  return (
    <DropdownMenuPrimitive.Root
      modal={false}
      open={open}
      onOpenChange={(next) => {
        clearTimer();
        setOpen(next);
        if (next) contentRef.current?.focus({ preventScroll: true });
      }}
    >
      <DropdownMenuPrimitive.Trigger
        ref={triggerRef}
        aria-label={t('accessibility.languageSelector')}
        className={cn(
          'hit-area group inline-flex h-8 items-center rounded-full text-fg-2',
          // Centrado óptico, el chevron trae 2.5px de aire interno por lado
          'gap-1.5 pl-[9px] pr-[7px]',
          'transition-[color,scale] duration-[120ms] ease-[var(--ease-mn)]',
          'hover:text-fg active:scale-[0.97] data-[state=open]:text-fg',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
        )}
      >
        <Globe size={15} strokeWidth={2} aria-hidden="true" />
        <span className="font-mono text-[11.5px] font-semibold tracking-[0.06em]">
          {language.toUpperCase()}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2.25}
          aria-hidden="true"
          className="text-fg-3 transition-[rotate] duration-200 ease-[var(--ease-mn)] group-hover:text-fg-2 group-data-[state=open]:rotate-180"
        />
      </DropdownMenuPrimitive.Trigger>

      <AnimatePresence>
        {open && (
          <DropdownMenuPrimitive.Portal forceMount>
            <DropdownMenuPrimitive.Content
              asChild
              align="end"
              sideOffset={6}
              onInteractOutside={(event) => {
                if (triggerRef.current?.contains(event.target as Node)) event.preventDefault();
              }}
            >
              <motion.div
                ref={contentRef}
                data-mn-lang-menu=""
                initial={{ opacity: 0, transform: reducedMotion ? 'none' : 'translateY(-4px)' }}
                animate={{ opacity: 1, transform: reducedMotion ? 'none' : 'translateY(0px)' }}
                exit={{ opacity: 0, transform: reducedMotion ? 'none' : 'translateY(-4px)' }}
                transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.2, 0.8, 0.2, 1] }}
                className="z-50 min-w-52 rounded-2xl border border-border bg-card p-1.5 shadow-md"
              >
                <DropdownMenuPrimitive.RadioGroup
                  value={language}
                  onValueChange={(next) => setLanguage(next as Language)}
                >
                  <DropdownMenuPrimitive.RadioItem
                    ref={waveRef}
                    value="es"
                    lang="es"
                    onSelect={keepOpen}
                    className={ITEM_CLASS}
                  >
                    <span className="flex items-center gap-2.5">
                      <SpainFlag />
                      {LANGUAGE_NAMES.es}
                    </span>
                    <Check size={15} strokeWidth={2.5} aria-hidden="true" className={CHECK_CLASS} />
                  </DropdownMenuPrimitive.RadioItem>
                  <DropdownMenuPrimitive.RadioItem
                    ref={sweepRef}
                    value="en"
                    lang="en"
                    onSelect={keepOpen}
                    className={ITEM_CLASS}
                  >
                    <span className="flex items-center gap-2.5">
                      <EnglishFlag />
                      {LANGUAGE_NAMES.en}
                    </span>
                    <Check size={15} strokeWidth={2.5} aria-hidden="true" className={CHECK_CLASS} />
                  </DropdownMenuPrimitive.RadioItem>
                </DropdownMenuPrimitive.RadioGroup>
              </motion.div>
            </DropdownMenuPrimitive.Content>
          </DropdownMenuPrimitive.Portal>
        )}
      </AnimatePresence>
    </DropdownMenuPrimitive.Root>
  );
}
