/**
 * Path of a file in the app's public folder ("/brand/meraki-swan-teal.svg").
 *
 * The app can be served from a sub-path (GitHub Pages serves a project from /<repository>/), and a
 * plain "/brand/…" would then point at the domain root. Storybook has no sub-path and no `process`,
 * hence the guard.
 */
let base = "";
try {
    base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
} catch {
    base = "";
}

export const asset = (path: string) => `${base}${path}`;
