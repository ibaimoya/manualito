import fuenteAnexos from './bibliografia-anexos.bib?raw';
import fuenteMemoria from './bibliografia-memoria.bib?raw';

/* Referencias del TFG ordenadas por su primera cita en cada documento. */

export type Seccion = 'memoria' | 'anexos';

export interface Referencia {
  numero: number;
  clave: string;
  autores: string;
  titulo: string;
  detalle: string;
  url?: string;
  campos: Readonly<Record<string, string>>;
}

const CAMPOS_PUBLICACION = ['howpublished', 'publisher', 'journal', 'organization'];
const CAMPOS_METADATA = [
  ['date', 'Fecha'],
  ['note', 'Nota'],
  ['urldate', 'Consulta'],
  ['journaltitle', 'Revista'],
  ['booktitle', 'En'],
  ['institution', 'Institución'],
  ['type', 'Tipo'],
  ['number', 'Número'],
  ['volume', 'Volumen'],
  ['pages', 'Páginas'],
  ['pagetotal', 'Páginas totales'],
  ['edition', 'Edición'],
  ['location', 'Lugar'],
  ['month', 'Mes'],
  ['eid', 'Identificador'],
  ['eprint', 'ePrint'],
  ['eprintclass', 'Clase ePrint'],
  ['eprinttype', 'Tipo ePrint'],
  ['version', 'Versión'],
  ['doi', 'DOI'],
  ['isbn', 'ISBN'],
  ['editor', 'Editor'],
] as const;

function limpiarValor(bruto: string): string {
  return bruto
    .replaceAll('\\url', '')
    .replaceAll(/[{}]/g, '')
    .replaceAll(/\\"([A-Za-z])/g, '$1\u0308')
    .normalize('NFC')
    .replaceAll('---', '-')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
}

/* Lee un valor entre llaves anidadas o comillas a partir del signo igual. */
function leerValor(fuente: string, desde: number): { valor: string; fin: number } | null {
  let i = desde;
  while (i < fuente.length && /\s/.test(fuente[i] ?? '')) i++;
  const apertura = fuente[i];
  if (apertura === '"') {
    const cierre = fuente.indexOf('"', i + 1);
    if (cierre < 0) return null;
    return { valor: fuente.slice(i + 1, cierre), fin: cierre + 1 };
  }
  if (apertura === '{') {
    let profundidad = 0;
    for (let j = i; j < fuente.length; j++) {
      if (fuente[j] === '{') profundidad++;
      if (fuente[j] === '}') profundidad--;
      if (profundidad === 0) return { valor: fuente.slice(i + 1, j), fin: j + 1 };
    }
    return null;
  }
  const cierre = fuente.slice(i).search(/[,\n}]/);
  if (cierre < 0) return null;
  return { valor: fuente.slice(i, i + cierre), fin: i + cierre };
}

function parsearBib(fuente: string): Referencia[] {
  const referencias: Referencia[] = [];
  const patronEntrada = /@\w+\s*\{\s*([^,\s]+)\s*,/g;
  let entrada: RegExpExecArray | null;
  while ((entrada = patronEntrada.exec(fuente))) {
    const clave = entrada[1] ?? '';
    const campos: Record<string, string> = {};
    let i = entrada.index + entrada[0].length;
    const patronCampo = /([a-zA-Z]+)\s*=/g;
    patronCampo.lastIndex = i;
    let campo: RegExpExecArray | null;
    while ((campo = patronCampo.exec(fuente))) {
      const siguienteEntrada = fuente.indexOf('@', i);
      if (siguienteEntrada >= 0 && campo.index > siguienteEntrada) break;
      const leido = leerValor(fuente, campo.index + campo[0].length);
      if (!leido) break;
      campos[(campo[1] ?? '').toLowerCase()] = leido.valor;
      patronCampo.lastIndex = leido.fin;
      i = leido.fin;
    }

    const publicaciones = CAMPOS_PUBLICACION.map((campo) => limpiarValor(campos[campo] ?? ''))
      .filter(Boolean)
      .filter((valor) => !valor.includes('http'));
    // La URL ya se muestra aparte, un campo de publicación que la repita sobra.
    const fecha = limpiarValor(campos.year ?? '');
    const trozos = [...publicaciones, fecha].filter(Boolean);
    const metadatos = CAMPOS_METADATA.map(([campo, etiqueta]) => {
      const valor = limpiarValor(campos[campo] ?? '');
      return valor ? `${etiqueta}: ${valor}` : '';
    }).filter(Boolean);
    const referencia: Referencia = {
      numero: referencias.length + 1,
      clave,
      autores: limpiarValor(campos.author ?? '').replaceAll(' and ', ' y '),
      titulo: limpiarValor(campos.title ?? ''),
      detalle: [...trozos, ...metadatos].join(', '),
      url: campos.url?.trim() || undefined,
      campos: { ...campos },
    };
    referencias.push(referencia);
  }
  return referencias;
}

/* Añade el punto de cierre salvo tras interrogación o exclamación. */
export function puntuar(texto: string): string {
  return /[?!]$/.test(texto) ? texto : `${texto}.`;
}

export function textoPlano(referencia: Referencia): string {
  return [referencia.autores, referencia.titulo, referencia.detalle]
    .filter(Boolean)
    .map(puntuar)
    .join(' ');
}

export const BIBLIOGRAFIA_MEMORIA: Referencia[] = parsearBib(fuenteMemoria);
export const BIBLIOGRAFIA_ANEXOS: Referencia[] = parsearBib(fuenteAnexos);

export const BIBLIOGRAFIAS: Record<Seccion, Referencia[]> = {
  memoria: BIBLIOGRAFIA_MEMORIA,
  anexos: BIBLIOGRAFIA_ANEXOS,
};
