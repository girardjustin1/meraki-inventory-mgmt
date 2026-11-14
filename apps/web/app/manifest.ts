/**
 * Web app manifest, served by Next.js at /manifest.webmanifest and linked from every page.
 *
 * This is what Android and desktop Chrome read for "Install app". iOS Safari reads little of
 * it (name, display, start_url) and takes its icon and title from the tags produced by
 * lib/pwa-metadata.ts instead.
 *
 * The request proxy lets /manifest.webmanifest through without a session: browsers fetch it
 * without credentials unless told otherwise, and it contains nothing private.
 */
import type { MetadataRoute } from "next";
import { PWA_COLORS } from "~/lib/pwa-metadata";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "Meraki Inventory",
        short_name: "Inventory",
        description: "Stock counts, orders and receiving for Meraki Spa.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: PWA_COLORS.theme,
        background_color: PWA_COLORS.background,
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            // Maskable: the mark sits inside the central 80% so Android can crop it to any shape.
            { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}
