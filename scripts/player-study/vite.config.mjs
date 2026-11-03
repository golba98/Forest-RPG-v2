// Approved character preview. Uses the same assets and renderer as production.
import { defineConfig } from 'vite';
import base from '../../vite.config.ts';
export default defineConfig({
  ...base,
  plugins: [],
  server: { ...base.server, host: 'localhost', port: 4328, strictPort: true },
});
