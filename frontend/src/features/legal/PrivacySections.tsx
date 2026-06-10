import {
  Database,
  GraduationCap,
  Image as ImageIcon,
  Server,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/shared/lib/cn';

/** Contenido de la política, compartido entre la página /privacy y el modal in-app. */
const SECTIONS: ReadonlyArray<{ icon: LucideIcon; h: string; body: string }> = [
  {
    icon: Database,
    h: '¿Qué datos tratamos?',
    body: 'Tu email, el nombre que elijas y las imágenes de los manuales que subes.',
  },
  {
    icon: Sparkles,
    h: '¿Para qué los usamos?',
    body: 'Para darte acceso a tu cuenta, procesar las fotos (OCR) y generar las explicaciones del manual. No vendemos tus datos ni los usamos para publicidad.',
  },
  {
    icon: ImageIcon,
    h: 'Las imágenes de tus manuales',
    body: 'Se procesan para extraer el texto. Si activas «borrar fotos tras procesar» en Ajustes, se eliminan al terminar; el texto extraído se guarda asociado a tu manual.',
  },
  {
    icon: Server,
    h: '¿Dónde se procesan?',
    body: 'El OCR y el modelo de lenguaje se ejecutan en la infraestructura del proyecto. Tus datos no se ceden a terceros para entrenar sus modelos.',
  },
  {
    icon: ShieldCheck,
    h: 'Tus derechos',
    body: 'Puedes consultar y borrar tu información desde Ajustes (borrar el historial o cerrar sesión). Si necesitas algo más, escríbenos.',
  },
  {
    icon: GraduationCap,
    h: 'Proyecto académico',
    body: 'Manualito es un Trabajo de Fin de Grado con fines de investigación y demostración, no un servicio comercial.',
  },
];

export function PrivacySections({ className }: Readonly<{ className?: string }>) {
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
            <h2 className="font-display text-base font-bold tracking-tight text-fg">{h}</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-fg-2">{body}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}
