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
    sub: 'Resumen, secciones colapsables y un chat para resolver dudas mientras jugáis.',
  },
];

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

const PIPELINE_TOKENS = [
  { id: 'setup', label: 'Setup' },
  { id: 'arrow-turn', label: '→' },
  { id: 'turn', label: 'turno' },
  { id: 'arrow-win', label: '→' },
  { id: 'win', label: 'ganar' },
  { id: 'arrow-points', label: '↦' },
  { id: 'points', label: '10 PV' },
] as const;

export function Onboarding() {
  const [index, setIndex] = useState(0);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const navigate = useNavigate();
  const N = SLIDES.length;
  const PANELS = N + 1; // las diapositivas + la pantalla de elección final
  const isChoice = index === N;

  // Las animaciones de entrada se anclan a "visitado", no al índice actual:
  // si dependieran de `index`, la diapositiva saliente se desmontaría
  // visualmente mientras aún es visible durante los 900ms del deslizamiento.
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set([0]));

  function go(next: number): void {
    const clamped = Math.max(0, Math.min(PANELS - 1, next));
    setIndex(clamped);
    setVisited((prev) => (prev.has(clamped) ? prev : new Set(prev).add(clamped)));
  }

  // Guard anti-spam: evita que pulsaciones dobles lancen dos navegaciones
  // (y dos view transitions solapadas → glitch).
  const enteringRef = useRef(false);

  function enterTo(to: '/register' | '/login'): void {
    if (enteringRef.current) return;
    enteringRef.current = true;
    storage.markOnboardingSeen();
    // El router envuelve el cambio de ruta (asíncrono) en una View Transition
    // con el timing correcto; se desactiva si el usuario prefiere sin motion.
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

  // Navegación con teclado. Con el modal de privacidad abierto se cede el
  // teclado al diálogo (su Escape cierra el modal, no el onboarding). El
  // listener va en fase de captura: corre ANTES de que Radix cierre el modal,
  // así el guard ve el estado previo a la pulsación y no hay carrera.
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
          <span className={styles.topbarName}>Manualito</span>
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
            <span className={cn(styles.scrollhint, styles.isIn)}>Desliza · 3 pasos · 20 s</span>
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
                    <span style={{ opacity: 0.5 }}>03</span>
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

      <div className={styles.pager} role="tablist" aria-label="Pasos del onboarding">
        {SLIDES.map((slide, k) => {
          const dotIndex = Math.min(index, N - 1);
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={dotIndex === k}
              aria-label={`Ir a diapositiva ${k + 1}`}
              onClick={() => go(k)}
              className={styles.dotHit}
            >
              <span className={cn(styles.dot, dotIndex === k && styles.isOn)} />
            </button>
          );
        })}
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
          <span
            className={cn(styles.letter, playing && styles.letterIn)}
            style={{ '--i': order }}
          >
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
            3 · El turno
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
            <div
              key={id}
              className={styles.thumb}
              style={{ '--d': `${number * 200}ms` }}
            >
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
  return (
    <div>
      <div className={styles.pipeline}>
        {nodes.map((n, i) => (
          <span key={n.label} style={{ display: 'contents' }}>
            <div
              className={styles.node}
              style={shown ? { '--d': `${i * 280}ms` } : { animation: 'none', opacity: 0 }}
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
                  shown ? { '--d': `${i * 280 + 140}ms` } : { animation: 'none', opacity: 0 }
                }
              >
                <span className={styles.linkPulse} />
              </div>
            ) : null}
          </span>
        ))}
      </div>
      <div className={styles.tokens} aria-hidden="true">
        {shown &&
          PIPELINE_TOKENS.map(({ id, label }, i) => (
            <span
              key={id}
              className={styles.token}
              style={{ '--d': `${600 + i * 90}ms` }}
            >
              {label}
            </span>
          ))}
      </div>
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
          Construyes una isla con poblados y ciudades para sumar <strong>10 puntos</strong>. Tiras
          dados, recibes recursos y comercias.
        </p>
      </div>

      <div className={cn(styles.acc, styles.accOpen)}>
        <div className={styles.accHead}>
          <span className={styles.accIc}>
            <Flag size={18} />
          </span>
          <div className={styles.accTitles}>
            <strong>Preparación</strong>
            <em>6 pasos</em>
          </div>
          <span className={styles.accChev}>
            <ChevronDown size={18} />
          </span>
        </div>
        <div className={styles.accBody}>
          <ol>
            <li>Coloca los 19 hexágonos de terreno bocarriba.</li>
            <li>Reparte los tokens de número en orden alfabético.</li>
            <li>Cada jugador toma 2 poblados, 2 carreteras y 4 ciudades.</li>
          </ol>
        </div>
      </div>

      <div className={styles.acc}>
        <div className={styles.accHead}>
          <span className={styles.accIc}>
            <RefreshCw size={18} />
          </span>
          <div className={styles.accTitles}>
            <strong>¿Cómo van los turnos?</strong>
            <em>3 fases</em>
          </div>
          <span className={styles.accChev}>
            <ChevronDown size={18} />
          </span>
        </div>
      </div>

      <div className={styles.acc}>
        <div className={styles.accHead}>
          <span className={styles.accIc}>
            <Crown size={18} />
          </span>
          <div className={styles.accTitles}>
            <strong>¿Cómo se gana?</strong>
            <em>10 PV</em>
          </div>
          <span className={styles.accChev}>
            <ChevronDown size={18} />
          </span>
        </div>
      </div>

      <div className={styles.acc}>
        <div className={styles.accHead}>
          <span className={styles.accIc}>
            <Check size={18} />
          </span>
          <div className={styles.accTitles}>
            <strong>Casos especiales</strong>
            <em>Ladrón · puerto · cartas</em>
          </div>
          <span className={styles.accChev}>
            <ChevronDown size={18} />
          </span>
        </div>
      </div>
    </div>
  );
}
