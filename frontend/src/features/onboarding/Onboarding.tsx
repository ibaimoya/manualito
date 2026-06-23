import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Check,
  ChevronDown,
  FileText,
  Flag,
  RefreshCw,
  Search as SearchIcon,
  Sparkles,
  Crown,
} from 'lucide-react';
import { Monogram } from '@/shared/components/Brand';
import { PrivacyPolicyModal } from '@/features/legal/PrivacyPolicyModal';
import { storage } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';
import styles from './onboarding.module.css';

const WORD = 'MANUALITO';
const WORD_LETTERS = Array.from(WORD, (character, index) => ({
  id: `${character}-${index}`,
  character,
  order: index,
}));

interface Slide {
  kind: 'hero' | 'step';
  id: 'hero' | 'foto' | 'procesa' | 'entiende';
  n?: number;
  title?: string;
  sub?: string;
}

const SLIDES: Slide[] = [
  { kind: 'hero', id: 'hero' },
  {
    kind: 'step',
    id: 'foto',
    n: 1,
    title: 'Hazle una foto',
    sub: 'Captura las páginas del manual con la cámara. Da igual el orden. Manualito las cose por ti.',
  },
  {
    kind: 'step',
    id: 'procesa',
    n: 2,
    title: 'Lo entiende por ti',
    sub: 'Leemos el texto, buscamos contexto y generamos una explicación clara en segundos.',
  },
  {
    kind: 'step',
    id: 'entiende',
    n: 3,
    title: 'Te lo explica con calma',
    sub: 'Resumen, preguntas frecuentes y un chat para resolver dudas mientras jugáis.',
  },
];

// Pasos reales del recorrido (la pantalla final de elección no cuenta).
const STEP_COUNT = SLIDES.filter((slide) => slide.kind === 'step').length;

const PAGE_LINE_WIDTHS = [
  { id: 'manual-line-1', width: 88 },
  { id: 'manual-line-2', width: 95 },
  { id: 'manual-line-3', width: 70 },
  { id: 'manual-line-4', width: 90 },
  { id: 'manual-line-5', width: 60 },
  { id: 'manual-line-6', width: 92 },
  { id: 'manual-line-7', width: 80 },
  { id: 'manual-line-8', width: 56 },
] as const;

const PAGE_CORNERS = [
  { id: 'top-left', x: 0, y: 0 },
  { id: 'top-right', x: 1, y: 0 },
  { id: 'bottom-left', x: 0, y: 1 },
  { id: 'bottom-right', x: 1, y: 1 },
] as const;

const THUMBNAILS = [
  { id: 'thumb-1', number: 1 },
  { id: 'thumb-2', number: 2 },
  { id: 'thumb-3', number: 3 },
] as const;

