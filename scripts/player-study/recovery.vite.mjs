// Local recovery hub: the approved playable review lives at localhost:4330.
import fs from 'node:fs/promises';
import { defineConfig } from 'vite';
import study from './vite.config.mjs';

export default defineConfig({
  ...study,
  plugins: [
    {
      name: 'approved-player-recovery',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url ?? '/', 'http://localhost');
          if (url.pathname === '/' && !url.searchParams.has('debug')) {
            try {
              const html = (await fs.readFile('scripts/player-study/review.html', 'utf8'))
                .replace('<style>', '<style>a{color:#b9d9b9}')
                .replace('src="./review.ts"', 'src="/scripts/player-study/review.ts"')
                .replace(
                  '</h1>',
                  '</h1><p><a href="/artifacts/player-approved/index.html">Saved character and recovery files</a></p>',
                );
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              res.end(await server.transformIndexHtml('/', html));
            } catch (error) {
              next(error);
            }
            return;
          }
          next();
        });
      },
    },
    ...study.plugins,
  ],
  server: { ...study.server, port: 4330, hmr: false },
});
