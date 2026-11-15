import path from "node:path";
import type { NextConfig } from "next";

/**
 * GITHUB_PAGES=1 builds the prototype as a static site for GitHub Pages (`npm run build:pages`):
 *   - `output: "export"` writes plain HTML, CSS and JavaScript to out/.
 *   - GitHub serves a project from /<repository>/, so every path gets that prefix.
 *   - Folders, not .html files, so /orders and /orders/<id> can both exist.
 *   - Only .tsx files are routes there. That leaves out the API routes and the request proxy
 *     (route.ts, proxy.ts), which need a server and are not used by the prototype.
 * Without it, this is the normal server build.
 */
const staticSite = process.env.GITHUB_PAGES === "1";
const basePath = staticSite ? `/${process.env.PAGES_REPOSITORY ?? "meraki-inventory-mgmt"}` : "";

const config: NextConfig = {
    // Screens and components live in ../../packages/ui and are imported via the same "@/..." aliases
    // Storybook uses (see tsconfig.json), so a screen built in Storybook drops into the app unchanged.
    turbopack: {
        root: path.join(__dirname, "../.."),
        // Clerk ships server actions, which a static export cannot contain. See lib/clerk-static.tsx.
        ...(staticSite ? { resolveAlias: { "@clerk/nextjs": "~/lib/clerk-static" } } : {}),
    },
    experimental: { externalDir: true },
    env: { NEXT_PUBLIC_BASE_PATH: basePath },
    ...(staticSite
        ? {
              output: "export" as const,
              basePath,
              trailingSlash: true,
              images: { unoptimized: true },
              pageExtensions: ["tsx"],
          }
        : {}),
};

export default config;
