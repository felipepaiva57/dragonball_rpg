import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser sozinho passa de 1 MB
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
