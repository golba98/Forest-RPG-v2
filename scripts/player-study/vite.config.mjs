// Explicit opt-in review server. Normal dev/build/preview never import this.
import { defineConfig } from 'vite';
import base from '../../vite.config.ts';
import { studyAsset, studyPattern } from './assets.mjs';

export default defineConfig({
  ...base,
  plugins: [{
    name: 'player-art-study-only',
    transform(code, id) {
      if (id.endsWith('/src/animation/PlayerPlayback.ts')) {
        return code.replace('export const PLAYER_FLOW_ENABLED = true;', 'export const PLAYER_FLOW_ENABLED = new URLSearchParams(window.location.search).get("playerFlow") !== "before";');
      }
      if (!id.endsWith('/src/rendering/assetCatalog.ts')) return;
      const original = 'src: `assets/images/characters/player/${anim}/${anim}_${DIRECTION_FILE_SUFFIX[dir]}.png`';
      if (!code.includes(original)) throw Error('Player catalogue changed; review URL transform needs updating');
      // Carry selection in the actual image URL: Pixi may fetch through a
      // worker whose Referer is not the game document.
      return code.replace(original, 'src: `assets/images/characters/player/${anim}/${anim}_${DIRECTION_FILE_SUFFIX[dir]}.png?playerArt=${encodeURIComponent(new URLSearchParams(window.location.search).get("playerArt") ?? "")}`');
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const match = studyPattern.exec(url.pathname);
          if (!match) return next();
          const phase = url.searchParams.get('playerArt') ?? new URL(req.headers.referer ?? 'http://localhost').searchParams.get('playerArt');
          const buffer = await studyAsset(phase, match[1], match[2]);
          if (!buffer) return next();
          res.setHeader('Content-Type', 'image/png'); res.setHeader('Cache-Control', 'no-store');
          res.end(buffer);
        } catch (error) { next(error); }
      });
    },
  }],
  server: { ...base.server, host: 'localhost', port: 4328, strictPort: true },
});
