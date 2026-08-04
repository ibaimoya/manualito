import {
  Database,
  GraduationCap,
  Image as ImageIcon,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { cn } from '@/shared/lib/cn';

/** Contenido de la política, compartido entre la página /privacy y el modal in-app. */
const SECTIONS = [
  {
    icon: Database,
    h: 'sections.data.heading',
    body: 'sections.data.body',
  },
  {
    icon: Sparkles,
    h: 'sections.usage.heading',
    body: 'sections.usage.body',
  },
  {
    icon: ImageIcon,
    h: 'sections.images.heading',
    body: 'sections.images.body',
  },
  {
    icon: Server,
    h: 'sections.processing.heading',
    body: 'sections.processing.body',
  },
  {
    icon: ShieldCheck,
    h: 'sections.rights.heading',
    body: 'sections.rights.body',
  },
  {
    icon: GraduationCap,
    h: 'sections.academic.heading',
    body: 'sections.academic.body',
  },
] as const;

export function PrivacySections({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation('legal');

  return (
    <Card className={cn('divide-y divide-border overflow-hidden', className)}>
      {SECTIONS.map(({ icon: Icon, h, body }) => (
        <div key={h} className="flex gap-4 p-5">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700"
          >
            <Icon size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-bold tracking-tight text-fg">{t(h)}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-fg-2">{t(body)}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
