import { type ReactNode, useEffect, useRef } from 'react';
import styles from './auth-status.module.css';

export function AuthStatus({
  title,
  body,
  footnote,
  children,
}: Readonly<{
  title: string;
  body: ReactNode;
  footnote?: string;
  children?: ReactNode;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.root}>
      <h1 ref={heading} tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      <p className={styles.body}>{body}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}
    </div>
  );
}
