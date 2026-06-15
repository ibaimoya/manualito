import 'react';

/* Variables CSS ("--foo") tipadas en la prop "style": evita tener que
   castear a CSSProperties cada objeto con custom properties. */
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
