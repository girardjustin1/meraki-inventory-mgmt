"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import type { LocationId, User } from "@/data/types";
import { LOCATION_COOKIE } from "@/utils/location-cookie";
import { VIEWER_COOKIE } from "@/utils/viewer-cookie";
import { type Params, pickLocation, pickViewer } from "./view-params";

// ---- cookies, readable as React state --------------------------------------------------------

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const readCookie = (name: string) =>
    typeof document === "undefined"
        ? undefined
        : document.cookie
              .split("; ")
              .find((part) => part.startsWith(`${name}=`))
              ?.slice(name.length + 1);

/** Set a year-long cookie and tell every component that reads cookies. */
export const writeCookie = (name: string, value: string) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    for (const listener of listeners) listener();
};

/** A cookie's value. Undefined while rendering ahead of time, then the real value in the browser. */
export const useCookie = (name: string) => {
    const raw = useSyncExternalStore(
        subscribe,
        () => readCookie(name),
        () => undefined,
    );
    return raw === undefined ? undefined : decodeURIComponent(raw);
};

// ---- what a page needs to render its screen ---------------------------------------------------

export interface View {
    /** The query string, one value per key. Check each against an allow-list (lib/view-params.ts). */
    params: Params;
    /** Who is using the app. */
    user: User;
    /** The salon to show. */
    location: LocationId;
}

/**
 * The query string, the person using the app and the salon to show, read in the browser.
 * Pages are rendered inside a Suspense boundary (app/layout.tsx), which `useSearchParams` needs.
 */
export const useView = (): View => {
    const search = useSearchParams();
    const viewerId = useCookie(VIEWER_COOKIE);
    const remembered = useCookie(LOCATION_COOKIE);
    return useMemo(() => {
        const params: Params = Object.fromEntries(search.entries());
        const user = pickViewer(viewerId);
        return { params, user, location: pickLocation(params, remembered, user) };
    }, [search, viewerId, remembered]);
};
