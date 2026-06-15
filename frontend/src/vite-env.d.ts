/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_MAILPIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/* @fontsource-variable/* exporta solo CSS — declarar como side-effect import. */
declare module '@fontsource-variable/manrope';
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/jetbrains-mono';

/* CSS modules (.module.css) — tipado genérico. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
