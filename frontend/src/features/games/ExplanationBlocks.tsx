import { Flag, RefreshCw, Sparkles, Trophy, type LucideIcon } from 'lucide-react';
import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { HelpIndicator } from '@/components/ui/help-indicator';
import { SkeletonSwap } from '@/components/ui/skeleton-swap';
import { Markdown } from '@/shared/components/Markdown';
import { IllustrationBadge, type IllustrationTone } from '@/shared/components/IllustrationBadge';

export type ExplanationBlockKey = 'setup' | 'turns' | 'victory';
type GameKey = ParseKeys<'game'>;

const BLOCKS: ReadonlyArray<{
  key: ExplanationBlockKey;
  title: GameKey;
  icon: LucideIcon;
  tone: IllustrationTone;
}> = [
  {
    key: 'setup',
    title: 'explanation.blocks.setup',
    icon: Flag,
    tone: 'primary',
  },
  {
    key: 'turns',
    title: 'explanation.blocks.turns',
    icon: RefreshCw,
    tone: 'accent',
  },
  {
    key: 'victory',
    title: 'explanation.blocks.victory',
    icon: Trophy,
    tone: 'green',
  },
];

/**
 * Resumen + acordeones de la explicación del juego. Cada apartado llega por
 * separado (primero el resumen): mientras falta se pinta su hueco con spinner y
 * bloqueado, así la estructura final no salta cuando llega el resto.
 */
export function ExplanationBlocks({
  summary,
  content,
}: Readonly<{
  /** Texto del resumen, o null mientras se genera. */
  summary: string | null;
  /** Texto por apartado, o null mientras se genera. */
  content: Record<ExplanationBlockKey, string | null>;
}>) {
  const { t } = useTranslation('game');

  return (
    <>
      <Card className="bg-surface p-4">
        <div className="mb-1.5 flex items-center gap-0.5">
          <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            {t('explanation.summary')}
          </p>
          <HelpIndicator
            icon={Sparkles}
            label={t('explanation.aiGenerated')}
            className="-my-1"
            iconClassName="size-4"
          />
        </div>
        <SkeletonSwap pending={summary === null} skeleton={<SummaryShimmer />}>
          {summary !== null && (
            <Markdown className="text-base leading-relaxed text-fg">{summary}</Markdown>
          )}
        </SkeletonSwap>
      </Card>
      <Accordion type="multiple" className="space-y-3">
        {BLOCKS.map(({ key, title, icon: Icon, tone }) => {
          const body = content[key];
          const pending = body === null;
          return (
            <AccordionItem key={key} value={key} disabled={pending}>
              <AccordionTrigger className="explanation-trigger" headingLevel={2} loading={pending}>
                <div className="flex items-center gap-3">
                  <IllustrationBadge tone={tone} className="explanation-icon">
                    <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  </IllustrationBadge>
                  <span>{t(title)}</span>
                </div>
              </AccordionTrigger>
              {pending ? null : (
                <AccordionContent>
                  <Markdown className="text-base leading-relaxed text-fg">{body}</Markdown>
                </AccordionContent>
              )}
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
}

function SummaryShimmer() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <div className="h-3 w-[92%] animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-full animate-pulse rounded bg-surface-2" />
      <div className="h-3 w-[78%] animate-pulse rounded bg-surface-2" />
    </div>
  );
}
