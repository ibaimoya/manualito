import type { APIRoute, ImageMetadata, InferGetStaticPropsType } from 'astro';
import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';

/* Expone cada entrada de documentación bajo su misma ruta con extensión .md. */
export async function getStaticPaths() {
  const entradas = await getCollection('docs');
  return entradas
    .filter((entrada) => entrada.id !== '' && entrada.id !== 'index')
    .map((entrada) => ({ params: { ruta: entrada.id }, props: { entrada } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

const PATRON_IMPORTACION = /^import\s+(\w+)\s+from\s+'([^']+)';\r?\n?/gm;
const PATRON_FIGURA = /<Figura\b([\s\S]*?)>([\s\S]*?)<\/Figura>/g;
const imagenes = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{avif,gif,jpeg,jpg,png,webp}',
);

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
      const cargarImagen = imagenes[`/src/assets/${rutaRelativa}`];
      if (!cargarImagen) throw new Error(`No se ha encontrado la imagen ${ruta}`);
      const imagen = await cargarImagen();
      const optimizada = await getImage({ src: imagen.default });
      recursos.set(nombre, new URL(optimizada.src, origen).href);
    }),
  );

  return sinImportaciones
    .replace(PATRON_FIGURA, (figura, atributos: string, pie: string) => {
      const id = atributos.match(/\bid="([^"]+)"/)?.[1];
      const nombre = atributos.match(/\bsrc=\{(\w+)\}/)?.[1];
      const alt = atributos.match(/\balt="([^"]*)"/)?.[1] ?? '';
      const ruta = nombre ? recursos.get(nombre) : undefined;
      if (!ruta) return figura;
      const ancla = id ? `<a id="${id}"></a>\n\n` : '';
      return `${ancla}![${alt}](${ruta})\n\n${pie.trim()}`;
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
