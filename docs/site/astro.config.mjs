import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';

export default defineConfig({
  site: 'https://docs.manualito.dev',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Manualito',
      description:
        'Documentación para usar Manualito y entender cómo procesa los manuales de juegos de mesa.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/manualito.svg',
        alt: 'Manualito',
      },
      locales: {
        root: {
          label: 'Español',
          lang: 'es',
        },
      },
      sidebar: [{ label: 'Inicio', link: '/' }],
      pagefind: true,
      customCss: [
        '@fontsource-variable/manrope',
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/custom.css',
      ],
      plugins: [starlightLinksValidator()],
    }),
  ],
});
