import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LANGUAGE_NAMES, useLanguage, type Language } from '@/app/language';
import { cn } from '@/shared/lib/cn';
import { EnglishFlag, SpainFlag } from './flags';
import { useFlagSweep } from './useFlagSweep';

const AUTO_CLOSE_MS = 2500;

const ITEM_CLASS =
  'group flex h-10 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 text-sm font-semibold text-fg outline-none data-[highlighted]:bg-surface-2';

const CHECK_CLASS =
  'text-primary opacity-0 scale-90 transition-[opacity,scale] duration-[120ms] ease-[var(--ease-mn)] group-data-[state=checked]:opacity-100 group-data-[state=checked]:scale-100';

/**
 * Selector de idioma de la topbar. Trigger monocromo (un pill con color
 * permanente competiría con el CTA de la pantalla) y banderas solo en el
 * menú. Cambiar de idioma no cierra el menú, se cierra clicando fuera,
 * con Escape o tras unos segundos sin volver a clicar.
 */
export function LanguageMenu() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const sweepRef = useFlagSweep<HTMLDivElement>();

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
      }}
    >
      <DropdownMenuPrimitive.Trigger
        aria-label="Idioma de la interfaz"
        className={cn(
          'group inline-flex h-8 items-center rounded-full text-fg-2',
          // Centrado óptico, el chevron trae 2.5px de aire interno por lado
          'gap-1.5 pl-[9px] pr-[7px]',
          'transition-[background-color,color,scale] duration-[120ms] ease-[var(--ease-mn)]',
          'hover:bg-surface-2 hover:text-fg active:scale-[0.97]',
          'data-[state=open]:bg-surface-2 data-[state=open]:text-fg',
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

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          data-mn-lang-menu=""
          className="z-50 min-w-52 rounded-2xl border border-border bg-card p-1.5 shadow-md"
        >
          <DropdownMenuPrimitive.RadioGroup
            value={language}
            onValueChange={(next) => setLanguage(next as Language)}
          >
            <DropdownMenuPrimitive.RadioItem
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
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
