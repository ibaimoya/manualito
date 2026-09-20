import { animate } from 'motion';

// Adaptación para Starlight de https://www.rareui.com/components/hooksidebar.
export function iniciarMenuCapitulos(contenedor: HTMLElement) {
  const eventos = new AbortController();
  const { signal } = eventos;
  const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const grupos = contenedor.querySelectorAll<HTMLDetailsElement>('details');
  const actualizaciones: (() => void)[] = [];
  const selecciones: ((ruta: string, animar: boolean) => void)[] = [];
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

    lista.addEventListener('pointerover', señalar, { signal });
    lista.addEventListener('focusin', señalar, { signal });
    lista.addEventListener('pointerleave', () => {
      señalado = lista.querySelector('a:focus-visible');
      actualizar();
    }, { signal });
    lista.addEventListener('focusout', () => {
      señalado = lista.querySelector('a:hover');
      actualizar();
    }, { signal });
    grupo.addEventListener('toggle', () => {
      señalado = null;
      actualizar();
    }, { signal });
    selecciones.push((ruta, animar) => {
      activo = null;
      for (const enlace of lista.querySelectorAll('a')) {
        if (enlace.pathname === ruta) {
          enlace.setAttribute('aria-current', 'page');
          activo = enlace;
        } else enlace.removeAttribute('aria-current');
      }
      if (activo) grupo.open = true;
      señalado = null;
      actualizar(animar);
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

  function seleccionar(ruta: string, animar = true) {
    for (const seleccionarGrupo of selecciones) seleccionarGrupo(ruta, animar);
  }

  seleccionar(location.pathname, false);
  document.addEventListener('astro:before-swap', (evento) => {
    seleccionar(evento.to.pathname);
  }, { signal });
  document.addEventListener('astro:page-load', () => {
    seleccionar(location.pathname);
  }, { signal });
  menosMovimiento.addEventListener('change', () => {
    for (const actualizar of actualizaciones) actualizar();
  }, { signal });

  return () => {
    eventos.abort();
    observador.disconnect();
    for (const riel of contenedor.querySelectorAll('.riel-menu')) {
      for (const animacion of riel.getAnimations()) animacion.cancel();
      riel.remove();
    }
  };
}
