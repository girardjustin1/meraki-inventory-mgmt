/**
 * What may the person making this request do?
 *
 * The rules themselves live in packages/ui/engine/permissions.ts (`can`, `isAdmin`,
 * ROLE_GRANTS): one source for the screens and for this server code. This file only adds
 * the server part: find out who is calling, load their role, access level and locations,
 * and turn "no" into the right HTTP response.
 *
 * Three layers enforce the same rules, on purpose:
 *   1. the screens hide what a person cannot do          (engine/permissions.ts)
 *   2. route handlers and server actions refuse it here  (this file)
 *   3. the database refuses it whatever the caller       (row-level security, migrations)
 * Layer 3 is the guarantee. Layer 2 is what gives a clean 403 with a reason, and it is the
 * only layer in prototype mode, where there is no database.
 *
 * In a route handler, next to the data:
 *
 *   const actor = await requirePermission("orders.create", "lynnfield");
 *   if (actor instanceof Response) return actor;
 *   // actor.profile is the domain User; actor.user is the Clerk identity
 *
 * In a Server Component or server action, where a Response is no use:
 *
 *   const actor = await getActor();
 *   if (!actor || !hasPermission(actor, "team.manage")) notFound();
 */
import type { LocationId, User } from "@/data/types";
import { type Permission, can, isAdmin } from "@/engine/permissions";
import { type RequestUser, getRequestUser } from "~/lib/auth";
import { isConfigured } from "~/lib/env";
import { jsonError } from "~/lib/http";
import { getProfile, toDomainUser } from "~/lib/profile";

export { can, isAdmin };
export type { Permission };

export interface Actor {
    /** Who Clerk says is calling (or the prototype identity). */
    user: RequestUser;
    /** Their role, access level and locations, in the shape engine/permissions.ts takes. */
    profile: User;
}

/**
 * The profile behind a request identity, or null when they have no active profile.
 *
 * Live: the `profiles` row. Prototype (no Supabase): the sample staff member with that id
 * from packages/ui/data/inventory.ts, so the demo identity and "view as" (lib/auth.ts) get
 * real sample roles. A real Clerk user with Supabase switched off has no sample row and is
 * treated as the default demo user: there is no data to protect in that half-set-up state.
 */
const loadProfile = async (user: RequestUser): Promise<User | null> => {
    if (isConfigured.supabase && !user.isPrototype) {
        const profile = await getProfile(user.userId);
        return profile?.active ? toDomainUser(profile) : null;
    }
    // Imported lazily: the sample data layer is large and live mode should never load it.
    const data = await import("@/data/inventory");
    if (user.isPrototype) return data.userById(user.userId) ?? null;
    return data.CURRENT_USER;
};

/** The caller and their profile, or null when nobody is signed in or they have no active profile. */
export const getActor = async (): Promise<Actor | null> => {
    const user = await getRequestUser();
    if (!user) return null;
    const profile = await loadProfile(user);
    return profile ? { user, profile } : null;
};

/** `can()` for an Actor. Pass a location to also require that they work there (admins work everywhere). */
export const hasPermission = (actor: Actor, permission: Permission, location?: LocationId): boolean => can(actor.profile, permission, location);

/**
 * For route handlers: the signed-in caller with an active profile, or the response to return.
 *   401 not_signed_in   nobody is signed in
 *   403 no_profile      signed in, but never invited (or access was removed)
 */
export const requireActor = async (): Promise<Actor | Response> => {
    const user = await getRequestUser();
    if (!user) return jsonError("not_signed_in", 401);
    const profile = await loadProfile(user);
    if (!profile) return jsonError("no_profile", 403, "You have not been invited yet, or your access was removed. Ask an admin for an invite.");
    return { user, profile };
};

/**
 * For route handlers: the caller, provided they hold `permission` (at `location`, when one
 * is given), or the response to return. Adds to requireActor():
 *   403 forbidden       signed in and invited, but not allowed to do this
 */
export const requirePermission = async (permission: Permission, location?: LocationId): Promise<Actor | Response> => {
    const actor = await requireActor();
    if (actor instanceof Response) return actor;
    if (!hasPermission(actor, permission, location)) {
        return jsonError("forbidden", 403, "You do not have permission to do this.", { permission, ...(location ? { location } : {}) });
    }
    return actor;
};

/** For route handlers that are for admins as such, not for one named permission. */
export const requireAdmin = async (): Promise<Actor | Response> => {
    const actor = await requireActor();
    if (actor instanceof Response) return actor;
    return isAdmin(actor.profile) ? actor : jsonError("forbidden", 403, "This is for admins.");
};
