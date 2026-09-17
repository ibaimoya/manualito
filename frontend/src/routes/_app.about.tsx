import { createFileRoute, Link } from '@tanstack/react-router';
import { CaretRightIcon, ChatsIcon, SparkleIcon } from '@phosphor-icons/react';
import { Fragment } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card } from '@/components/ui/card';
import { ContactEmail } from '@/features/help/ContactEmail';
import { LanguagesIcon, PrivacyIcon, ReliabilityIcon } from '@/features/help/faq-icons';
import '@/features/help/faq.css';
import { HelpMenuButton } from '@/features/tutorial/HelpMenu';
import { Monogram } from '@/shared/components/Brand';
import { CameraIcon, ExtractedTextIcon } from '@/shared/components/action-icons';
import { IllustrationBadge } from '@/shared/components/IllustrationBadge';
import { SectionHead } from '@/shared/components/SectionHead';

export const Route = createFileRoute('/_app/about')({
  component: AboutScreen,
});

const STEPS = [
  {
    n: '01',
    icon: <CameraIcon size={22} />,
    tone: 'primary',
    titleKey: 'steps.capture.title',
    descriptionKey: 'steps.capture.description',
  },
  {
    n: '02',
    icon: <ExtractedTextIcon size={22} />,
    tone: 'accent',
    titleKey: 'steps.read.title',
    descriptionKey: 'steps.read.description',
  },
  {
    n: '03',
    icon: <SparkleIcon aria-hidden="true" className="illustration-spark" size={22} />,
    tone: 'ochre',
    titleKey: 'steps.explain.title',
    descriptionKey: 'steps.explain.description',
  },
  {
    n: '04',
    icon: <ChatsIcon aria-hidden="true" className="illustration-chat" size={22} />,
    tone: 'green',
    titleKey: 'steps.ask.title',
    descriptionKey: 'steps.ask.description',
  },
] as const;

const FAQ = [
  {
    value: 'reliable',
    icon: ReliabilityIcon,
    tone: 'primary',
    questionKey: 'faq.reliable.question',
    answerKey: 'faq.reliable.answer',
  },
  {
    value: 'photos',
    icon: PrivacyIcon,
    tone: 'accent',
    questionKey: 'faq.photos.question',
    answerKey: 'faq.photos.answer',
  },
  {
    value: 'languages',
    icon: LanguagesIcon,
    tone: 'green',
    questionKey: 'faq.languages.question',
    answerKey: 'faq.languages.answer',
  },
] as const;

function AboutScreen() {
  const { t } = useTranslation('help');

  return (
    <div className="page-frame page-stack mx-auto max-w-5xl">
      {/* En móvil la ayuda contextual sigue disponible también en la página de ayuda. */}
      <div className="-mb-4 flex justify-end md:hidden">
        <HelpMenuButton className="-mr-2" />
      </div>
      <header className="flex flex-col items-center gap-3 text-center">
        <Monogram size={64} radius={16} />
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl">
          {t('hero.title.line1')}
          <br />
          {t('hero.title.line2')}
        </h1>
        <p className="page-description">{t('hero.description')}</p>
      </header>

      <section aria-label={t('sections.howItWorks.ariaLabel')}>
        <SectionHead
          eyebrow={t('sections.howItWorks.eyebrow')}
          title={t('sections.howItWorks.title')}
        />
        <div className="grid gap-3 @4xl/app:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] @4xl/app:items-stretch @4xl/app:gap-1">
          {STEPS.map((step, index) => (
            <Fragment key={step.n}>
              <Card className="illustration-card flex flex-col gap-2.5 p-4">
                <div className="flex items-center justify-between">
                  <IllustrationBadge tone={step.tone} className="size-10">
                    {step.icon}
                  </IllustrationBadge>
                  <span className="mono text-[11px] tracking-[0.12em] text-fg-3">{step.n}</span>
                </div>
                {/* min-h de 2 líneas en md. "Te lo explicamos" parte y desalineaba los cuerpos. */}
                <h3 className="font-display text-base font-bold text-fg @4xl/app:min-h-12">
                  {t(step.titleKey)}
                </h3>
                <p className="text-[13px] leading-relaxed text-fg-2">{t(step.descriptionKey)}</p>
              </Card>
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="hidden place-items-center text-fg-3 @4xl/app:grid"
                >
                  <CaretRightIcon size={18} />
                </span>
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>

      <section aria-label={t('sections.faq.ariaLabel')}>
        <SectionHead eyebrow={t('sections.faq.eyebrow')} title={t('sections.faq.title')} />
        <Accordion type="multiple" className="space-y-3">
          {FAQ.map(({ value, icon: Icon, tone, questionKey, answerKey }) => (
            <AccordionItem key={value} value={value}>
              <AccordionTrigger className="faq-trigger">
                <span className="flex items-center gap-3">
                  <IllustrationBadge tone={tone}>
                    <Icon size={20} />
                  </IllustrationBadge>
                  <span>{t(questionKey)}</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="@md/app:pl-[60px] @md/app:pr-6">
                <p className="max-w-[80ch] text-base leading-relaxed text-fg @md/app:text-[17px]">
                  <Trans
                    ns="help"
                    i18nKey={answerKey}
                    components={{
                      privacyLink: (
                        <Link
                          to="/privacy"
                          className="font-semibold text-primary-700 underline underline-offset-2"
                        />
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
        className="grid gap-3 @3xl/app:grid-cols-[3fr_2fr]"
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
          <ContactEmail />
        </Card>
      </section>
    </div>
  );
}
