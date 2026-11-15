"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RouterProvider } from "react-aria-components";
import { UrlSyncProvider } from "@/utils/url-sync";
import { ViewerProvider } from "@/utils/viewer";
import { VIEWER_COOKIE } from "@/utils/viewer-cookie";

/**
 * Client-side wiring for the app:
 *   - UrlSyncProvider: screens mirror their tab, filters and search into the URL (deep links).
 *   - RouterProvider: React Aria links and menu items navigate without a full page load.
 *   - a click handler that does the same for the plain <a href> links the screens use.
 *   - ViewerProvider: who is using the app. Until sign-in is connected, a "view as" switch.
 */
export function ClientProviders({ children, viewerId, canSwitchViewer }: { children: ReactNode; viewerId?: string; canSwitchViewer: boolean }) {
    const router = useRouter();

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as Element | null)?.closest?.("a[href]");
            if (!(anchor instanceof HTMLAnchorElement)) return;
            if (anchor.target && anchor.target !== "_self") return;
            if (anchor.hasAttribute("download") || anchor.getAttribute("rel")?.includes("external")) return;
            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
            // Same page, different hash: let the browser scroll.
            if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
            event.preventDefault();
            router.push(`${url.pathname}${url.search}${url.hash}`);
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, [router]);

    // Prototype only: make sure the cookie exists, so API routes see the same person the screens show.
    useEffect(() => {
        if (!canSwitchViewer || !viewerId || document.cookie.includes(`${VIEWER_COOKIE}=`)) return;
        document.cookie = `${VIEWER_COOKIE}=${encodeURIComponent(viewerId)}; path=/; max-age=31536000; samesite=lax`;
    }, [canSwitchViewer, viewerId]);

    // Prototype only (no sign-in yet): remember which sample person the app is being viewed as.
    const switchViewer = (userId: string) => {
        document.cookie = `${VIEWER_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
    };

    return (
        <UrlSyncProvider>
            <ViewerProvider viewerId={viewerId} onSwitch={canSwitchViewer ? switchViewer : undefined}>
                <RouterProvider navigate={(href) => router.push(href)}>{children}</RouterProvider>
            </ViewerProvider>
        </UrlSyncProvider>
    );
}
