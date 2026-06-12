import { Flag, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';

export type ExplanationBlockKey = 'setup' | 'turns' | 'victory';

const BLOCKS: ReadonlyArray<{
  key: ExplanationBlockKey;
  title: string;
  icon: LucideIcon;
  chipClass: string;
}> = [
  { key: 'setup', title: 'Preparación', icon: Flag, chipClass: 'bg-primary-100 text-primary-700' },
  {
    key: 'turns',
    title: '¿Cómo van los turnos?',
    icon: RefreshCw,
    chipClass: 'bg-accent-100 text-accent',
  },
  {
    key: 'victory',
    title: '¿Cómo se gana?',
    icon: Sparkles,
    chipClass: 'bg-warning-bg text-warning',
  },
];

/**
 * Resumen rápido + acordeones de la explicación: la misma pieza visual en
 * /game y /result (cada pantalla aporta su contenido ya renderizado).
 */
export function ExplanationBlocks({
  summary,
  content,
}: Readonly<{
  summary: ReactNode;
  /** Contenido por bloque; con null el acordeón no se renderiza. */
  content: Record<ExplanationBlockKey, ReactNode | null>;
}>) {
  return (
    <>
      {summary ? (
        <Card className="bg-surface p-4">
          <p className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            Resumen rápido
          </p>
          {summary}
        </Card>
      ) : null}
      <Accordion type="multiple" defaultValue={['setup']} className="space-y-3">
        {BLOCKS.map(({ key, title, icon: Icon, chipClass }) => {
          const body = content[key];
          if (body === null) return null;
          return (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger headingLevel={2}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${chipClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{title}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>{body}</AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
}