export function Onboarding() {
  const [index, setIndex] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const navigate = useNavigate();
  const N = SLIDES.length;
  const PANELS = N + 1; // las diapositivas + la pantalla de elección final
  const isChoice = index === N;

  // Ancladas a "visitado": con index, la saliente se vaciaría en pleno deslizamiento.
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));

  function go(next: number): void {
    const clamped = Math.max(0, Math.min(PANELS - 1, next));
    setIndex(clamped);
    setVisited((prev) => (prev.has(clamped) ? prev : new Set(prev).add(clamped)));
  }

  // Guard anti-spam: dos pulsaciones serían dos view transitions solapadas.
  const enteringRef = useRef(false);

  function enterTo(to: '/register' | '/login'): void {
    if (enteringRef.current) return;
    enteringRef.current = true;
    storage.markOnboardingSeen();
    // El router pone el timing de la View Transition; reduced-motion la apaga.
    const reduced = globalThis.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    navigate({ to, replace: true, viewTransition: !reduced })
      .catch(() => undefined)
      .finally(() => {
        enteringRef.current = false;
      });
  }

  function next(): void {
    if (index < PANELS - 1) go(index + 1);
  }

  function skip(): void {
    enterTo('/login');
  }

  // Teclado en captura: el guard ve el modal de privacidad antes de que Radix lo cierre.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (privacyOpen) return;
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Enter') {
        if (isChoice) enterTo('/register');
        else next();
      } else if (e.key === 'Escape') skip();
    };
    globalThis.window.addEventListener('keydown', onKey, true);
    return () => globalThis.window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, privacyOpen]);

  return (
    <div className={styles.root}>
      <div className={styles.mesh} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.topbar}>
        <span className={styles.topbarBrand}>
          <Monogram size={32} radius={9} />
          <span className={styles.topbarName}>
            <span>Manualito</span>
            <span aria-hidden="true" style={{ color: 'var(--m-primary-500)' }}>
              .
            </span>
          </span>
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={styles.topbarLink} onClick={skip} type="button">
            Saltar
          </button>
        </div>
      </header>

      <div
        className={styles.track}
        style={{ width: `${PANELS * 100}vw`, transform: `translateX(${-index * 100}vw)` }}
      >
        {/* — Slide 0: Hero — */}
        <section className={styles.slide} aria-label="Manualito · presentación">
          <div className={styles.hero}>
            <span className={cn(styles.eyebrowTop, styles.isIn)}>UNA APP DE MESA</span>
            <HeroWordmark playing />
            <p className={cn(styles.tagline, styles.isIn)}>
              Explica cualquier manual de juego de mesa en segundos.
            </p>
            <button
              type="button"
              className={cn(styles.pill, styles.isIn)}
              onClick={next}
              style={{ '--vt': index === 0 ? 'cta-pill' : 'none' }}
            >
              <span>Empezar</span>
              <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 22, lineHeight: 1 }}>
                →
              </span>
            </button>
            <span className={cn(styles.scrollhint, styles.isIn)}>
              Desliza · {STEP_COUNT} pasos · 20 s
            </span>
          </div>
        </section>

        {/* — Slides 1..3 — */}
        {SLIDES.slice(1).map((s, idx) => {
          const slideIdx = idx + 1;
          const shown = visited.has(slideIdx);
          const isLast = slideIdx === N - 1;
          return (
            <section key={s.id} className={styles.slide} aria-label={`Paso ${s.n}: ${s.title}`}>
              <div className={styles.step}>
                <div className={styles.stepCopy}>
                  <span className={styles.stepNum}>
                    <span>{String(s.n).padStart(2, '0')}</span>
                    <span>/</span>
                    <span style={{ opacity: 0.5 }}>{String(STEP_COUNT).padStart(2, '0')}</span>
                  </span>
                  <h2 className={cn(styles.stepTitle, shown && styles.isIn)}>{s.title}</h2>
                  <p className={cn(styles.stepSub, shown && styles.isIn)}>{s.sub}</p>
                  <button
                    type="button"
                    className={cn(styles.pill, shown && styles.isIn)}
                    onClick={next}
                  >
                    <span>{isLast ? 'Continuar' : 'Siguiente'}</span>
                    <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 22, lineHeight: 1 }}>
                      →
                    </span>
                  </button>
                </div>
                <div className={styles.stepArt}>
                  <StepArt id={s.id} shown={shown} />
                </div>
              </div>
            </section>
          );
        })}
        {/* — Última diapositiva: elección crear/entrar — */}
        <section className={styles.slide} aria-label="Crear cuenta o entrar">
          <AuthChoice
            shown={visited.has(N)}
            onRegister={() => enterTo('/register')}
            onLogin={() => enterTo('/login')}
            onShowPrivacy={() => setPrivacyOpen(true)}
          />
        </section>
      </div>

      <PrivacyPolicyModal open={privacyOpen} onOpenChange={setPrivacyOpen} />

      {/* Un punto por panel: las diapositivas y la pantalla de elección final. */}
      <div className={styles.pager} role="tablist" aria-label="Pasos del onboarding">
        {Array.from({ length: PANELS }, (_, k) => (
          <button
            key={SLIDES[k]?.id ?? 'final'}
            type="button"
            role="tab"
            aria-selected={index === k}
            aria-label={`Ir a diapositiva ${k + 1}`}
            onClick={() => go(k)}
            className={styles.dotHit}
          >
            <span className={cn(styles.dot, index === k && styles.isOn)} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Paso final: elegir entre crear cuenta o entrar. */
function AuthChoice({
  shown,
  onRegister,
  onLogin,
  onShowPrivacy,
}: Readonly<{
  shown: boolean;
  onRegister: () => void;
  onLogin: () => void;
  onShowPrivacy: () => void;
}>) {
  return (
    <div className={cn(styles.choice, shown && styles.isIn)}>
      <span style={{ filter: 'drop-shadow(0 20px 36px rgba(0, 0, 0, 0.45))' }}>
        <Monogram size={116} radius={28} />
      </span>
      <div>
        <h1 className={styles.choiceTitle}>
          Todo listo<span style={{ color: 'var(--m-primary-300)' }}>.</span>
        </h1>
        <p className={styles.choiceLead}>
          Crea tu cuenta para guardar los manuales que aprendas, o entra si ya eres de la casa.
        </p>
      </div>
      <div className={styles.choiceActions}>
        <button type="button" className={styles.choiceCreate} onClick={onRegister}>
          Crear cuenta
        </button>
        <button type="button" className={styles.choiceGhost} onClick={onLogin}>
          Ya tengo cuenta
        </button>
        <p className={styles.choiceNote}>
          Al crear una cuenta aceptas la{' '}
          <button type="button" className={styles.noteLink} onClick={onShowPrivacy}>
            Política de privacidad
          </button>
          {'.'}
        </p>
      </div>
    </div>
  );
}

function StepArt({ id, shown }: Readonly<{ id: Slide['id']; shown: boolean }>) {
  if (id === 'foto') return <StepFoto shown={shown} />;
  if (id === 'procesa') return <StepProcesa shown={shown} />;
  return <StepEntiende />;
}

function HeroWordmark({ playing }: Readonly<{ playing: boolean }>) {
  return (
    <h1 aria-label="Manualito" className={styles.heroWord}>
      {WORD_LETTERS.map(({ id, character, order }) => (
        <span key={id} className={styles.letterMask}>
          <span className={cn(styles.letter, playing && styles.letterIn)} style={{ '--i': order }}>
            {character}
          </span>
        </span>
      ))}
    </h1>
  );
}

/* — Slide 1: Foto — viewfinder con página detectada — */
function StepFoto({ shown }: Readonly<{ shown: boolean }>) {
  return (
    <div className={styles.phone} aria-hidden="true">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 14px 0',
          color: '#FFF8F0',
        }}
      >
        <span className={styles.mono} style={{ opacity: 0.85 }}>
          ● REC
        </span>
        <span className={styles.mono}>P. 4</span>
      </div>

      <div className={styles.viewfinder}>
        <div className={styles.page}>
          <div
            style={{
              fontFamily: 'var(--m-font-display)',
              fontWeight: 800,
              fontSize: 13,
              color: '#2A211A',
            }}
          >
            3 · Los turnos
          </div>
          <div style={{ height: 6 }} />
          {PAGE_LINE_WIDTHS.map(({ id, width }) => (
            <div
              key={id}
              style={{
                height: 4,
                width: `${width}%`,
                background: 'rgba(31,22,17,0.55)',
                borderRadius: 1.5,
                marginBottom: 4,
              }}
            />
          ))}
          {PAGE_CORNERS.map(({ id, x, y }) => (
            <span
              key={id}
              style={{
                position: 'absolute',
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'var(--m-success)',
                left: x === 0 ? -6 : undefined,
                right: x === 1 ? -6 : undefined,
                top: y === 0 ? -6 : undefined,
                bottom: y === 1 ? -6 : undefined,
                boxShadow: '0 0 0 4px rgba(63,143,63,0.30)',
              }}
            />
          ))}
        </div>

        <div className={styles.hint}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--m-success)',
            }}
          />
          <span>Página detectada</span>
        </div>
      </div>

      <div className={styles.thumbs}>
        {shown &&
          THUMBNAILS.map(({ id, number }) => (
            <div key={id} className={styles.thumb} style={{ '--d': `${number * 200}ms` }}>
              <span className={styles.thumbNum}>{number}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/* — Slide 2: Procesa — pipeline OCR→RAG→LLM — */
function StepProcesa({ shown }: Readonly<{ shown: boolean }>) {
  const nodes: Array<{ label: string; hint: string; icon: ReactNode }> = [
    {
      label: 'OCR',
      hint: 'Leemos cada página',
      icon: <FileText size={26} strokeWidth={1.75} />,
    },
    {
      label: 'RAG',
      hint: 'Buscamos contexto',
      icon: <SearchIcon size={26} strokeWidth={1.75} />,
    },
    {
      label: 'LLM',
      hint: 'Generamos respuesta',
      icon: <Sparkles size={26} strokeWidth={1.75} />,
    },
  ];
  // --g escalona el relevo entre anillos (ciclo de 3.6s en tres tramos).
  return (
    <div className={styles.pipeline}>
      {nodes.map((n, i) => (
        <span key={n.label} style={{ display: 'contents' }}>
          <div
            className={styles.node}
            style={
              shown
                ? { '--d': `${i * 280}ms`, '--g': `${i * 1200}ms` }
                : { animation: 'none', opacity: 0 }
            }
          >
            <div className={styles.nodeRing}>
              <div className={styles.nodeCore}>{n.icon}</div>
            </div>
            <div className={styles.nodeLabel}>
              <span className={styles.mono}>0{i + 1}</span>
              <strong>{n.label}</strong>
              <em>{n.hint}</em>
            </div>
          </div>
          {i < nodes.length - 1 ? (
            <div
              className={styles.link}
              style={
                shown
                  ? { '--d': `${i * 280 + 140}ms`, '--g': `${i * 1200}ms` }
                  : { animation: 'none', opacity: 0 }
              }
            >
              <span className={styles.linkPulse} />
            </div>
          ) : null}
        </span>
      ))}
    </div>
  );
}

/* — Slide 3: Entiende — preview de accordions — */
function StepEntiende() {
  return (
    <div className={styles.cardStack}>
      <div className={styles.summary}>
        <span className={styles.eyebrow}>RESUMEN</span>
        <p>
          En el juego del Catán los jugadores compiten por <strong>colonizar una isla</strong>{' '}
          recolectando recursos, comerciando y construyendo asentamientos.
        </p>
      </div>

      {DEMO_BLOCKS.map(({ icon: Icon, title, em, body }) => (
        <div key={title} className={cn(styles.acc, body ? styles.accOpen : undefined)}>
          <div className={styles.accHead}>
            <span className={styles.accIc}>
              <Icon size={18} />
            </span>
            <div className={styles.accTitles}>
              <strong>{title}</strong>
              <em>{em}</em>
            </div>
            <span className={styles.accChev}>
              <ChevronDown size={18} />
            </span>
          </div>
          {body ? <div className={styles.accBody}>{body}</div> : null}
        </div>
      ))}
    </div>
  );
}

// Acordeones de mentira de la demo de Catán: solo el primero viene abierto.
const DEMO_BLOCKS = [
  {
    icon: Flag,
    title: 'Preparación',
    em: '6 pasos',
    body: (
      <ol>
        <li>Coloca los 19 hexágonos de terreno bocarriba.</li>
        <li>Reparte los tokens de número en orden alfabético.</li>
        <li>Cada jugador toma 2 poblados, 2 carreteras y 4 ciudades.</li>
      </ol>
    ),
  },
  { icon: RefreshCw, title: '¿Cómo van los turnos?', em: '3 fases', body: null },
  { icon: Crown, title: '¿Cómo se gana?', em: 'Llegando a 10 puntos', body: null },
  { icon: Check, title: 'Casos especiales', em: 'Ladrón, puerto, cartas, etc.', body: null },
];
