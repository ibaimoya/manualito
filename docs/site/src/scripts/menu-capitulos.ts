import { animate } from 'motion';

// Adaptación para Starlight de https://www.rareui.com/components/hooksidebar.
export function iniciarMenuCapitulos() {
  const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const grupos = document.querySelectorAll<HTMLDetailsElement>('.menu-capitulos details');
  const actualizaciones: (() => void)[] = [];
  const observador = new ResizeObserver(() => {
    for (const actualizar of actualizaciones) actualizar();
  });

  for (const grupo of grupos) {
    const lista = grupo.querySelector<HTMLUListElement>(':scope > ul');
    if (!lista) continue;
    let activo = lista.querySelector<HTMLAnchorElement>('a[aria-current="page"]');
    let señalado: HTMLAnchorElement | null = null;
    const principal = crearRiel('riel-activo');
    const secundario = crearRiel('riel-señalado');
    lista.append(secundario, principal);

    function centro(enlace: HTMLAnchorElement | null) {
      if (!enlace) return 0;
      return enlace.offsetTop + enlace.offsetHeight / 2;
    }

    function actualizar(animar = false) {
      if (!grupo.open) return;
      const alturaActiva = centro(activo);
      const alturaSeñalada = centro(señalado);
      mover(principal, alturaActiva, 0, animar);
      mover(secundario, alturaSeñalada, Math.min(alturaActiva, alturaSeñalada - 7), animar);
      principal.hidden = !activo;
      secundario.hidden = !señalado || señalado === activo;
    }

    function señalar(evento: Event) {
      const destino = evento.target;
      señalado = destino instanceof Element ? destino.closest('a') : null;
      actualizar(true);
    }

    lista.addEventListener('pointerover', señalar);
    lista.addEventListener('focusin', señalar);
    lista.addEventListener('pointerleave', () => {
      señalado = lista.querySelector('a:focus-visible');
      actualizar();
    });
    lista.addEventListener('focusout', () => {
      señalado = lista.querySelector('a:hover');
      actualizar();
    });
    lista.addEventListener('click', (evento) => {
      const otraVentana = evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey;
      if (evento.button !== 0 || otraVentana) return;
      const destino = evento.target;
      if (!(destino instanceof Element)) return;
      const enlace = destino.closest('a');
      if (!enlace) return;
      activo = enlace;
      actualizar(true);
    });
    grupo.addEventListener('toggle', () => {
      señalado = null;
      actualizar();
    });
    actualizaciones.push(actualizar);
    observador.observe(lista);
    actualizar();
  }

  function crearRiel(clase: string) {
    const riel = document.createElement('li');
    riel.className = `riel-menu ${clase}`;
    riel.setAttribute('aria-hidden', 'true');
    return riel;
  }

  function mover(riel: HTMLElement, altura: number, inicio: number, animar: boolean) {
    animate(
      riel,
      { height: altura, clipPath: `inset(${Math.max(0, inicio)}px 0 0 0)` },
      animar && !menosMovimiento.matches
        ? { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
        : { duration: 0 },
    );
  }

  menosMovimiento.addEventListener('change', () => {
    for (const actualizar of actualizaciones) actualizar();
  });
  addEventListener('pagehide', (evento) => {
    if (!evento.persisted) observador.disconnect();
  });
}
