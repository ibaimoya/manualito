import { ACRONIMOS } from '../datos/acronimos';

/* Marca la primera sigla de cada sección para conservar su explicación en los enlaces directos. */

interface Nodo {
  type: string;
  tagName?: string;
  name?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Nodo[];
}

const ETIQUETAS_EXCLUIDAS = new Set(['code', 'pre', 'a', 'abbr', 'script', 'style']);
const PATRON = new RegExp(`\\b(${Object.keys(ACRONIMOS).join('|')})\\b`, 'g');

export default function rehypeAcronimos() {
  return (arbol: Nodo) => {
    recorrer(arbol, new Set<string>());
  };
}

function recorrer(nodo: Nodo, vistas: Set<string>): void {
  if (!nodo.children) return;
  const nuevos: Nodo[] = [];
  for (const hijo of nodo.children) {
    const etiqueta = etiquetaNodo(hijo);
    if (/^h[1-6]$/.test(etiqueta)) {
      vistas.clear();
    } else if (!ETIQUETAS_EXCLUIDAS.has(etiqueta)) {
      recorrer(hijo, vistas);
    }
    if (hijo.type === 'text' && hijo.value) {
      const partes = marcarSiglas(hijo.value, vistas);
      if (partes) {
        nuevos.push(...partes);
        continue;
      }
    }
    nuevos.push(hijo);
  }
  nodo.children = nuevos;
}

function etiquetaNodo(nodo: Nodo): string {
  if (nodo.tagName) return nodo.tagName;
  if (nodo.type === 'mdxJsxFlowElement' || nodo.type === 'mdxJsxTextElement') {
    return nodo.name?.toLowerCase() ?? '';
  }
  return '';
}

function marcarSiglas(valor: string, vistas: Set<string>): Nodo[] | null {
  PATRON.lastIndex = 0;
  const partes: Nodo[] = [];
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = PATRON.exec(valor))) {
    const sigla = coincidencia[1] as string;
    if (vistas.has(sigla)) continue;
    vistas.add(sigla);
    if (coincidencia.index > ultimo) {
      partes.push({ type: 'text', value: valor.slice(ultimo, coincidencia.index) });
    }
    partes.push({
      type: 'element',
      tagName: 'abbr',
      properties: {
        className: ['acronimo'],
        dataExpansion: ACRONIMOS[sigla],
        title: ACRONIMOS[sigla],
        tabIndex: 0,
      },
      children: [{ type: 'text', value: sigla }],
    });
    ultimo = coincidencia.index + sigla.length;
  }
  if (partes.length === 0) return null;
  if (ultimo < valor.length) partes.push({ type: 'text', value: valor.slice(ultimo) });
  return partes;
}
