import { createFileRoute, Link } from '@tanstack/react-router';
import {
  Camera,
  ChevronRight,
  Globe,
  Lock,
  Mail,
  MessagesSquare,
  ScanText,
  Sparkles,
} from 'lucide-react';
import { Fragment } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Monogram } from '@/shared/components/Brand';
import { SectionHead } from '@/shared/components/SectionHead';

export const Route = createFileRoute('/_app/about')({
  component: AboutScreen,
});

const CONTACT_EMAIL = 'support@manualito.com';
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

const STEPS = [
  {
    n: '01',
    icon: <Camera size={22} strokeWidth={1.75} />,
    titleKey: 'steps.capture.title',
    descriptionKey: 'steps.capture.description',
  },
  {
    n: '02',
    icon: <ScanText size={22} strokeWidth={1.75} />,
    titleKey: 'steps.read.title',
    descriptionKey: 'steps.read.description',
  },
  {
    n: '03',
    icon: <Sparkles size={22} strokeWidth={1.75} />,
    titleKey: 'steps.explain.title',
    descriptionKey: 'steps.explain.description',
  },
  {
    n: '04',
    icon: <MessagesSquare size={22} strokeWidth={1.75} />,
    titleKey: 'steps.ask.title',
    descriptionKey: 'steps.ask.description',
  },
] as const;

const FAQ = [
  {
    value: 'reliable',
    icon: Sparkles,
    chipClass: 'bg-primary-100 text-primary-700',
    questionKey: 'faq.reliable.question',
    answerKey: 'faq.reliable.answer',
  },
  {
    value: 'photos',
    icon: Lock,
    chipClass: 'bg-accent-100 text-accent',
    questionKey: 'faq.photos.question',
    answerKey: 'faq.photos.answer',
  },
  {
    value: 'languages',
    icon: Globe,
    chipClass: 'bg-warning-bg text-warning',
    questionKey: 'faq.languages.question',
    answerKey: 'faq.languages.answer',
  },
] as const;

function AboutScreen() {
  const { t } = useTranslation('help');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 pb-12 pt-6 md:px-8 md:pt-9">
      <header className="flex flex-col items-center gap-3 text-center">
        <Monogram size={64} radius={16} />
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl">
          {t('hero.title.line1')}
          <br />
          {t('hero.title.line2')}
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-fg-2">{t('hero.description')}</p>
      </header>

      <section aria-label={t('sections.howItWorks.ariaLabel')}>
        <SectionHead
          eyebrow={t('sections.howItWorks.eyebrow')}
          title={t('sections.howItWorks.title')}
        />
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-stretch md:gap-1">
          {STEPS.map((step, index) => (
            <Fragment key={step.n}>
              <Card className="flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className="grid size-10 place-items-center rounded-xl bg-primary-100 text-primary-700"
                  >
                    {step.icon}
                  </span>
                  <span className="mono text-[11px] tracking-[0.12em] text-fg-3">{step.n}</span>
                </div>
                {/* min-h de 2 líneas en md: "Te lo explicamos" parte y desalineaba los cuerpos. */}
                <h3 className="font-display text-base font-bold text-fg md:min-h-12">
                  {t(step.titleKey)}
                </h3>
                <p className="text-[13px] leading-relaxed text-fg-2">{t(step.descriptionKey)}</p>
              </Card>
              {index < STEPS.length - 1 ? (
                <span aria-hidden="true" className="hidden place-items-center text-fg-3 md:grid">
                  <ChevronRight size={18} strokeWidth={2} />
                </span>
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>

      <section aria-label={t('sections.faq.ariaLabel')}>
        <SectionHead eyebrow={t('sections.faq.eyebrow')} title={t('sections.faq.title')} />
        <Accordion type="multiple" className="space-y-3">
          {FAQ.map(({ value, icon: Icon, chipClass, questionKey, answerKey }) => (
            <AccordionItem key={value} value={value}>
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${chipClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{t(questionKey)}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-[15px] leading-relaxed text-fg">
                  <Trans
                    ns="help"
                    i18nKey={answerKey}
                    components={{
                      link: (
                        <Link to="/privacy" className="font-semibold text-accent hover:underline" />
                      ),
                      strong: <strong />,
                    }}
                  />
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section
        aria-label={t('sections.project.ariaLabel')}
        className="grid gap-3 md:grid-cols-[3fr_2fr]"
      >
        <Card className="bg-surface p-5">
          <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            {t('project.academic.eyebrow')}
          </p>
          <h3 className="mt-1.5 font-display text-base font-bold text-fg">
            {t('project.academic.title')}
          </h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
            {t('project.academic.description')}
          </p>
        </Card>
        <Card className="flex flex-col justify-center gap-2.5 p-5">
          <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            {t('project.contact.eyebrow')}
          </p>
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            {t('project.contact.description')}
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={CONTACT_MAILTO}>
              <Mail size={15} strokeWidth={2} />
              {CONTACT_EMAIL}
            </a>
          </Button>
        </Card>
      </section>
    </div>
  );
}
