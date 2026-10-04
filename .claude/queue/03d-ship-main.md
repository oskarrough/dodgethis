Model: Sonnet 5.5. After: 03a–03c, Try Mode and the cleanup have landed. Oskar authorised it (2026-10-04 night): deploy to main.

1. `bun run check` green and `bun run test:slow` green at the moba tip.
2. A frozen build gets a Sonnet new-player smoke (dodgeball and MOBA from a fresh /). Ship only if nothing is broken outright; polish notes go to the queue.
3. Fast-forward main to moba (`jj bookmark set main -r moba`), then `jj git push -b main -b moba`. Cloudflare deploys from main. Never run wrangler.
4. Add a changelog line to docs/roadmap.md.
