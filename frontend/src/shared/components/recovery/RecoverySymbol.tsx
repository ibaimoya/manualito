import {
  ArrowsClockwiseIcon,
  IconBase,
  MagnifyingGlassIcon,
  XIcon,
  type IconWeight,
} from '@phosphor-icons/react';
import type { ReactElement } from 'react';
import { Meeple } from '@/shared/components/Brand';
import type { RecoveryKind } from './RecoveryContent';
import { useRecoveryGesture } from './useRecoveryGesture';
import styles from './recovery-symbol.module.css';

// Trazados de Phosphor 2.1.10 (MIT), separados para animar sus piezas.

// WarningCircle: anillo fijo y exclamación (barra y punto) independiente.
// Se dibuja algo mayor que los demás para compensar su anillo interior.
const ALERT = new Map<IconWeight, ReactElement>([
  [
    'regular',
    <>
      <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z" />
      <g data-recovery-gesture="alert">
        <path d="M120,136V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Z" />
        <path d="M140,172a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z" />
      </g>
    </>,
  ],
]);

function AlertSymbol() {
  return <IconBase size={140} weight="regular" weights={ALERT} className={styles.alert} />;
}

// Las ondas se prolongan 4 unidades bajo la barra para evitar huecos al moverse.
const SIGNAL = new Map<IconWeight, ReactElement>([
  [
    'regular',
    <>
      <g data-recovery-gesture="near">
        <path d="M83.25,158.54A75.43,75.43,0,0,1,137.74,144.66L160.28,169.45A60,60,0,0,0,92.67,171.47A8,8,0,1,1,83.25,158.54Z" />
      </g>
      <g data-recovery-gesture="inner">
        <path d="M51,122.77A124.27,124.27,0,0,1,97.05,99.91L109.49,113.59A108,108,0,0,0,61,135.31A8,8,0,0,1,49.73,134A8,8,0,0,1,51,122.77Z" />
        <path d="M195,135.31a8,8,0,0,0,11.24-1.3,8,8,0,0,0-1.3-11.24,124.25,124.25,0,0,0-51.73-24.2A8,8,0,1,0,150,114.24,108.12,108.12,0,0,1,195,135.31Z" />
      </g>
      <g data-recovery-gesture="outer">
        <path d="M18.92,87A171.87,171.87,0,0,1,61.86,61.19L73.36,73.84A155.43,155.43,0,0,0,29.08,99.4A8,8,0,0,1,18.92,87Z" />
        <path d="M237.08,87A172.3,172.3,0,0,0,106,49.4a8,8,0,1,0,2,15.87A158.33,158.33,0,0,1,128,64a156.25,156.25,0,0,1,98.92,35.37A8,8,0,0,0,237.08,87Z" />
      </g>
      <path d="M128,192a12,12,0,1,0,12,12A12,12,0,0,0,128,192Z" />
      <path d="M42.08,45.38A8,8,0,1,1,53.92,34.62L213.92,210.62A8,8,0,1,1,202.08,221.38Z" />
    </>,
  ],
]);

function SignalSymbol() {
  return <IconBase size={128} weight="regular" weights={SIGNAL} />;
}

function SearchSymbol() {
  return (
    <div className={styles.search}>
      <MagnifyingGlassIcon size={128} weight="regular" />
      <div className={styles.lens}>
        <XIcon size={42} weight="regular" className={styles.cross} />
        <Meeple size={46} className={styles.meeple} />
      </div>
    </div>
  );
}

const symbols = { offline: SignalSymbol, 'not-found': SearchSymbol, error: AlertSymbol };

export function RecoverySymbol({
  kind,
  retrying,
}: Readonly<{ kind: RecoveryKind; retrying: boolean }>) {
  const scope = useRecoveryGesture(kind, retrying);
  const Symbol = symbols[kind];

  return (
    <div ref={scope} className={styles.symbol} data-retrying={retrying} aria-hidden="true">
      <div className={styles.icon}>
        <Symbol />
      </div>
      <div className={styles.retry}>
        <ArrowsClockwiseIcon size={112} weight="regular" className="motion-safe:animate-spin" />
      </div>
    </div>
  );
}
