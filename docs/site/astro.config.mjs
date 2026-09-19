import { nodeTypes } from '@mdx-js/mdx';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import starlightLinksValidator from 'starlight-links-validator';

import { BIBLIOGRAFIAS } from './src/datos/bibliografia.ts';
import rehypeAcronimos from './src/plugins/rehype-acronimos.ts';
import rehypeCitas from './src/plugins/rehype-citas.ts';

// El componente genera estas anclas después del análisis del Markdown.
const enlacesBibliografia = new Set(
  Object.entries(BIBLIOGRAFIAS).flatMap(([seccion, referencias]) =>
    referencias.map(({ numero }) => `/${seccion}/bibliografia/#ref-${numero}`),
  ),
);

export default defineConfig({
  site: 'https://docs.manualito.dev',
  trailingSlash: 'always',
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        [rehypeRaw, { passThrough: [...nodeTypes] }],
        rehypeAcronimos,
        rehypeCitas,
        rehypeKatex,
      ],
    }),
  },
  integrations: [
    starlight({
      title: 'Manualito',
      description:
        'Documentación para usar Manualito y entender cómo procesa los manuales de juegos de mesa.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logos/manualito.svg',
        alt: '',
      },
      locales: {
        root: {
          label: 'Español',
          lang: 'es',
        },
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/ibaimoya/manualito' },
      ],
      sidebar: [
        {
          label: 'Memoria',
          items: [{ autogenerate: { directory: 'memoria' } }],
        },
        {
          label: 'Anexos',
          items: [{ autogenerate: { directory: 'anexos' } }],
        },
      ],
      pagefind: true,
      customCss: [
        '@fontsource-variable/manrope',
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        'katex/dist/katex.min.css',
        './src/styles/custom.css',
        './src/styles/tablas.css',
        './src/styles/laterales-redimensionables.css',
      ],
      components: {
        Footer: './src/components/Footer.astro',
        Head: './src/components/Head.astro',
        Header: './src/components/Header.astro',
        MarkdownContent: './src/components/MarkdownContent.astro',
        PageFrame: './src/components/PageFrame.astro',
        Sidebar: './src/components/MenuCapitulos.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      routeMiddleware: './src/routeData.ts',
      plugins: [
        starlightLinksValidator({
          // El manual incluye las direcciones de los servicios del entorno local.
          exclude: ({ slug, link }) =>
            enlacesBibliografia.has(link) ||
            (slug === 'anexos/documentacion-tecnica-de-programacion' &&
            [
              'https://localhost',
              'https://localhost/docs',
              'http://localhost:5555',
              'http://localhost:8025',
            ].includes(link)),
        }),
      ],
    }),
  ],
});
