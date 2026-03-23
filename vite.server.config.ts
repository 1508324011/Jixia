import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    minify: false,
    outDir: 'dist-server',
    rollupOptions: {
      output: {
        entryFileNames: 'http-server.js',
      },
    },
    sourcemap: true,
    ssr: 'src/server/http-server.ts',
    target: 'node22',
  },
  resolve: {
    alias: [
      {
        find: /^@shared\/(.+)$/,
        replacement: `${fileURLToPath(new URL('./src/shared', import.meta.url))}/$1`,
      },
      {
        find: '@shared',
        replacement: fileURLToPath(new URL('./src/shared/index.ts', import.meta.url)),
      },
    ],
  },
});
