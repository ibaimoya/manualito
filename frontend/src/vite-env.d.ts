/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

/* @fontsource-variable/* exporta solo CSS — declarar como side-effect import. */
declare module '@fontsource-variable/manrope';
declare module '@fontsource-variable/inter';
declare module '@fontsource-variable/jetbrains-mono';

/* CSS modules (.module.css) — tipado genérico. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
