/**
 * Home-screen (PWA) metadata for the root layout.
 *
 * Spread these into the `metadata` and `viewport` exports of app/layout.tsx:
 *
 *   import type { Metadata, Viewport } from "next";
 *   import { pwaMetadata, pwaViewport } from "~/lib/pwa-metadata";
 *
 *   export const metadata: Metadata = { title: "Meraki Inventory", robots: { index: false, follow: false }, ...pwaMetadata };
 *   export const viewport: Viewport = pwaViewport;
 *
 * What each part does on an iPhone after Share > Add to Home Screen:
 *   - appleWebApp.capable   opens full screen, without Safari's address bar and toolbar
 *   - appleWebApp.title     the label under the icon ("Inventory")
 *   - icons.apple           the home-screen icon (iOS ignores the manifest's icons)
 *   - viewportFit "cover"   lets the page draw under the notch and home indicator. Screens
 *                           must then pad with env(safe-area-inset-*) so content is not
 *                           hidden; fixed bottom bars especially.
 *   - themeColor            the status bar / browser chrome tint
 * The manifest (app/manifest.ts) is linked automatically by Next.js and is what Android and
 * desktop Chrome use.
 *
 * There is NO service worker in this version, on purpose: the app is online-only. Every
 * count, receipt and adjustment is written straight to the ledger, and an offline queue
 * that replays movements later needs conflict rules (what if the same shelf was counted
 * twice while offline?) that deserve their own design. Offline counting is a later
 * milestone. iOS does not need a service worker for Add to Home Screen.
 */
import type { Metadata, Viewport } from "next";

/** Brand colours, also used by app/manifest.ts. Keep in step with packages/ui/styles/theme.css. */
export const PWA_COLORS = {
    /** Aqua: icon background and browser chrome tint. */
    theme: "#65c5c3",
    /** Mist: splash and page background while the app loads. */
    background: "#f1f7f8",
} as const;

export const pwaMetadata = {
    applicationName: "Meraki Inventory",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Inventory",
    },
    icons: {
        icon: [
            { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    // Stops iOS turning stock counts and SKUs into tappable phone numbers.
    formatDetection: { telephone: false },
} satisfies Metadata;

export const pwaViewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: PWA_COLORS.theme,
} satisfies Viewport;
