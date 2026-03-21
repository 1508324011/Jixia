import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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
  }
});
