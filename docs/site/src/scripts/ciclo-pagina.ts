export function alCambiarPagina(iniciar: () => (() => void) | void) {
  let limpiar: (() => void) | void;

  document.addEventListener('astro:page-load', () => {
    limpiar?.();
    limpiar = iniciar();
  });
  document.addEventListener('astro:before-swap', () => {
    limpiar?.();
    limpiar = undefined;
  });
}
