import { ACRONIMOS } from '../datos/acronimos';

/* Marca la primera sigla de cada sección para conservar su explicación en los enlaces directos. */

interface Nodo {
  type: string;
  tagName?: string;
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
    if (hijo.type === 'element' && hijo.tagName) {
      if (/^h[1-6]$/.test(hijo.tagName)) {
        vistas.clear();
      } else if (!ETIQUETAS_EXCLUIDAS.has(hijo.tagName)) {
        recorrer(hijo, vistas);
      }
      nuevos.push(hijo);
      continue;
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

function marcarSiglas(valor: string, vistas: Set<string>): Nodo[] | null {
  PATRON.lastIndex = 0;
  const partes: Nodo[] = [];
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;
  while ((coincidencia = PATRON.exec(valor))) {
    const sigla = coincidencia[1] as keyof typeof ACRONIMOS & string;
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
