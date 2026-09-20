import { readFile } from 'node:fs/promises';
import type { APIRoute, InferGetStaticPropsType } from 'astro';
import { root } from 'astro:config/server';

export function getStaticPaths() {
  return ['memoria', 'anexos'].map((document) => ({
    params: { document },
    props: { filename: document + '.pdf' },
  }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET: APIRoute<Props> = async ({ props }) => {
  const pdf = await readFile(new URL('../thesis/pdf/' + props.filename, root));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="' + props.filename + '"',
    },
  });
};
