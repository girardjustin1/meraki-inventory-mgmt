/**
 * Where the app is mounted. Empty on its own domain; "/meraki-inventory-mgmt" when it is published
 * as a static site on GitHub Pages, which serves a project from a sub-path.
 *
 * Next.js adds this to its own links and router calls. The screens also write plain
 * `<a href="/stock">` links and `<img src="/brand/…">` paths, which the browser would resolve
 * against the domain root, so those are prefixed where they are used (see app/client-providers.tsx).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** True while building the static site for GitHub Pages. */
export const IS_STATIC_SITE = process.env.GITHUB_PAGES === "1";

/** An app path as the browser must request it: "/stock" becomes "/meraki-inventory-mgmt/stock". */
export const withBase = (path: string) => (BASE_PATH && path.startsWith("/") && !path.startsWith(`${BASE_PATH}/`) && path !== BASE_PATH ? `${BASE_PATH}${path}` : path);

/** The reverse, for handing a browser path to the Next.js router (which adds the base itself). */
export const withoutBase = (path: string) => (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) ? path.slice(BASE_PATH.length) || "/" : path);

/**
 * Ids to pre-render for a dynamic route. A static site needs every page written out ahead of
 * time; the server build renders them on demand, so it lists none.
 */
export const staticParams = <T,>(all: () => T[]): T[] => (IS_STATIC_SITE ? all() : []);
