import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
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
import { storage } from '@/shared/lib/storage';
import { cn } from '@/shared/lib/cn';
import styles from './onboarding.module.css';

const WORD = 'MANUALITO';

interface Slide {
  kind: 'hero' | 'step';
  id?: 'foto' | 'procesa' | 'entiende';
  n?: number;
  title?: string;
  sub?: string;
}

const SLIDES: Slide[] = [
  { kind: 'hero' },
  {
    kind: 'step',
    id: 'foto',
    n: 1,
    title: 'Hazle una foto',
    sub: 'Captura las páginas del manual con la cámara. Da igual el orden — Manualito las cose por ti.',
  },
  {
    kind: 'step',
    id: 'procesa',
    n: 2,
    title: 'Lo entiende por ti',
    sub: 'Leemos el texto, buscamos contexto y generamos una explicación clara — todo en segundos.',
  },
  {
    kind: 'step',
    id: 'entiende',
    n: 3,
    title: 'Te lo explica con calma',
    sub: 'Resumen, secciones colapsables y un chat para resolver dudas mientras jugáis.',
  },
];

export function Onboarding() {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const N = SLIDES.length;
  const heroPlaying = index === 0;

  function go(next: number): void {
    setIndex(Math.max(0, Math.min(N - 1, next)));
  }

  // Guard anti-spam: si el usuario pulsa "Empezar"/"Entrar a la app"
  // varias veces rápido, `document.startViewTransition` se invocaría 2x
  // y la 2ª transición arranca antes de que la 1ª termine → glitch
  // visual.  Catálogo bug #5.
  const enteringRef = useRef(false);

  function enterApp(): void {
    if (enteringRef.current) return;
    enteringRef.current = true;
    storage.markOnboardingSeen();

    const navigateNow = () => void navigate({ to: '/home', replace: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const docAny = document as Document & {
      startViewTransition?: (cb: () => void) => {
        finished: Promise<void>;
      };
    };

    if (!reduced && typeof docAny.startViewTransition === 'function') {
      const transition = docAny.startViewTransition(() => flushSync(navigateNow));
      // Limpiamos el flag cuando la transición acaba (éxito o cancelación)
      // para permitir reintentos si el usuario regresa al onboarding.
      transition.finished.finally(() => {
        enteringRef.current = false;
      });
    } else {
      navigateNow();
      enteringRef.current = false;
    }
  }

  function next(): void {
    if (index < N - 1) {
      go(index + 1);
      return;
    }
    enterApp();
  }

  function skip(): void {
    enterApp();
  }

  // Navegación con teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Enter') next();
      else if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

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

      <div className={styles.track} style={{ transform: `translateX(${-index * 100}vw)` }}>
        {/* — Slide 0: Hero — */}
        <section className={styles.slide} aria-label="Manualito · presentación">
          <div className={styles.hero}>
            <span className={cn(styles.eyebrowTop, heroPlaying && styles.isIn)}>
              UNA APP DE MESA
            </span>
            <HeroWordmark playing={heroPlaying} />
            <p className={cn(styles.tagline, heroPlaying && styles.isIn)}>
              Explica cualquier manual de juego de mesa en segundos.
            </p>
            <button
              type="button"
              className={cn(styles.pill, heroPlaying && styles.isIn)}
              onClick={next}
              style={{ '--vt': index === 0 ? 'cta-pill' : 'none' } as CSSProperties}
            >
              Empezar
              <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 22, lineHeight: 1 }}>
                →
              </span>
            </button>
            <span className={cn(styles.scrollhint, heroPlaying && styles.isIn)}>
              Desliza · 3 pasos · 20 s
            </span>
          </div>
        </section>

        {/* — Slides 1..3 — */}
        {SLIDES.slice(1).map((s, idx) => {
          const slideIdx = idx + 1;
          const active = index === slideIdx;
          const isLast = slideIdx === N - 1;
          return (
            <section
              key={s.id}
              className={styles.slide}
              aria-label={`Paso ${s.n}: ${s.title}`}
            >
              <div className={styles.step}>
                <div className={styles.stepCopy}>
                  <span className={styles.stepNum}>
                    <span>{String(s.n).padStart(2, '0')}</span>
                    <span>/</span>
                    <span style={{ opacity: 0.5 }}>03</span>
                  </span>
                  <h2 className={cn(styles.stepTitle, active && styles.isIn)}>{s.title}</h2>
                  <p className={cn(styles.stepSub, active && styles.isIn)}>{s.sub}</p>
                  <button
                    type="button"
                    className={cn(styles.pill, active && styles.isIn)}
                    onClick={next}
                    style={{
                      '--vt': isLast && active ? 'cta-pill' : 'none',
                    } as CSSProperties}
                  >
                    {isLast ? 'Entrar a la app' : 'Siguiente'}
                    <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 22, lineHeight: 1 }}>
                      →
                    </span>
                  </button>
                </div>
                <div className={styles.stepArt}>
                  {s.id === 'foto' ? (
                    <StepFoto active={active} />
                  ) : s.id === 'procesa' ? (
                    <StepProcesa active={active} />
                  ) : (
                    <StepEntiende active={active} />
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.pager} role="tablist" aria-label="Pasos del onboarding">
        {SLIDES.map((_, k) => (
          <button
            key={k}
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

function HeroWordmark({ playing }: { playing: boolean }) {
  return (
    <h1 aria-label="Manualito" className={styles.heroWord}>
      {WORD.split('').map((ch, i) => (
        <span key={i} className={styles.letterMask}>
          <span
            className={cn(styles.letter, playing && styles.letterIn)}
            style={{ '--i': i } as CSSProperties}
          >
            {ch}
          </span>
        </span>
      ))}
    </h1>
  );
}

/* — Slide 1: Foto — viewfinder con página detectada — */
function StepFoto({ active }: { active: boolean }) {
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
        <span className={styles.mono}>P. 4 / —</span>
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
          {[88, 95, 70, 90, 60, 92, 80, 56].map((w, i) => (
            <div
              key={i}
              style={{
                height: 4,
                width: `${w}%`,
                background: 'rgba(31,22,17,0.55)',
                borderRadius: 1.5,
                marginBottom: 4,
              }}
            />
          ))}
          {[
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ].map(([x, y], i) => (
            <span
              key={i}
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
          Página detectada
        </div>
      </div>

      <div className={styles.thumbs}>
        {active &&
          [1, 2, 3].map((n) => (
            <div
              key={n}
              className={styles.thumb}
              style={{ '--d': `${n * 200}ms` } as CSSProperties}
            >
              <span className={styles.thumbNum}>{n}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

/* — Slide 2: Procesa — pipeline OCR→RAG→LLM — */
function StepProcesa({ active }: { active: boolean }) {
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
              style={
                active
                  ? ({ '--d': `${i * 280}ms` } as CSSProperties)
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
                  active
                    ? ({ '--d': `${i * 280 + 140}ms` } as CSSProperties)
                    : { animation: 'none', opacity: 0 }
                }
              >
                <span className={styles.linkPulse} />
              </div>
            ) : null}
          </span>
        ))}
      </div>
      <div className={styles.tokens} aria-hidden="true">
        {active &&
          ['Setup', '→', 'turno', '→', 'ganar', '↦', '10 PV'].map((t, i) => (
            <span
              key={i}
              className={styles.token}
              style={{ '--d': `${600 + i * 90}ms` } as CSSProperties}
            >
              {t}
            </span>
          ))}
      </div>
    </div>
  );
}

/* — Slide 3: Entiende — preview de accordions — */
function StepEntiende({ active }: { active: boolean }) {
  // active no se usa visualmente aquí (sin animación específica), pero
  // lo aceptamos para uniformidad con los otros componentes Step.
  void active;
  return (
    <div className={styles.cardStack}>
      <div className={styles.summary}>
        <span className={styles.eyebrow}>RESUMEN</span>
        <p>
          Construyes una isla con poblados y ciudades para sumar <strong>10 puntos</strong>.
          Tiras dados, recibes recursos y comercias.
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
            <strong>El turno</strong>
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
            <strong>Cómo se gana</strong>
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
