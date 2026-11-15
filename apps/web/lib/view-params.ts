/**
 * Deep links: turn the query string and the remembered choices into a screen's initial props.
 * The screens mirror their state back into the URL (packages/ui/utils/url-sync.tsx), so any view
 * can be copied from the address bar.
 *
 * These helpers are plain functions with no server or browser dependency. Pages call them from
 * `useView()` (lib/use-view.ts), which reads the URL and cookies in the browser. That is what lets
 * the same pages run on a server and as a static site.
 *
 * Every value is checked against an allow-list before it reaches a screen.
 */
import { users } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { visibleLocations } from "@/engine/permissions";

/** Query-string values as a page receives them. */
export type Params = Record<string, string | string[] | undefined>;

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
export const pickViewer = (id: string | undefined): User => users.find((u) => u.id === id) ?? (users.find((u) => u.id === DEFAULT_VIEWER_ID) as User);

/** Which salon to show: `?loc=` wins, then the remembered choice, limited to salons this person may see. */
export const pickLocation = (params: Params, remembered: string | undefined, user: User): LocationId => {
    const allowed = visibleLocations(user, [...LOCATIONS]);
    const fromUrl = oneOf(params.loc, LOCATIONS);
    if (fromUrl && allowed.includes(fromUrl)) return fromUrl;
    const saved = oneOf(remembered, LOCATIONS);
    if (saved && allowed.includes(saved)) return saved;
    return allowed[0] ?? "lynnfield";
};
