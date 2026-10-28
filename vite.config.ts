import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // Pixel-art optimization: prevent embedding textures into JS as base64
    // Ensures clean asset streaming, caching, and PixiJS texture management
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: 'localhost',
    open: false,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  preview: {
    port: 4173,
    host: 'localhost',
    open: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
