<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project notes for coding agents

- The point of this project is that **Jev makes every linguistic decision at inference time**.
  Do not add prefix matching, frequency heuristics, repetition penalties or any other model to the
  prediction path. Prompt wording, question structure and how Jev's probabilities are combined are
  fair game; see `lib/predict.ts`.
- Run `npm run check` (lint, typecheck, tests, build) before pushing. Tests use the local mock API in
  `scripts/mock-typesafe.mjs`, so they need no key and no network.
- `npm run dev:mock` runs the site without a key. Real behaviour needs `TYPESAFE_API_KEY` in `.env.local`.
- The data files under `data/` are generated; see `docs/DATA.md` before editing them by hand.
