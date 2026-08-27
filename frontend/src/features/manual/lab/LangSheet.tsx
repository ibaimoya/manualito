import { Check, Pencil, RotateCw, Search, Trash2, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import '@fontsource-variable/literata';
import '@/features/manual/lab/lang-sheet.css';

/* Muestra viva del lenguaje visual v2 (docs/design/lenguaje-visor.md).
   No es el visor: es el specimen que fija metáfora, tipos, subrayador, voz y gestos. */

const STROKE = 1.75;

function Specimen({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-semibold text-fg-2">{title}</h2>
      {children}
    </section>
  );
}

function Meeple({ className }: Readonly<{ className?: string }>) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M32 6c-6 0-10 4.6-10 10 0 2.8 1.1 5.2 3 7-6.6 1.9-12 6.3-15 12-1.9 3.7.8 8 5 8h7c1.1 0 2 .9 2 2 0 4.6-1.9 8.8-5 11.8-2.4 2.4-.7 6.2 2.7 6.2h20.6c3.4 0 5.1-3.8 2.7-6.2-3.1-3-5-7.2-5-11.8 0-1.1.9-2 2-2h7c4.2 0 6.9-4.3 5-8-3-5.7-8.4-10.1-15-12 1.9-1.8 3-4.2 3-7 0-5.4-4-10-10-10z"
      />
    </svg>
  );
}

export function LangSheet() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-6 py-10">
      <header className="space-y-1">
        <p className="font-display text-[26px] font-extrabold tracking-tight text-fg">
          El lenguaje del visor
        </p>
        <p className="text-[14px] text-fg-2">
          Mesa, papel y objetos. El manual es papel y las dudas se marcan con rotulador.
        </p>
      </header>

      <Specimen title="Superficies: mesa, papel, objeto">
        <div className="rounded-xl bg-bg p-5">
          <div
            className="rounded-xl border border-border p-5 shadow-sm"
            style={{ background: 'var(--lab-paper)' }}
          >
            <p className="lang-reading text-fg">
              El papel es la hoja donde vive el texto leído. Reposa sobre la mesa crema con la
              sombra cálida de la marca, nunca con una sombra genérica.
            </p>
          </div>
          <div className="mt-4 w-fit rounded-2xl border border-border bg-card px-4 py-3 shadow-md">
            <p className="text-[13.5px] font-medium text-fg">
              Los objetos (menús, trays, diálogos) flotan con más sombra y más radio.
            </p>
          </div>
        </div>
      </Specimen>

      <Specimen title="Tipografía: el título vuelve a mandar">
        <p className="font-display text-[26px] font-extrabold tracking-tight text-fg">
          Cumbres, el juego de los tresmiles
        </p>
        <p className="text-[12.5px] text-fg-3">
          PDF · 6 páginas · subido hace dos días
        </p>
        <p className="lang-reading max-w-[62ch] text-fg" lang="es">
          Ser la primera persona en encadenar tres cumbres y regresar al refugio base antes de
          que la tormenta cierre los pasos de montaña. Cada alpinista comienza con cuatro cartas
          de ruta y una ficha de refugio.
        </p>
        <p className="mono text-[11.5px] tabular-nums text-fg-3">
          91% · página 2 de 6 · coincidencia 1 de 7
        </p>
      </Specimen>

      <Specimen title="La confianza es un subrayador">
        <div
          className="space-y-3 rounded-xl border border-border p-5 shadow-sm"
          style={{ background: 'var(--lab-paper)' }}
        >
          <div className="flex items-baseline gap-4">
            <p className="lang-reading min-w-0 flex-1 text-fg" lang="es">
              En tu turno juegas una carta de ruta y mueves tu alpinista tantos tramos.
            </p>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] tabular-nums text-fg-3">
              93%
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <p className="lang-reading min-w-0 flex-1 text-fg" lang="es">
              <span className="lang-hl lang-hl-media">
                Si el dado muestra tormenta, nadie puede cruzar la arista norte.
              </span>
            </p>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] font-medium tabular-nums text-warning">
              66%
            </span>
          </div>
          <div className="flex items-baseline gap-4">
            <p className="lang-reading min-w-0 flex-1 text-fg" lang="es">
              <span className="lang-hl lang-hl-baja">rn ,, |1l cornisa 3€</span>
            </p>
            <span className="mono w-9 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-error">
              51%
            </span>
          </div>
        </div>
        <p className="text-[12.5px] text-fg-3">
          El trazo abraza el texto como un rotulador sobre papel. Nada de rectángulos de fila.
        </p>
      </Specimen>

      <Specimen title="Botones: verbo y objeto, con peso">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-fg-inv"
          >
            <Check size={15} strokeWidth={STROKE} aria-hidden="true" />
            Guardar cambios
          </button>
          <button
            type="button"
            className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3.5 text-[13.5px] font-medium text-fg"
            style={{ background: 'var(--lab-paper)' }}
          >
            <Upload size={15} strokeWidth={STROKE} aria-hidden="true" />
            Sustituir la imagen
          </button>
          <button
            type="button"
            className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-fg-2 hover:text-fg"
          >
            <RotateCw size={15} strokeWidth={STROKE} aria-hidden="true" />
            Leer de nuevo
          </button>
          <button
            type="button"
            className="lang-lift inline-flex h-9 items-center gap-2 rounded-lg bg-error px-3.5 text-[13.5px] font-semibold text-fg-inv"
          >
            <Trash2 size={15} strokeWidth={STROKE} aria-hidden="true" />
            Eliminar manual
          </button>
        </div>
        <p className="text-[12.5px] text-fg-3">
          Lift de 1px al pasar, press a 0.97. Sin jerga: «Leer de nuevo», nunca «Reprocesar».
        </p>
      </Specimen>

      <Specimen title="Leyenda de estados, en una línea tranquila">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {(
            [
              ['bg-success', 'Bien leída'],
              ['bg-warning', 'Con dudas'],
              ['bg-accent', 'Editada'],
              ['bg-warning', 'Duplicada'],
              ['bg-fg-3', 'Aún leyendo'],
              ['bg-error', 'No se pudo leer'],
            ] as const
          ).map(([dot, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[12px] text-fg-2">
              <span className={cn('size-1.5 rounded-full', dot)} aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </Specimen>

      <Specimen title="Mascota: el deleite vive en los estados raros">
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-border py-8 shadow-sm"
          style={{ background: 'var(--lab-paper)' }}
        >
          <Meeple className="lang-bob size-12 text-primary" />
          <p className="text-[13.5px] font-medium text-fg">Aquí no hay nada todavía</p>
          <p className="text-[12.5px] text-fg-3">Sube la primera foto del manual para empezar.</p>
        </div>
      </Specimen>

      <Specimen title="Iconos que cuentan lo que pasa">
        <div className="flex items-center gap-6 text-fg-2">
          <span className="inline-flex items-center gap-2 text-[12.5px]">
            <Pencil size={17} strokeWidth={STROKE} aria-hidden="true" /> edita
          </span>
          <span className="inline-flex items-center gap-2 text-[12.5px]">
            <Check size={17} strokeWidth={STROKE} aria-hidden="true" /> guarda
          </span>
          <span className="inline-flex items-center gap-2 text-[12.5px]">
            <Search size={17} strokeWidth={STROKE} aria-hidden="true" /> busca
          </span>
        </div>
        <p className="text-[12.5px] text-fg-3">
          Lucide a 1.75 de trazo. En las transiciones, el icono morfa (lápiz a check, chevron
          que rota) en vez de swapearse.
        </p>
      </Specimen>
    </div>
  );
}
