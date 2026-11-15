/**
 * Rasterises the swan mark into the home-screen icons in apps/web/public/icons.
 *
 *   node tools/icons/build-icons.mjs
 *
 * Source:  packages/ui/public/brand/meraki-swan-teal.svg
 * Output:  icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180)
 *
 * The mark is recoloured to ink and centred on a solid aqua square: the same pairing as the
 * app's primary button (aqua fill, ink on top), and solid because iOS paints transparent
 * icon pixels black. The maskable icon keeps the mark inside the central 80% "safe zone" so
 * Android can crop it to a circle or squircle without clipping.
 *
 * Uses `sharp`, which is already in node_modules as a dependency of Next.js. It is not a
 * direct dependency of this repo; if it ever goes missing, `npm i -D sharp` at the root.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = path.join(ROOT, "packages/ui/public/brand/meraki-swan-teal.svg");
const OUT_DIR = path.join(ROOT, "apps/web/public/icons");

const AQUA = "#65c5c3";
const INK = "#17262e";

/** `mark` is the height of the swan as a fraction of the icon. */
const ICONS = [
    { file: "icon-192.png", size: 192, mark: 0.66 },
    { file: "icon-512.png", size: 512, mark: 0.66 },
    { file: "icon-maskable-512.png", size: 512, mark: 0.52 },
    { file: "apple-touch-icon.png", size: 180, mark: 0.66 },
];

const svg = readFileSync(SOURCE, "utf8").replace(/fill="#65C5C3"/gi, `fill="${INK}"`);
const [, , , viewWidth, viewHeight] = /viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
if (!viewWidth || !viewHeight) throw new Error("Could not read the viewBox of the swan SVG");
const aspect = Number(viewWidth) / Number(viewHeight);

mkdirSync(OUT_DIR, { recursive: true });

for (const { file, size, mark } of ICONS) {
    const height = Math.round(size * mark);
    const width = Math.round(height * aspect);
    // Render the vector at 4x and scale down, for clean edges at small sizes.
    const swan = await sharp(Buffer.from(svg), { density: 72 * ((height * 4) / Number(viewHeight)) })
        .resize({ width, height, fit: "fill" })
        .png()
        .toBuffer();

    await sharp({ create: { width: size, height: size, channels: 4, background: AQUA } })
        .composite([{ input: swan, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
        .removeAlpha() // every pixel is opaque already; drop the channel so iOS has nothing to paint black
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT_DIR, file));

    console.log(`${file}  ${size}x${size}  mark ${width}x${height}`);
}
