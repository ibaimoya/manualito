import fuenteAnexos from './bibliografia-anexos.bib?raw';

/* Copia de bibliografiaAnexos.bib del TFG, mantener ambas en paralelo. */

export interface Referencia {
  numero: number;
  clave: string;
  autores: string;
  titulo: string;
  detalle: string;
  url?: string;
}

const CAMPOS_PUBLICACION = ['howpublished', 'publisher', 'journal', 'organization'];

function limpiarValor(bruto: string): string {
  return bruto
    .replaceAll('\\url', '')
    .replaceAll(/[{}]/g, '')
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

    const publicacion = CAMPOS_PUBLICACION.map((c) => campos[c]).find(Boolean) ?? '';
    // La URL ya se muestra aparte, un campo de publicación que la repita sobra.
    const trozos = [limpiarValor(publicacion), limpiarValor(campos.year ?? '')].filter(
      (trozo) => Boolean(trozo) && !trozo.includes('http'),
    );
    referencias.push({
      numero: referencias.length + 1,
      clave,
      autores: limpiarValor(campos.author ?? '').replaceAll(' and ', ' y '),
      titulo: limpiarValor(campos.title ?? ''),
      detalle: trozos.join(', '),
      url: campos.url?.trim() || undefined,
    });
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

export const BIBLIOGRAFIA_ANEXOS: Referencia[] = parsearBib(fuenteAnexos);
