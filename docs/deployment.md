# Static hosting preparation

Install dependencies with `npm install`, run locally with `npm run dev`, and create the production bundle with `npm run build`. Inspect it with `npm run preview`.

For Cloudflare Pages, use build command `npm run build` and output directory `dist`. All gameplay runs in the browser; no server or database is needed. The root asset paths assume deployment at the domain root.

The supplied `wrangler.jsonc` describes Workers Static Assets as an alternative, serving `./dist` with SPA fallback. Wrangler is not a project dependency. Its schema reference requires Wrangler to be installed if editor validation is desired.

The connected Workers Builds integration uses `npm run build`. Its non-production deploy command, `npx wrangler preview`, requires the empty `previews` block in `wrangler.jsonc`; assets and compatibility settings remain at the top level. See [Cloudflare preview configuration](https://developers.cloudflare.com/workers/previews/configuration/#wrangler-configuration-file). The game stays a static asset build, with no backend or database bindings.

Production publication and changes to hosted settings require explicit authorization. PRs can use the existing automatic preview integration. A successful Vite build and a successful preview deployment are separate checks; inspect both when diagnosing a hosted failure.
