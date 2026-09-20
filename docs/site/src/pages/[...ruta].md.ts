import type { APIRoute, ImageMetadata, InferGetStaticPropsType } from 'astro';
import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';

import { tieneVersionMd } from '../datos/paginas-md';
import { panelesBenchmark, numero, type TipoBenchmark } from '../datos/benchmarks';
import { figurasCodigo } from '../datos/figuras-codigo';

/* Expone cada entrada de documentación bajo su misma ruta con extensión .md. */
export async function getStaticPaths() {
  const entradas = await getCollection('docs', tieneVersionMd);
  return entradas.map((entrada) => ({ params: { ruta: entrada.id }, props: { entrada } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const PATRON_IMPORTACION = /^import\s+([^;]+?)\s+from\s+'([^']+)';\r?\n?/gm;
const PATRON_FIGURA = /<Figura(?:Vector)?\b([\s\S]*?)>([\s\S]*?)<\/Figura(?:Vector)?>/g;
const imagenes = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{avif,gif,jpeg,jpg,png,webp}',
);
const svg = import.meta.glob<string>('/src/assets/**/*.svg', {
  query: '?url',
  import: 'default',
});

function figuraMarkdown(atributos: string, contenido: string, pie: string) {
  const id = atributos.match(/\bid="([^"]+)"/)?.[1];
  if (!id) throw new Error('La figura necesita un identificador');
  return `<a id="${id}"></a>\n\n${contenido}\n\n${pie.trim()}`;
}

function benchmarkMarkdown(atributos: string) {
  const tipo = atributos.match(/\btipo="([^"]+)"/)?.[1];
  if (tipo !== 'ocr' && tipo !== 'recuperacion' && tipo !== 'modelos') {
    throw new Error(`No se ha encontrado el benchmark ${tipo}`);
  }
  const etiquetas: Record<TipoBenchmark, string> = { ocr: 'Motor', recuperacion: 'Medición', modelos: 'Modelo' };
  const tablas: string[] = [];
  for (const panel of panelesBenchmark(tipo)) {
    const cabecera = [etiquetas[tipo], ...panel.metricas.map((metrica) => metrica.titulo)];
    const filas = [cabecera.join(' | '), cabecera.map(() => '---').join(' | ')];
    for (const fila of panel.filas) {
      const valores = panel.metricas.map((metrica, indice) =>
        `${numero(fila.valores[indice], metrica.decimales)} ${metrica.unidad}`.trim(),
      );
      filas.push([fila.nombre, ...valores].join(' | '));
    }
    tablas.push(`**${panel.titulo}**\n\n${filas.map((fila) => `| ${fila} |`).join('\n')}`);
  }
  return tablas.join('\n\n');
}

async function convertirMdx(markdown: string, origen: URL): Promise<string> {
  const recursos = new Map<string, string>();
  const sinImportaciones = markdown.replace(
    PATRON_IMPORTACION,
    (_linea, nombre: string, ruta: string) => {
      recursos.set(nombre, ruta);
      return '';
    },
  );

  await Promise.all(
    [...recursos].map(async ([nombre, ruta]) => {
      const rutaRelativa = ruta.split('/assets/')[1];
      if (!rutaRelativa) return;
      const cargarSvg = svg[`/src/assets/${rutaRelativa}`];
      if (cargarSvg) {
        const rutaSvg = await cargarSvg();
        recursos.set(nombre, new URL(rutaSvg, origen).href);
        return;
      }
      const cargarImagen = imagenes[`/src/assets/${rutaRelativa}`];
      if (!cargarImagen) throw new Error(`No se ha encontrado la imagen ${ruta}`);
      const imagen = await cargarImagen();
      const optimizada = await getImage({
        src: imagen.default,
        format: imagen.default.format === 'png' ? 'png' : undefined,
      });
      recursos.set(nombre, new URL(optimizada.src, origen).href);
    }),
  );

  return sinImportaciones
    .replace(PATRON_FIGURA, (_figura, atributos: string, pie: string) => {
      const nombre = atributos.match(/\bsrc=\{(\w+)\}/)?.[1];
      const alt = atributos.match(/\balt="([^"]*)"/)?.[1] ?? '';
      const ruta = nombre ? recursos.get(nombre) : undefined;
      if (!ruta) throw new Error(`No se ha encontrado la imagen ${nombre}`);
      return figuraMarkdown(atributos, `![${alt}](${ruta})`, pie);
    })
    .replace(/<FiguraCodigo\b([\s\S]*?)>([\s\S]*?)<\/FiguraCodigo>/g, (_figura, atributos: string, pie: string) => {
      const clave = atributos.match(/figurasCodigo\['([^']+)'\]/)?.[1] as keyof typeof figurasCodigo;
      const figura = figurasCodigo[clave];
      if (!figura) throw new Error(`No se ha encontrado la figura de código ${clave}`);
      return figuraMarkdown(atributos, `**${figura.title}**\n\n\`\`\`${figura.lang}\n${figura.code}\n\`\`\``, pie);
    })
    .replace(/<Benchmark\b([\s\S]*?)>([\s\S]*?)<\/Benchmark>/g, (_figura, atributos: string, pie: string) =>
      figuraMarkdown(atributos, benchmarkMarkdown(atributos), pie),
    )
    .replace(/<Posprocesado\b([^>]+)\/>/g, (_figura, atributos: string) => {
      const tabla = [
        '| Operación | Texto original | Resultado |',
        '| --- | --- | --- |',
        '| Unión de palabras partidas | propie-<br />dades | propiedades |',
        '| Unión de palabras partidas | 3.000 pe-<br />setas, | 3.000 pesetas, |',
        '| Filtrado de ruido | Am.<br />Confianza 0,12 | Línea descartada |',
      ].join('\n');
      return figuraMarkdown(atributos, tabla, 'Figura 3.4. Ejemplos de posprocesado del texto de Monopoly');
    })
    .trim();
}

export const GET: APIRoute<Props> = async ({ props, request, site }) => {
  const { entrada } = props;
  const origen = import.meta.env.DEV ? new URL(request.url) : (site ?? new URL(request.url));
  const markdown = `# ${entrada.data.title}\n\n${await convertirMdx(entrada.body ?? '', origen)}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
