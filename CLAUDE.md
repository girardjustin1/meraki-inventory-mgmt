# Meraki Inventory — notes for AI assistants

- npm workspaces monorepo: `packages/ui` (design system, Storybook, all screens, the data layer and the engine; `@meraki/ui`) and `apps/web` (Next.js 16; `@meraki/inventory-web`).
- `.npmrc` sets `legacy-peer-deps=true` (upstream Untitled UI pins ESLint 10). Keep it.
- `packages/ui` follows the Untitled UI conventions in `packages/ui/CLAUDE.md`: kebab-case files, `Aria*` prefix for react-aria-components imports, `@/` path aliases, Tailwind v4 semantic tokens, never raw hex.
- Vendored Untitled UI files: keep edits minimal and mark them `[Meraki]`.
- Theme follows merakispainc.com: Figtree, Instrument Serif italic accent (`<em>` in an `h1`), aqua primary buttons with `text-ink`, deep teal controls. Tokens are in `packages/ui/styles/theme.css`.
- Meraki components go in `packages/ui/components/meraki/`; screens in `packages/ui/screens/<name>/` with a `*.story.tsx` beside each (Desktop and Mobile stories). Annotate `const meta: Meta<typeof X>`; `satisfies` breaks under `declaration: true`.
- `packages/ui/engine/` is pure TypeScript (forecast, flags, digest, stock status). No I/O, no React. It has tests: `npm run test:engine`. The reorder rule is `suggestOrderQty` in `engine/forecast.ts`; do not re-derive it in screens.
- `packages/ui/data/inventory.ts` is the prototype data layer: real catalogue and 2026 orders from `data/seed/*.json`, plus a generated sample layer flagged `isSample` / `costIsSample`. Keep `SampleDataNote` on screens until Supabase holds real data.
- `references/` holds the client's spreadsheets and private files. It is git-ignored. Never commit it, never copy staff names from it into the repo. `tools/import/import_spreadsheets.py` regenerates the seed JSON with names removed.
- The app must run with no service keys set (prototype mode). Clerk, Supabase and Resend are skipped when not configured: see `apps/web/lib/env.ts`.
- Checks: `npm run type-check`, `npm run test:engine`, `npm run test:db`, `npm run build-storybook`, `npm run build`.
