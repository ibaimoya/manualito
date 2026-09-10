import { Icon, RefreshCw, Search, X } from 'lucide-react';
import { Meeple } from '@/shared/components/Brand';
import type { RecoveryKind } from './RecoveryContent';
import { useRecoveryGesture } from './useRecoveryGesture';
import styles from './recovery-symbol.module.css';

// CircleAlert de Lucide, con la exclamación independiente. Licencia en frontend/licenses/lucide.txt.
function AlertSymbol() {
  return (
    <Icon iconNode={[]} size={128} strokeWidth={1.4}>
      <circle cx="12" cy="12" r="10" />
      <g data-recovery-gesture="alert">
        <path d="M12 8v4M12 16h.01" />
      </g>
    </Icon>
  );
}

// WifiOff de Lucide, con ondas independientes. Licencia en frontend/licenses/lucide.txt.
function SignalSymbol() {
  return (
    <Icon iconNode={[]} size={128} strokeWidth={1.4}>
      <path d="M12 20h.01" />
      <g data-recovery-gesture="near">
        <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      </g>
      <g data-recovery-gesture="inner">
        <path d="M5 12.859a10 10 0 0 1 5.17-2.69M19 12.859a10 10 0 0 0-2.007-1.523" />
      </g>
      <g data-recovery-gesture="outer">
        <path d="M2 8.82a15 15 0 0 1 4.177-2.643M22 8.82a15 15 0 0 0-11.288-3.764" />
      </g>
      <path d="m2 2 20 20" />
    </Icon>
  );
}

function SearchSymbol() {
  return (
    <div className={styles.search}>
      <Search size={128} strokeWidth={1.4} />
      <div className={styles.lens}>
        <X size={42} strokeWidth={2} className={styles.cross} />
        <Meeple size={46} className={styles.meeple} />
      </div>
    </div>
  );
}

export function RecoverySymbol({
  kind,
  retrying,
}: Readonly<{ kind: RecoveryKind; retrying: boolean }>) {
  const scope = useRecoveryGesture(kind, retrying);

  return (
    <div ref={scope} className={styles.symbol} data-retrying={retrying} aria-hidden="true">
      <div className={styles.icon}>
        {kind === 'offline' ? (
          <SignalSymbol />
        ) : kind === 'not-found' ? (
          <SearchSymbol />
        ) : (
          <AlertSymbol />
        )}
      </div>
      <div className={styles.retry}>
        <RefreshCw size={112} strokeWidth={1.4} className="motion-safe:animate-spin" />
      </div>
    </div>
  );
}
