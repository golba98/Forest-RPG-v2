# Static hosting preparation

Install dependencies with `npm install`, run locally with `npm run dev`, and create the production bundle with `npm run build`. Inspect it with `npm run preview`.

For Cloudflare Pages, use build command `npm run build` and output directory `dist`. All gameplay runs in the browser; no server or database is needed. The root asset paths assume deployment at the domain root.

The supplied `wrangler.jsonc` describes Workers Static Assets as an alternative, serving `./dist` with SPA fallback. Wrangler is not a project dependency. Its schema reference requires Wrangler to be installed if editor validation is desired.

Deployment and remote writes remain prohibited by the project instructions. Neither hosting route has been deployed or verified remotely.
