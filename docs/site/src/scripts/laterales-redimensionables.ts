import { animate, motionValue, resize } from 'motion';

import {
  ANCHO_CONTENIDO_REM,
  ANCHO_INICIAL,
  ANCHO_MAXIMO,
  ANCHO_MINIMO,
  CLAVE_ANCHO,
  CONSULTA_ESCRITORIO,
  EXCESO_MAXIMO,
  MARGEN_CONTENIDO,
  RANGO_REDIMENSIONABLE_MINIMO,
} from './configuracion-laterales';

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(Math.max(valor, minimo), maximo);

export const iniciarRedimensionadoresLaterales = () => {
  const raiz = document.documentElement;
  const tirador = document.querySelector<HTMLElement>('[data-redimensionador-lateral]');
  if (!tirador) return;

  const escritorio = matchMedia(CONSULTA_ESCRITORIO);
  const menosMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const exceso = motionValue(0);
  let anchoPreferido = ANCHO_INICIAL;
  let ancho = ANCHO_INICIAL;
  let maximo = ANCHO_MAXIMO;
  let anchoScrollbar = Math.max(0, innerWidth - raiz.clientWidth);
  let rebote: { stop: VoidFunction } | undefined;
  let arrastre:
    | { puntero: number; x: number; ancho: number }
    | undefined;

  try {
    const guardado = Number.parseFloat(localStorage.getItem(CLAVE_ANCHO) ?? '');
    if (Number.isFinite(guardado)) anchoPreferido = guardado;
  } catch {
    anchoPreferido = ANCHO_INICIAL;
  }

  exceso.on('change', (valor) => {
    raiz.style.setProperty('--m-exceso-navegacion', `${valor}px`);
  });

  const actualizarAria = () => {
    const valor = Math.round(ancho);
    tirador.setAttribute('aria-valuemin', String(ANCHO_MINIMO));
    tirador.setAttribute('aria-valuemax', String(maximo));
    tirador.setAttribute('aria-valuenow', String(valor));
    tirador.setAttribute(
      'aria-valuetext',
      valor === ANCHO_INICIAL
        ? `${valor} píxeles, tamaño predeterminado`
        : `${valor} píxeles`,
    );
  };

  const aplicarAncho = (valor: number) => {
    ancho = limitar(valor, ANCHO_MINIMO, maximo);
    raiz.style.setProperty('--m-ancho-navegacion', `${ancho}px`);
    actualizarAria();
  };

  const guardar = () => {
    anchoPreferido = ancho;
    try {
      localStorage.setItem(CLAVE_ANCHO, String(Math.round(ancho)));
    } catch {
      return;
    }
  };

  const restablecer = () => {
    anchoPreferido = ANCHO_INICIAL;
    rebote?.stop();
    aplicarAncho(ANCHO_INICIAL);
    exceso.jump(0);
    try {
      localStorage.removeItem(CLAVE_ANCHO);
    } catch {
      return;
    }
  };

  const devolverExceso = () => {
    rebote?.stop();
    if (menosMovimiento.matches) {
      exceso.jump(0);
      return;
    }
    rebote = animate(exceso, 0, {
      type: 'spring',
      stiffness: 520,
      damping: 30,
      mass: 0.6,
    });
  };

  const mover = (x: number) => {
    if (!arrastre) return;
    const deseado = arrastre.ancho + x - arrastre.x;
    aplicarAncho(deseado);
    rebote?.stop();
    const distancia = deseado - ancho;
    const elastico = menosMovimiento.matches
      ? 0
      : Math.sign(distancia) *
        EXCESO_MAXIMO *
        (1 - Math.exp(-Math.abs(distancia) / 42));
    exceso.jump(elastico);
  };

  const terminar = (cancelar = false) => {
    if (!arrastre) return;
    const anterior = arrastre;
    arrastre = undefined;
    tirador.removeAttribute('data-arrastrando');
    raiz.removeAttribute('data-redimensionando');
    if (cancelar) aplicarAncho(anterior.ancho);
    else guardar();
    devolverExceso();
    if (tirador.hasPointerCapture(anterior.puntero)) {
      tirador.releasePointerCapture(anterior.puntero);
    }
    // El focus programático del agarre queda como focus-visible y dejaría la pastilla encendida.
    if (document.activeElement === tirador) tirador.blur();
  };

  const actualizarEntorno = () => {
    if (arrastre) terminar(true);
    rebote?.stop();
    exceso.jump(0);
    const pxRaiz = Number.parseFloat(getComputedStyle(raiz).fontSize) || 16;
    anchoScrollbar = Math.max(anchoScrollbar, innerWidth - raiz.clientWidth);
    const anchoDisponible = innerWidth - anchoScrollbar;
    raiz.style.setProperty('--m-ancho-disponible', `${anchoDisponible}px`);
    maximo = Math.floor(
      Math.min(
        ANCHO_MAXIMO,
        (anchoDisponible - ANCHO_CONTENIDO_REM * pxRaiz) / 2 - MARGEN_CONTENIDO,
      ),
    );
    const disponible =
      escritorio.matches &&
      raiz.hasAttribute('data-has-sidebar') &&
      maximo - ANCHO_MINIMO >= RANGO_REDIMENSIONABLE_MINIMO;

    tirador.hidden = !disponible;
    raiz.toggleAttribute('data-laterales-preparados', disponible);
    if (!disponible) return;
    aplicarAncho(anchoPreferido);
  };

  tirador.addEventListener('pointerdown', (evento) => {
    if (!evento.isPrimary || evento.button !== 0 || tirador.hidden) return;
    evento.preventDefault();
    tirador.focus({ preventScroll: true });
    rebote?.stop();
    exceso.jump(0);
    arrastre = { puntero: evento.pointerId, x: evento.clientX, ancho };
    tirador.setPointerCapture(evento.pointerId);
    tirador.setAttribute('data-arrastrando', '');
    raiz.setAttribute('data-redimensionando', '');
  });

  tirador.addEventListener('pointermove', (evento) => {
    if (evento.pointerId === arrastre?.puntero) mover(evento.clientX);
  });

  tirador.addEventListener('pointerup', (evento) => {
    if (evento.pointerId !== arrastre?.puntero) return;
    mover(evento.clientX);
    terminar();
  });

  tirador.addEventListener('pointercancel', (evento) => {
    if (evento.pointerId === arrastre?.puntero) terminar(true);
  });
  tirador.addEventListener('lostpointercapture', (evento) => {
    if (evento.pointerId === arrastre?.puntero) terminar(true);
  });
  tirador.addEventListener('dblclick', restablecer);
  tirador.addEventListener('keydown', (evento) => {
    const paso = evento.shiftKey ? 32 : 8;
    const cambios: Partial<Record<string, number>> = {
      ArrowLeft: ancho - paso,
      ArrowRight: ancho + paso,
      Home: ANCHO_MINIMO,
      End: maximo,
      Enter: ANCHO_INICIAL,
    };

    if (evento.key === 'Escape' && arrastre) {
      evento.preventDefault();
      terminar(true);
      return;
    }
    if (!(evento.key in cambios)) return;

    evento.preventDefault();
    if (evento.key === 'Enter') restablecer();
    else {
      rebote?.stop();
      exceso.jump(0);
      aplicarAncho(cambios[evento.key] ?? ancho);
      guardar();
    }
  });

  resize(actualizarEntorno);
  escritorio.addEventListener('change', actualizarEntorno);
  menosMovimiento.addEventListener('change', () => exceso.jump(0));
  // Con la pestaña oculta el muelle se congela y la franja elástica quedaría pintada.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !arrastre) {
      rebote?.stop();
      exceso.jump(0);
    }
  });
  addEventListener('blur', () => terminar(true));
  addEventListener('pageshow', actualizarEntorno);
  actualizarEntorno();
};
