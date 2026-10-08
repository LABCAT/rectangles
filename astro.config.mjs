// @ts-check
import { defineConfig } from 'astro/config';
import { astroAnimationsScssPrepend, astroAnimationsViteAliases, astroAnimationsViteConfig } from '@labcat2020/animation-lab/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://rectangles.labcat.nz',
  devToolbar: {
    enabled: false,
  },
  base: '/',
  vite: {
    ...astroAnimationsViteConfig(),
    resolve: {
      alias: {
        ...astroAnimationsViteAliases(),
        '@sketches': '/src/sketches',
        '@templates': '/src/templates',
        '@pages': '/src/pages',
        '@': '/src',
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: astroAnimationsScssPrepend(),
          silenceDeprecations: ['import', 'global-builtin'],
        },
      },
    },
  },
});
