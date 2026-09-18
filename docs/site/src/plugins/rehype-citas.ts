import { BIBLIOGRAFIAS, textoPlano, type Seccion } from '../datos/bibliografia';

/* Anota las citas [n] con su referencia completa y avisa en build si derivan del bib. */

const SECCIONES: Seccion[] = ['memoria', 'anexos'];

interface Nodo {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Nodo[];
}

interface Archivo {
  path?: string;
}

export default function rehypeCitas() {
  return (arbol: Nodo, archivo: Archivo) => {
    const ruta = (archivo.path ?? '').replaceAll('\\', '/');
    const seccion = SECCIONES.find((s) => ruta.includes(`/${s}/`));
    if (!seccion) return;
    recorrer(arbol, ruta, seccion);
  };
}

function recorrer(nodo: Nodo, ruta: string, seccion: Seccion): void {
  if (!nodo.children) return;
  for (let i = 0; i < nodo.children.length; i++) {
    const hijo = nodo.children[i];
    if (!hijo) continue;
    if (esCita(nodo.children, i)) anotar(nodo.children, i, ruta, seccion);
    recorrer(hijo, ruta, seccion);
  }
}

/* Las referencias sin URL enlazan a su entrada en la bibliografía. */
function esCita(hermanos: Nodo[], indice: number): boolean {
  const nodo = hermanos[indice];
  if (nodo?.type !== 'element' || nodo.tagName !== 'a') return false;
  const href = String(nodo.properties?.href ?? '');
  if (
    !href.startsWith('http') &&
    !/^\/(?:memoria|anexos)\/bibliografia\/#ref-\d+$/.test(href)
  ) {
    return false;
  }
  const unico = nodo.children?.length === 1 ? nodo.children[0] : null;
  if (unico?.type !== 'text' || !/^\d+$/.test(unico.value ?? '')) return false;
  const previo = hermanos[indice - 1];
  const siguiente = hermanos[indice + 1];
  return (
    previo?.type === 'text' &&
    (previo.value ?? '').endsWith('[') &&
    siguiente?.type === 'text' &&
    (siguiente.value ?? '').startsWith(']')
  );
}

function anotar(hermanos: Nodo[], indice: number, ruta: string, seccion: Seccion): void {
  const enlace = hermanos[indice];
  const previo = hermanos[indice - 1];
  const siguiente = hermanos[indice + 1];
  if (!enlace || !previo || !siguiente) return;
  const numero = Number(enlace.children?.[0]?.value ?? '0');
  const referencia = BIBLIOGRAFIAS[seccion][numero - 1];
  if (!referencia) {
    console.warn(`[rehype-citas] la cita [${numero}] no existe en la bibliografía (${ruta})`);
    return;
  }
  const href = String(enlace.properties?.href ?? '');
  if (referencia.url && href !== referencia.url) {
    console.warn(
      `[rehype-citas] la cita [${numero}] enlaza a ${href} pero el bib dice ${referencia.url} (${ruta})`,
    );
  }
  // Los corchetes pasan dentro del enlace, así la diana y la píldora los abarcan.
  previo.value = (previo.value ?? '').slice(0, -1);
  siguiente.value = (siguiente.value ?? '').slice(1);
  enlace.children = [{ type: 'text', value: `[${numero}]` }];
  enlace.properties = {
    ...enlace.properties,
    className: ['cita'],
    dataExpansion: textoPlano(referencia),
    dataDestino: `/${seccion}/bibliografia/#ref-${referencia.numero}`,
    title: textoPlano(referencia),
  };
}
