import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
    // Screens and components live in ../../packages/ui and are imported via the same "@/..." aliases
    // Storybook uses (see tsconfig.json), so a screen built in Storybook drops into the app unchanged.
    turbopack: { root: path.join(__dirname, "../..") },
    experimental: { externalDir: true },
};

export default config;
