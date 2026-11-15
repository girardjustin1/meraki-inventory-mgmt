# The prototype on GitHub Pages

The prototype is published as a static site:

- App: https://girardjustin1.github.io/meraki-inventory-mgmt/
- Storybook: https://girardjustin1.github.io/meraki-inventory-mgmt/storybook/

Every push to `main` rebuilds and republishes it (`.github/workflows/pages.yml`). It can also be run by hand from the repository's Actions tab.

## What a visitor gets

The same screens as `npm run dev`, on the same sample data, with search, deep links, the "view as" switch and the phone layout. Nothing is saved: an edit lasts until the page is reloaded, as in the prototype everywhere else.

The site is public. Anyone with the address can open it. Pages carry a `noindex` tag, which asks search engines not to list them; it does not stop anyone who has the link.

## What is left out

GitHub Pages serves files and runs no server, so the static site has no API routes, no request proxy, and no Clerk, Supabase or Resend. The prototype does not use them. When those are connected (milestone 2) the app needs a real host such as Vercel, and this site stays a design preview.

## How the static build works

`npm run build:pages` (`tools/pages/build.mjs`) runs the normal app build with `GITHUB_PAGES=1`. In `apps/web/next.config.ts` that switches on:

- `output: "export"`: plain HTML, CSS and JavaScript in `apps/web/out`.
- A base path of `/<repository>`, because GitHub serves a project from a sub-path.
- Folders with a trailing slash, so `/orders/` and `/orders/<id>/` can both exist.
- Only `.tsx` files as routes, which leaves out `route.ts` and `proxy.ts`.
- A stand-in for `@clerk/nextjs` (`lib/clerk-static.tsx`), because Clerk's package contains server actions.

Three things in the app make this possible and apply to the server build too:

- Pages read the query string and the "view as" and location cookies in the browser, through `useView()` in `apps/web/lib/use-view.ts`.
- Each dynamic route lists its ids in `generateStaticParams`, so one page is written per item, order, count, flag, task, collection and invite (about 1,900 pages). The server build lists none and renders them on demand.
- Screens link with plain paths such as `/stock`. `app/client-providers.tsx` sends clicks through the router, which adds the base path, and corrects a link's address when the pointer or keyboard reaches it, so "open in new tab" and "copy link" work.

## Try it locally

```bash
npm run build:pages
mkdir -p /tmp/site && ln -sfn "$PWD/apps/web/out" /tmp/site/meraki-inventory-mgmt
python3 -m http.server 4173 --directory /tmp/site
# open http://localhost:4173/meraki-inventory-mgmt/
```

## Turning it off

Repository Settings, Pages, "Unpublish site"; or delete `.github/workflows/pages.yml`.
