/**
 * A Clerk user's row in `profiles`: their role, access level and locations.
 *
 * Row-level security reads everything it needs from `profiles` and `profile_locations`. A
 * Clerk user with no profile row, or with `active = false`, passes no policy and sees
 * nothing. So "can this person use the app" is exactly "do they have an active profile".
 *
 * HOW A PROFILE COMES TO EXIST. There is one way in, and it is not this file:
 *   - An admin sends an invite (lib/invites.ts). The person opens the link, signs in with
 *     Google, and the database function `accept_invite()` creates the profile from what the
 *     invite grants, in one transaction (supabase/migrations/0002_access_and_invites.sql).
 *   - The very first owner is created with one SQL statement; see supabase/README.md.
 * Nothing here creates a profile, and Clerk metadata is not read. Earlier versions created a
 * row on first sign-in from Clerk invitation metadata; that path is gone, because it made
 * Clerk a second place where access was decided.
 *
 * Reads use the service-role client and are always pointed at the caller's own row, after
 * Clerk has said who the caller is.
 */
import { clerkClient } from "@clerk/nextjs/server";
import type { LocationId, Role, User } from "@/data/types";
import { env, isConfigured } from "~/lib/env";
import { getAdminSupabase } from "~/lib/supabase/admin";
import { kebab, toAccess } from "~/lib/supabase/mappers";

export type DbRole = "owner" | "manager" | "front_desk" | "technician";
export type DbAccessLevel = "admin" | "user";

export interface Profile {
    id: string;
    email: string;
    name: string;
    role: DbRole;
    /** Owners are always "admin". */
    access: DbAccessLevel;
    active: boolean;
    hasPin: boolean;
    locations: string[];
}

const PROFILE_COLUMNS = "id, email, name, role, access_level, active, has_pin, profile_locations(location_id)";

interface ProfileRow {
    id: string;
    email: string;
    name: string;
    role: DbRole;
    access_level: DbAccessLevel;
    active: boolean;
    has_pin: boolean;
    profile_locations: { location_id: string }[] | null;
}

const toProfile = (row: ProfileRow): Profile => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    access: toAccess(row.access_level, row.role),
    active: row.active,
    hasPin: row.has_pin,
    locations: (row.profile_locations ?? []).map((l) => l.location_id),
});

/**
 * The profile for a Clerk user, active or not. Null when they have none (they were never
 * invited, or have not accepted yet) and in prototype mode.
 */
export const getProfile = async (userId: string): Promise<Profile | null> => {
    const admin = getAdminSupabase();
    if (!admin) return null;
    const { data, error } = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle<ProfileRow>();
    if (error) throw new Error(`Could not load profile: ${error.message}`);
    return data ? toProfile(data) : null;
};

/** A profile in the shape the screens and engine/permissions.ts use. */
export const toDomainUser = (profile: Profile): User => ({
    id: profile.id,
    name: profile.name,
    role: kebab<Role>(profile.role),
    access: profile.access,
    locations: profile.locations as LocationId[],
    email: profile.email,
    hasPin: profile.hasPin,
});

// ------------------------------------------------------------------------------------ the proxy's question

/** How long a "yes" is remembered by one server instance. A "no" is never remembered. */
const ACTIVE_TTL_MS = 60_000;
const activeUntil = new Map<string, number>();

/**
 * Does this Clerk user have an active profile? Asked by proxy.ts on every signed-in request.
 *
 *   true   yes
 *   false  no: not invited, invite not accepted yet, or access removed
 *   null   cannot say: Supabase is not configured, or the lookup failed
 *
 * A yes is cached in memory for a minute, so the usual cost is nothing. A no is not cached,
 * which is what lets someone into the app the moment they accept an invite. The cache also
 * means access that has just been removed can linger in the proxy for up to a minute; the
 * database does not wait, because row-level security reads `profiles` on every query.
 */
export const hasActiveProfile = async (userId: string): Promise<boolean | null> => {
    const admin = getAdminSupabase();
    if (!admin) return null;

    const now = Date.now();
    if ((activeUntil.get(userId) ?? 0) > now) return true;

    const { data, error } = await admin.from("profiles").select("id").eq("id", userId).eq("active", true).maybeSingle<{ id: string }>();
    if (error) {
        console.error(`[profile] could not check the profile for ${userId}: ${error.message}`);
        return null;
    }
    if (!data) {
        activeUntil.delete(userId);
        return false;
    }
    // Keep the map from growing without bound on a long-lived instance.
    if (activeUntil.size > 5_000) activeUntil.clear();
    activeUntil.set(userId, now + ACTIVE_TTL_MS);
    return true;
};

// ------------------------------------------------------------------------------------ people who were never invited

export type RemovalOutcome = "deleted" | "kept_has_profile" | "disabled" | "not_configured" | "failed";

/**
 * Deletes the Clerk account of someone who signed in with Google but was never invited.
 *
 * Clerk's sign-up is open (docs/architecture.md, "Clerk and sign-up"), so a stranger with a
 * Google account can create a Clerk user. They get nothing: no profile, so no data, and the
 * proxy parks them on /invite/required. This removes the leftover account so the user list
 * in Clerk stays equal to the people who were invited.
 *
 * Deliberately conservative:
 *   - off unless CLERK_DELETE_UNINVITED_USERS=true
 *   - never touches anyone who has a profile row, active or not. Former staff keep their
 *     Clerk account, because their id is what ties them to the ledger.
 *   - call it from an explicit action on /invite/required ("Sign out"), not on page load. A
 *     person who has signed in and is about to accept their invite in another tab has no
 *     profile yet either, and must not be deleted from under themselves.
 *
 * NOT VERIFIED against a live Clerk instance; `users.deleteUser` is confirmed from the
 * installed @clerk/backend types only.
 */
export const removeUninvitedClerkUser = async (userId: string): Promise<RemovalOutcome> => {
    if (!isConfigured.clerk || !isConfigured.supabase) return "not_configured";
    if (!env.deleteUninvitedUsers) return "disabled";
    try {
        if (await getProfile(userId)) return "kept_has_profile";
        const client = await clerkClient();
        await client.users.deleteUser(userId);
        return "deleted";
    } catch (error) {
        console.error(`[profile] could not remove uninvited Clerk user ${userId}`, error);
        return "failed";
    }
};
