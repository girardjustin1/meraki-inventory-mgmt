"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { UrlSyncProvider } from "@/utils/url-sync";
import { ViewerProvider } from "@/utils/viewer";
import { VIEWER_COOKIE } from "@/utils/viewer-cookie";
import { BASE_PATH, withBase, withoutBase } from "~/lib/base-path";
import { useCookie, writeCookie } from "~/lib/use-view";
import { DEFAULT_VIEWER_ID } from "~/lib/view-params";

/**
 * Client-side wiring for the app:
 *   - UrlSyncProvider: screens mirror their tab, filters and search into the URL (deep links).
 *   - RouterProvider: React Aria links and menu items navigate without a full page load.
 *   - a click handler that does the same for the plain <a href> links the screens use.
 *   - ViewerProvider: who is using the app. Until sign-in is connected, a "view as" switch.
 *
 * When the app is served from a sub-path (GitHub Pages), the screens' links still say "/stock".
 * Clicks go through the router, which adds the sub-path. For everything else a browser does with a
 * link (open in a new tab, copy the address, show it on hover) the address is corrected as soon as
 * the pointer or the keyboard reaches the link.
 */
export function ClientProviders({ children, canSwitchViewer }: { children: ReactNode; canSwitchViewer: boolean }) {
    const router = useRouter();
    const viewerId = useCookie(VIEWER_COOKIE) ?? DEFAULT_VIEWER_ID;

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as Element | null)?.closest?.("a[href]");
            if (!(anchor instanceof HTMLAnchorElement)) return;
            if (anchor.target && anchor.target !== "_self") return;
            if (anchor.hasAttribute("download") || anchor.getAttribute("rel")?.includes("external")) return;
            const url = new URL(anchor.href, window.location.href);
            const path = withoutBase(url.pathname);
            if (url.origin !== window.location.origin || path.startsWith("/api/") || path.startsWith("/storybook")) return;
            // Same page, different hash: let the browser scroll.
            if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
            event.preventDefault();
            router.push(`${path}${url.search}${url.hash}`);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [router]);

    // Served from a sub-path: give a link its full address before the browser can use it.
    useEffect(() => {
        if (!BASE_PATH) return;
        const fix = (event: Event) => {
            const anchor = (event.target as Element | null)?.closest?.("a[href]");
            const href = anchor?.getAttribute("href");
            if (anchor && href && href.startsWith("/") && !href.startsWith("//") && withBase(href) !== href) anchor.setAttribute("href", withBase(href));
        };
        const events = ["pointerover", "focusin", "touchstart", "mousedown", "auxclick", "contextmenu"] as const;
        for (const name of events) document.addEventListener(name, fix, { capture: true, passive: true });
        return () => {
            for (const name of events) document.removeEventListener(name, fix, { capture: true });
        };
    }, []);

    // Prototype only: make sure the cookie exists, so API routes see the same person the screens show.
    useEffect(() => {
        if (!canSwitchViewer || document.cookie.includes(`${VIEWER_COOKIE}=`)) return;
        writeCookie(VIEWER_COOKIE, DEFAULT_VIEWER_ID);
    }, [canSwitchViewer]);

    // Prototype only (no sign-in yet): remember which sample person the app is being viewed as.
    const switchViewer = (userId: string) => writeCookie(VIEWER_COOKIE, userId);

    return (
        <UrlSyncProvider>
            <ViewerProvider viewerId={viewerId} onSwitch={canSwitchViewer ? switchViewer : undefined}>
                <RouterProvider navigate={(href) => router.push(withoutBase(href))} useHref={withBase}>
                    {children}
                </RouterProvider>
            </ViewerProvider>
        </UrlSyncProvider>
    );
}
