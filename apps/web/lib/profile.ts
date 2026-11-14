/**
 * Links a Clerk user to a row in `profiles`.
 *
 * Row-level security reads a person's role and locations from `profiles` and
 * `profile_locations`. A Clerk user with no profile row passes no policy and sees nothing,
 * so the row has to exist before the app is useful to them.
 *
 * How a profile gets its role:
 *   1. The owner invites a staff member from the Clerk dashboard (or the Clerk API) and puts
 *      their role and locations in the invitation's PUBLIC METADATA, for example
 *        { "role": "front_desk", "locations": ["lynnfield"] }
 *      Clerk copies invitation metadata onto the user when they accept.
 *   2. On the user's first request, `ensureProfile()` creates the row from that metadata.
 *   3. After that the database is the source of truth: the owner changes roles and
 *      locations in the app (Settings > Team), and Clerk metadata is not read again.
 * A user who signs in with no metadata still gets a row, as an inactive technician with no
 * locations, so the owner can see them in Settings > Team and activate them. They see
 * nothing until then. The very first owner is created with one SQL statement; see
 * supabase/README.md.
 *
 * Uses the service-role client: signed-in users cannot insert profiles (no INSERT policy),
 * which is what stops someone creating themselves as an owner.
 */
import { currentUser } from "@clerk/nextjs/server";
import { isConfigured } from "~/lib/env";
import { getAdminSupabase } from "~/lib/supabase/admin";

export type DbRole = "owner" | "manager" | "front_desk" | "technician";

export interface Profile {
    id: string;
    email: string;
    name: string;
    role: DbRole;
    active: boolean;
    hasPin: boolean;
    locations: string[];
}

const ROLES: readonly DbRole[] = ["owner", "manager", "front_desk", "technician"];

const parseRole = (value: unknown): DbRole | null => {
    const role = typeof value === "string" ? value.trim().toLowerCase().replace(/-/g, "_") : "";
    return (ROLES as readonly string[]).includes(role) ? (role as DbRole) : null;
};

const parseLocations = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const PROFILE_COLUMNS = "id, email, name, role, active, has_pin, profile_locations(location_id)";

interface ProfileRow {
    id: string;
    email: string;
    name: string;
    role: DbRole;
    active: boolean;
    has_pin: boolean;
    profile_locations: { location_id: string }[] | null;
}

const toProfile = (row: ProfileRow): Profile => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.active,
    hasPin: row.has_pin,
    locations: (row.profile_locations ?? []).map((l) => l.location_id),
});

/**
 * Returns the profile for a Clerk user, creating it on first sight.
 * Returns null in prototype mode, or when the Clerk user cannot be loaded.
 */
export const ensureProfile = async (userId: string): Promise<Profile | null> => {
    const admin = getAdminSupabase();
    if (!admin || !isConfigured.clerk) return null;

    const existing = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle<ProfileRow>();
    if (existing.error) throw new Error(`Could not load profile: ${existing.error.message}`);
    if (existing.data) return toProfile(existing.data);

    const user = await currentUser();
    if (!user || user.id !== userId) return null;
    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) return null;

    const role = parseRole(user.publicMetadata?.role);
    const locations = parseLocations(user.publicMetadata?.locations);

    // `ignoreDuplicates` makes two simultaneous first requests safe: the second insert is a no-op.
    const created = await admin.from("profiles").upsert(
        {
            id: user.id,
            email,
            name: user.fullName ?? email.split("@")[0] ?? "",
            role: role ?? "technician",
            // No role in the invitation means nobody vouched for this person yet.
            active: role !== null,
        },
        { onConflict: "id", ignoreDuplicates: true },
    );
    if (created.error) throw new Error(`Could not create profile: ${created.error.message}`);

    if (role !== null && locations.length) {
        // Unknown location ids are dropped by the query below and not inserted.
        const known = await admin.from("locations").select("id").in("id", locations);
        const rows = (known.data ?? []).map((l: { id: string }) => ({ profile_id: user.id, location_id: l.id }));
        if (rows.length) {
            const linked = await admin.from("profile_locations").upsert(rows, { onConflict: "profile_id,location_id", ignoreDuplicates: true });
            if (linked.error) throw new Error(`Could not assign locations: ${linked.error.message}`);
        }
    }

    const fresh = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle<ProfileRow>();
    if (fresh.error) throw new Error(`Could not load profile: ${fresh.error.message}`);
    return fresh.data ? toProfile(fresh.data) : null;
};
