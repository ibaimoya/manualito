import {
  Database,
  GraduationCap,
  Image as ImageIcon,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import styles from './privacy.module.css';

const SECTIONS = [
  {
    icon: Database,
    heading: 'sections.data.heading',
    body: 'sections.data.body',
  },
  {
    icon: Sparkles,
    heading: 'sections.usage.heading',
    body: 'sections.usage.body',
  },
  {
    icon: ImageIcon,
    heading: 'sections.images.heading',
    body: 'sections.images.body',
  },
  {
    icon: Server,
    heading: 'sections.processing.heading',
    body: 'sections.processing.body',
  },
  {
    icon: ShieldCheck,
    heading: 'sections.rights.heading',
    body: 'sections.rights.body',
  },
  {
    icon: GraduationCap,
    heading: 'sections.academic.heading',
    body: 'sections.academic.body',
  },
] as const;

export function PrivacySections({
  className,
  headingLevel = 2,
}: Readonly<{ className?: string; headingLevel?: 2 | 3 }>) {
  const { t } = useTranslation('legal');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <div className={cn(styles.sections, className)}>
      {SECTIONS.map(({ icon: Icon, heading, body }) => (
        <section key={heading} className={styles.section}>
          <Heading className={styles.sectionTitle}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            {t(heading)}
          </Heading>
          <p>{t(body)}</p>
        </section>
      ))}
    </div>
  );
}
