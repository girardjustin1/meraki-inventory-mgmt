"use client";

import { createContext, useContext, useEffect } from "react";
import type { ReactNode } from "react";
import { LOCATION_COOKIE } from "./location-cookie";

/**
 * Deep links.
 *
 * Screens keep their view state (tab, filters, search, selected record) in React state so they
 * work in Storybook. Inside the app, `UrlSyncProvider` turns on mirroring of that state into the
 * query string, and each page reads the query string back into the screen's initial props. The
 * result is that any view can be copied from the address bar and opened by someone else.
 *
 * Off by default, so Storybook never rewrites its own URL.
 */
const UrlSyncContext = createContext(false);

export const UrlSyncProvider = ({ children }: { children: ReactNode }) => <UrlSyncContext.Provider value={true}>{children}</UrlSyncContext.Provider>;

export const useUrlSyncEnabled = () => useContext(UrlSyncContext);

type ParamValue = string | number | boolean | null | undefined;

/**
 * Mirror view state into the query string with `history.replaceState` (no navigation, no reload).
 * Falsy values and values equal to their default are removed, to keep links short.
 *
 *   useUrlSync({ tab, status: status === "all" ? undefined : status, q: query });
 */
export const useUrlSync = (params: Record<string, ParamValue>) => {
    const enabled = useContext(UrlSyncContext);
    // JSON drops keys whose value is undefined, which would leave a cleared filter in the URL. Keep them as null.
    const serialized = JSON.stringify(params, (_key, value) => (value === undefined ? null : value));
    useEffect(() => {
        if (!enabled || typeof window === "undefined") return;
        const url = new URL(window.location.href);
        const next = JSON.parse(serialized) as Record<string, ParamValue>;
        for (const [key, value] of Object.entries(next)) {
            if (value === undefined || value === null || value === false || value === "") url.searchParams.delete(key);
            else url.searchParams.set(key, String(value));
        }
        const target = `${url.pathname}${url.search}${url.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (target !== current) window.history.replaceState(null, "", target);
    }, [enabled, serialized]);
};

/** Remember the chosen location (in a cookie the server reads) for pages opened without `loc` in the URL. */
export const useRememberLocation = (location: string) => {
    const enabled = useContext(UrlSyncContext);
    useEffect(() => {
        if (!enabled || typeof document === "undefined") return;
        document.cookie = `${LOCATION_COOKIE}=${encodeURIComponent(location)}; path=/; max-age=31536000; samesite=lax`;
    }, [enabled, location]);
};
