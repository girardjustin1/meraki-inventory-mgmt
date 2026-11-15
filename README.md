# Meraki Inventory

Inventory app for Meraki Spa's two locations: count stock, reorder, receive deliveries, review flags, and get weekly and monthly digests. Works on desktop and as an iPhone home-screen web app.

This is a first-pass prototype. Screens run on Meraki's real catalogue and 2026 order history, with sample values where the spreadsheets hold no data (costs, staff, counts). No live services are connected yet.

## Start here

| Read | For |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | What the app does, what the spreadsheets showed, milestones, open questions |
| [docs/architecture.md](docs/architecture.md) | How the pieces fit: Next.js, Clerk, Supabase, Resend |
| [docs/research/](docs/research/) | UX patterns (Mobbin), inventory controls, vendor and product-data options, product imagery and the catalogue corrections it surfaced |
| [apps/web/README.md](apps/web/README.md) | Connecting Clerk, Supabase, Resend and Vercel |

## Run it

```bash
npm install
npm run storybook     # design system and every screen, http://localhost:6006
npm run dev           # the Next.js prototype, http://localhost:3000
```

If port 6006 is taken by another Storybook, run `npx storybook dev -p 6007` from `packages/ui`.

The prototype needs no keys.

- **View as**: there is no sign-in yet, so the sidebar (bottom left) lets you see the app as the owner, a manager, front desk or a technician. It opens as the owner.
- **Search**: Cmd+K (or Ctrl+K, or `/`) finds products, colour codes, orders, flags and pages.
- **Links**: the address bar carries the view, for example `/stock?loc=newburyport&reorder=1`, `/stock?tab=polish&finish=gel`, `/orders?tab=open&vendor=amazon` or `/flags?severity=high`.
- **Lists**: Stock, Orders, Counts and Flags let you tick rows and act on them together. On Stock, a quantity is a button: select it to adjust.
- **Collections**: `/collections` holds saved sets of items (a shelf, a service kit, a count list) to count or order from in one go.
- **Sign-in** continues to the PIN screen; the prototype PIN is `2580`. An invite link looks like `/invite/mk_7Qp2xV9aLr4TnB6c`.
- **Scanner**: `/scan` uses demo codes; `/scan?live=1` uses the camera.

Checks:

```bash
npm run type-check
npm run test:engine     # forecast, flag and digest rules
npm run test:db         # schema and row-level security, in an in-memory Postgres
npm run build-storybook
npm run build
```

## Layout

```
packages/ui/
  components/      Untitled UI (vendored) and components/meraki (ours)
  screens/         one folder per screen, with Desktop and Mobile stories
  engine/          forecast, flags, digest, stock status: pure TypeScript, tested
  data/            prototype data layer and seed JSON imported from the workbooks
  styles/          theme matched to merakispainc.com
apps/web/          Next.js app: routes, API routes, email templates, PWA manifest
supabase/          schema and row-level security
tools/import/      turns the Excel workbooks into seed JSON
docs/              PRD, architecture, research
references/        client spreadsheets and private files (git-ignored)
```

## Re-importing the spreadsheets

```bash
python3 -m venv .venv && .venv/bin/pip install openpyxl
.venv/bin/python tools/import/import_spreadsheets.py references/111426
```

Staff names in the workbooks are replaced with roles before anything is written to the repo.
