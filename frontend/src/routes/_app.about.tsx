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
import { Fragment, type ReactNode } from 'react';
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

const STEPS: ReadonlyArray<{ n: string; icon: ReactNode; title: string; text: string }> = [
  {
    n: '01',
    icon: <Camera size={22} strokeWidth={1.75} />,
    title: 'Hazle una foto',
    text: 'Sácale una foto al manual o sube el PDF. Varias páginas a la vez, sin orden.',
  },
  {
    n: '02',
    icon: <ScanText size={22} strokeWidth={1.75} />,
    title: 'Lo leemos',
    text: 'El OCR extrae el texto de cada página y marca las que se ven poco claras.',
  },
  {
    n: '03',
    icon: <Sparkles size={22} strokeWidth={1.75} />,
    title: 'Te lo explicamos',
    text: 'La IA resume preparación, turnos y cómo se gana, citando la página original.',
  },
  {
    n: '04',
    icon: <MessagesSquare size={22} strokeWidth={1.75} />,
    title: 'Pregúntale',
    text: 'Dudas de mesa en plena partida: respuesta corta con su fuente al lado.',
  },
];

const FAQ = [
  {
    value: 'reliable',
    icon: Sparkles,
    chipClass: 'bg-primary-100 text-primary-700',
    question: '¿Es fiable lo que dice la IA?',
    answer: (
      <>
        Bastante, pero no infalible. Cada respuesta lleva una{' '}
        <strong>cita a la página del manual</strong> para que compruebes la fuente en un toque. Si
        algo huele raro, la página original manda.
      </>
    ),
  },
  {
    value: 'photos',
    icon: Lock,
    chipClass: 'bg-accent-100 text-accent',
    question: '¿Qué pasa con mis fotos?',
    answer: (
      <>
        Son <strong>privadas por defecto</strong>: solo se usan para extraer el texto. Compartir un
        manual con la comunidad de su juego es opcional y reversible. Más detalle en la{' '}
        <Link to="/privacy" className="font-semibold text-accent hover:underline">
          política de privacidad
        </Link>
        .
      </>
    ),
  },
  {
    value: 'languages',
    icon: Globe,
    chipClass: 'bg-warning-bg text-warning',
    question: '¿En qué idiomas funciona?',
    answer: (
      <>
        De momento, solo funciona <strong>en español</strong>, aunque aunque añadir otros idiomas
        está previsto para futuras versiones.
      </>
    ),
  },
];

function AboutScreen() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 pb-12 pt-6 md:px-8 md:pt-9">
      <header className="flex flex-col items-center gap-3 text-center">
        <Monogram size={64} radius={16} />
        <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-fg md:text-4xl">
          De la caja a la mesa
          <br />
          sin leer ni una página
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-fg-2">
          Manualito lee el manual de tu juego de mesa y te lo explica en claro. Y cuando surja una
          duda en mitad de la partida, se la preguntas.
        </p>
      </header>

      <section aria-label="Cómo funciona">
        <SectionHead eyebrow="El recorrido" title="Cómo funciona" />
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
                {/* min-h de 2 líneas en md: «Te lo explicamos» parte y desalineaba los cuerpos. */}
                <h3 className="font-display text-base font-bold text-fg md:min-h-12">
                  {step.title}
                </h3>
                <p className="text-[13px] leading-relaxed text-fg-2">{step.text}</p>
              </Card>
              {index < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="hidden place-items-center text-fg-3 md:grid"
                >
                  <ChevronRight size={18} strokeWidth={2} />
                </span>
              ) : null}
            </Fragment>
          ))}
        </div>
      </section>

      <section aria-label="Preguntas frecuentes">
        <SectionHead eyebrow="Sin rodeos" title="FAQ" />
        <Accordion type="multiple" className="space-y-3">
          {FAQ.map(({ value, icon: Icon, chipClass, question, answer }) => (
            <AccordionItem key={value} value={value}>
              <AccordionTrigger>
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${chipClass}`}>
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span>{question}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-[15px] leading-relaxed text-fg">{answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section aria-label="Sobre el proyecto" className="grid gap-3 md:grid-cols-[3fr_2fr]">
        <Card className="bg-surface p-5">
          <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            Proyecto académico
          </p>
          <h3 className="mt-1.5 font-display text-base font-bold text-fg">Manualito es un TFG</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
            Trabajo de Fin de Grado en desarrollo: puede aparecer algún bug. Tus avisos
            de errores valen oro.
          </p>
        </Card>
        <Card className="flex flex-col justify-center gap-2.5 p-5">
          <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            ¿Hablamos?
          </p>
          <p className="text-[13.5px] leading-relaxed text-fg-2">
            Dudas, fallos o juegos que no leemos bien.
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
