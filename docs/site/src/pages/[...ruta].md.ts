import type { APIRoute, InferGetStaticPropsType } from 'astro';
import { getCollection } from 'astro:content';

/* Expone cada entrada de documentación bajo su misma ruta con extensión .md. */
export async function getStaticPaths() {
  const entradas = await getCollection('docs');
  return entradas
    .filter((entrada) => entrada.id !== '' && entrada.id !== 'index')
    .map((entrada) => ({ params: { ruta: entrada.id }, props: { entrada } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = ({ props }) => {
  const { entrada } = props;
  const markdown = `# ${entrada.data.title}\n\n${(entrada.body ?? '').trim()}\n`;
  return new Response(markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
