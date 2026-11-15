#!/usr/bin/env node
// Build the prototype as a static site for GitHub Pages.
//
//   npm run build:pages            -> apps/web/out, served from /meraki-inventory-mgmt/
//   PAGES_REPOSITORY=name npm run build:pages   (another repository name)
//
// The result holds the app, and Storybook under /storybook/. See docs/github-pages.md.
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const web = join(root, "apps", "web");
const out = join(web, "out");
const run = (command, cwd, env = {}) => execSync(command, { cwd, stdio: "inherit", env: { ...process.env, ...env } });

rmSync(out, { recursive: true, force: true });
run("npx next build", web, { GITHUB_PAGES: "1" });

if (!process.argv.includes("--no-storybook")) {
    run("npm run build-storybook", root);
    cpSync(join(root, "packages", "ui", "storybook-static"), join(out, "storybook"), { recursive: true });
}

// GitHub's Jekyll step would drop folders that start with an underscore (_next).
writeFileSync(join(out, ".nojekyll"), "");
if (!existsSync(join(out, "index.html"))) throw new Error("The export has no index.html");
console.log(`Static site written to ${out}`);
