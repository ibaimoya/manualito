import { type ReactNode, useId } from 'react';
import { RecoverySymbol } from './RecoverySymbol';
import styles from './recovery.module.css';

export type RecoveryKind = 'error' | 'not-found' | 'offline';

export function RecoveryContent({
  kind = 'error',
  retrying = false,
  headingLevel = 1,
  title,
  description,
  children,
}: Readonly<{
  kind?: RecoveryKind;
  retrying?: boolean;
  headingLevel?: 1 | 2;
  title: string;
  description: string;
  children?: ReactNode;
}>) {
  const titleId = useId();
  const Heading = headingLevel === 1 ? 'h1' : 'h2';

  return (
    <section className={styles.frame} aria-labelledby={titleId}>
      <div className={styles.content}>
        <RecoverySymbol kind={kind} retrying={retrying} />
        <Heading id={titleId} tabIndex={-1} className={styles.title}>
          {title}
        </Heading>
        <p className={styles.description}>{description}</p>
        {children}
      </div>
    </section>
  );
}
