import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { FileArrowDownIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { useFileDrop } from './use-file-drop';

export function ManualDropZone({
  children,
  onFiles,
  disabled,
  busy,
}: Readonly<{
  children: ReactNode;
  onFiles: (files: File[]) => void;
  disabled: boolean;
  busy: boolean;
}>) {
  const { t } = useTranslation('capture');
  const { target, dragging } = useFileDrop(onFiles, disabled);
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  const reduceMotion = useReducedMotion();
  let title = t('drop.release');
  if (disabled) title = t('drop.chooseGame');
  if (busy) title = t('drop.busy');

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={target}
      className="relative"
      data-file-drop={dragging ? 'active' : 'idle'}
      animate={{ height: height ?? 'auto' }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="h-full [clip-path:inset(-4px)]">
        <div
          ref={content}
          className={cn(
            'flex flex-col gap-4 transition-opacity duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
            dragging && 'opacity-15',
          )}
        >
          {children}
        </div>
      </div>
      <div
        aria-hidden={!dragging}
        className={cn(
          'pointer-events-none absolute -inset-1 flex items-center justify-center rounded-2xl border-2 border-primary/70 bg-bg/95 px-6 py-4 shadow-[inset_0_0_32px_color-mix(in_oklab,var(--color-primary)_8%,transparent)] transition-[opacity,transform] duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
          dragging ? 'scale-100 opacity-100' : 'scale-[0.985] opacity-0',
        )}
      >
        <div className="flex max-w-sm items-center gap-5">
          <FileArrowDownIcon
            aria-hidden="true"
            size={48}
            weight="duotone"
            className={cn(
              'shrink-0 text-primary-700 transition-transform duration-200 ease-[var(--ease-mn)] motion-reduce:transition-none',
              dragging ? 'translate-y-0' : '-translate-y-1',
            )}
          />
          <div>
            <p className="font-display text-lg font-bold leading-snug text-fg">{title}</p>
            {!disabled && (
              <p className="mt-1 text-sm leading-relaxed text-fg-2">{t('drop.formats')}</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
