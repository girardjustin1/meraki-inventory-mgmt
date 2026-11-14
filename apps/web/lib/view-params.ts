/**
 * Deep links: read view state from the query string on the server and hand it to the screen as
 * initial props. The screens mirror their state back into the URL (packages/ui/utils/url-sync.tsx),
 * so any view can be copied from the address bar.
 *
 * Every value is checked against an allow-list before it reaches a screen.
 */
import { cookies } from "next/headers";
import { users } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { visibleLocations } from "@/engine/permissions";
import { LOCATION_COOKIE } from "@/utils/location-cookie";
import { VIEWER_COOKIE } from "@/utils/viewer-cookie";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The value if it is one of the allowed options. */
export const oneOf = <T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined => {
    const v = first(value);
    return allowed.includes(v as T) ? (v as T) : undefined;
};

/** Comma-separated values, keeping only allowed ones. */
export const manyOf = <T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T[] =>
    (first(value) ?? "").split(",").filter((v): v is T => allowed.includes(v as T));

/** Free text, trimmed and capped. */
export const text = (value: string | string[] | undefined, max = 120) => (first(value) ?? "").trim().slice(0, max) || undefined;

const LOCATIONS = ["lynnfield", "newburyport"] as const;

/** The prototype opens as the owner, who can see everything, until someone picks another sample person. */
export const DEFAULT_VIEWER_ID = "u-owner";

/**
 * Who is using the app. Prototype: the sample person chosen with the "view as" switch.
 * Live (milestone 2): replace with the profile of the signed-in Clerk user (lib/profile.ts).
 */
export const viewer = async (): Promise<User> => {
    const id = (await cookies()).get(VIEWER_COOKIE)?.value ?? DEFAULT_VIEWER_ID;
    return users.find((u) => u.id === id) ?? (users.find((u) => u.id === DEFAULT_VIEWER_ID) as User);
};

/** Which salon to show: `?loc=` wins, then the remembered choice, limited to salons this person may see. */
export const viewLocation = async (params: Record<string, string | string[] | undefined>): Promise<LocationId> => {
    const allowed = visibleLocations(await viewer(), [...LOCATIONS]);
    const fromUrl = oneOf(params.loc, LOCATIONS);
    if (fromUrl && allowed.includes(fromUrl)) return fromUrl;
    const remembered = oneOf((await cookies()).get(LOCATION_COOKIE)?.value, LOCATIONS);
    if (remembered && allowed.includes(remembered)) return remembered;
    return allowed[0] ?? "lynnfield";
};
