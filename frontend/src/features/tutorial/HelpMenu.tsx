import { Link, useLocation } from '@tanstack/react-router';
import { CaretRightIcon, ChatsIcon, CursorClickIcon, QuestionIcon } from '@phosphor-icons/react';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/cn';
import { NAVIGATION_SPRING } from '@/shared/lib/navigationMotion';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { tutorial } from './controller';
import { tourTarget } from './targets';
import { tourForPathname } from './tours';

type MenuSide = 'top' | 'right' | 'bottom' | 'left';
type MenuAlign = 'start' | 'center' | 'end';

export const HelpMenuTrigger = DropdownMenuTrigger;

export function HelpMenu({
  children,
  side = 'bottom',
  align = 'end',
}: Readonly<{ children: ReactNode; side?: MenuSide; align?: MenuAlign }>) {
  const { t } = useTranslation('tutorial');
  const pathname = useLocation({ select: (location) => location.pathname });
  const afterMenuClose = useRef<(() => void) | null>(null);
  const currentTour = tourForPathname(pathname);

  // Radix debe devolver el foco antes de abrir otro panel.
  function defer(action: () => void): void {
    afterMenuClose.current = action;
  }

  return (
    <DropdownMenu>
      {children}
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={4}
        style={{ width: 'max(224px, var(--radix-dropdown-menu-trigger-width))', borderRadius: 12 }}
        collisionPadding={12}
        className="max-w-[calc(100vw-24px)] rounded-xl p-1 shadow-lg [&_[data-mn-menu-highlight]]:bg-primary-100 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:rounded-xl [&_[role=menuitem]]:font-medium"
        onCloseAutoFocus={() => {
          const action = afterMenuClose.current;
          afterMenuClose.current = null;
          if (action) queueMicrotask(action);
        }}
      >
        <DropdownMenuItem
          disabled={currentTour === null}
          className={cn(currentTour === null && 'h-auto min-h-10 py-2')}
          onSelect={() => {
            if (currentTour) defer(() => tutorial.start(currentTour.id));
          }}
        >
          <CursorClickIcon size={18} aria-hidden="true" className="shrink-0" />
          <span className="flex min-w-0 flex-col">
            <span>{t('help.explain')}</span>
            {currentTour === null ? (
              <span className="text-xs font-normal text-fg-3">{t('help.explainUnavailable')}</span>
            ) : null}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/about">
            <ChatsIcon size={18} aria-hidden="true" className="shrink-0" />
            {t('help.faq')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function HelpDisclosure({
  children,
  className,
  open,
  onOpenChange,
  indicator,
  highlighted,
  onOpenFaq,
}: Readonly<{
  children: ReactNode;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicator: ReactNode;
  highlighted: 'help' | 'faq';
  onOpenFaq: () => void;
}>) {
  const { t } = useTranslation('tutorial');
  const pathname = useLocation({ select: (location) => location.pathname });
  const currentTour = tourForPathname(pathname);
  const contentId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const actionClass =
    'relative flex min-h-11 w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left text-[13px] font-medium text-fg-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700 disabled:cursor-default disabled:opacity-50';

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    onOpenChange(false);
    trigger.current?.focus();
  }

  return (
    <div>
      <button
        ref={trigger}
        type="button"
        {...tourTarget('nav-help')}
        aria-expanded={open}
        aria-controls={contentId}
        onKeyDown={closeOnEscape}
        onClick={() => onOpenChange(!open)}
        className={cn(className, 'w-full text-left')}
      >
        {highlighted === 'help' && indicator}
        {children}
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={reducedMotion ? { duration: 0 } : NAVIGATION_SPRING}
          className="ml-auto grid shrink-0 place-items-center text-fg-3"
        >
          <CaretRightIcon size={14} />
        </motion.span>
      </button>
      <motion.div
        id={contentId}
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={
          reducedMotion ? { duration: 0 } : { ...NAVIGATION_SPRING, opacity: { duration: 0.12 } }
        }
        inert={!open}
        aria-hidden={!open}
        className="overflow-hidden"
      >
        <ul className="relative ml-6 space-y-0.5 border-l border-border pb-1 pl-2 pr-1 pt-1">
          <li>
            <button
              type="button"
              disabled={!currentTour}
              onKeyDown={closeOnEscape}
              className={actionClass}
              title={!currentTour ? t('help.explainUnavailable') : undefined}
              onClick={() => {
                if (!currentTour) return;
                onOpenChange(false);
                trigger.current?.focus();
                tutorial.start(currentTour.id);
              }}
            >
              <CursorClickIcon size={18} aria-hidden="true" className="shrink-0" />
              {t('help.explain')}
            </button>
          </li>
          <li>
            <Link
              to="/about"
              onKeyDown={closeOnEscape}
              onClick={onOpenFaq}
              className={cn(actionClass, highlighted === 'faq' && 'text-primary-700')}
              aria-current={pathname === '/about' ? 'page' : undefined}
            >
              {highlighted === 'faq' && indicator}
              <ChatsIcon size={18} aria-hidden="true" className="shrink-0" />
              {t('help.faq')}
            </Link>
          </li>
        </ul>
      </motion.div>
    </div>
  );
}

export function HelpMenuButton({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation('tutorial');
  return (
    <HelpMenu side="bottom" align="end">
      <HelpMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('help.trigger')}
          {...tourTarget('nav-help')}
          className={cn(
            'icon-feedback grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 transition-colors hover:text-fg data-[state=open]:text-fg',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
            className,
          )}
        >
          <QuestionIcon size={22} aria-hidden="true" />
        </button>
      </HelpMenuTrigger>
    </HelpMenu>
  );
}
