// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://rectangles.labcat.nz',
  devToolbar: {
    enabled: false,
  },
  base: '/',
  vite: {
    resolve: {
      alias: {
        '@sketches': '/src/sketches',
        '@layouts': '/src/layouts',
        '@styles': '/src/styles',
        '@lib': '/src/lib',
        '@templates': '/src/templates',
        '@components': '/src/components',
        '@pages': '/src/pages',
        '@': '/src',
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@styles/mixins/breakpoints.scss";`,
          silenceDeprecations: ['import', 'global-builtin'],
        },
      },
    },
  },
});
