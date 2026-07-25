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
        alt: '',
      },
      locales: {
        root: {
          label: 'Español',
          lang: 'es',
        },
      },
      sidebar: [
        { label: 'Inicio', link: '/' },
        {
          label: 'Usuarios',
          items: [{ label: 'Subir un manual', slug: 'usuarios/subir-un-manual' }],
        },
      ],
      pagefind: true,
      customCss: [
        '@fontsource-variable/manrope',
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/custom.css',
      ],
      components: {
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      plugins: [starlightLinksValidator()],
    }),
  ],
});
