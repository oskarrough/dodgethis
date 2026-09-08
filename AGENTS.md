# Agent notes

- `agent-browser` is installed — use it for browser testing.
- do not use `jj restore` as there might be parallel agents working
- deploys happen automatically when `main` moves on GitHub (Cloudflare Workers build). Never run `wrangler deploy` by hand. `bun run build` runs `bun run check` first, so a lint or test failure blocks the deploy.
