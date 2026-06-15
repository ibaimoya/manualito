import { Flag, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { useTypewriter } from '@/features/conversations/use-typewriter';
import { Markdown } from '@/shared/components/Markdown';

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
 * Resumen + acordeones de la explicación del juego. Cada apartado llega por
 * separado (primero el resumen): mientras falta se pinta su hueco con spinner y
 * bloqueado, así la estructura final no salta cuando llega el resto. El texto se
 * teclea (animación del chat) solo la primera vez que el usuario lo ve, no en
 * cada visita.
 */
export function ExplanationBlocks({
  live,
  summary,
  content,
}: Readonly<{
  /** La explicación se está generando ahora mismo: anima el tecleo en vivo. */
  live: boolean;
  /** Texto del resumen, o null mientras se genera. */
  summary: string | null;
  /** Texto por apartado, o null mientras se genera. */
  content: Record<ExplanationBlockKey, string | null>;
}>) {
  return (
    <>
      <Card className="bg-surface p-4">
        <p className="mono mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
          Resumen rápido
        </p>
        {summary === null ? <SummaryShimmer /> : <TypedSection text={summary} live={live} />}
      </Card>
      <Accordion type="multiple" className="space-y-3">
        {BLOCKS.map(({ key, title, icon: Icon, chipClass }) => {
          const body = content[key];
          const pending = body === null;
          return (
            <AccordionItem key={key} value={key} disabled={pending}>
              <AccordionTrigger headingLevel={2} loading={pending}>
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${chipClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{title}</span>
                </div>
              </AccordionTrigger>
              {pending ? null : (
                <AccordionContent>
                  <TypedSection text={body} live={live} />
                </AccordionContent>
              )}
            </AccordionItem>
          );
        })}
      </Accordion>
    </>
  );
}

/**
 * Markdown revelado letra a letra solo si el apartado aparece mientras la
 * explicación se genera en vivo. La decisión se captura al montar (cuando llega
 * el texto o se despliega el acordeón): en vivo teclea; ya cacheado (ready)
 * aparece entero, así que al revisitar la página nunca se repite la animación.
 */
function TypedSection({ text, live }: Readonly<{ text: string; live: boolean }>) {
  const [animate] = useState(live);
  const { shown } = useTypewriter(text, animate);
  return <Markdown className="text-base leading-relaxed text-fg">{shown}</Markdown>;
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
