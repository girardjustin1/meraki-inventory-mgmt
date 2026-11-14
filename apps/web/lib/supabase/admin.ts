/**
 * Supabase client with the secret (service-role) key. It BYPASSES row-level security.
 *
 * Allowed callers, and nothing else:
 *   - app/api/cron/*      scheduled jobs have no user; they read across locations, insert
 *                         flags and record digest runs.
 *   - app/api/pin/route   reads and writes the PIN hash and lockout counters, which no
 *                         signed-in user is allowed to touch (column-level grants).
 *   - lib/profile.ts      creates a user's profile row on first sign-in.
 * Anything done on behalf of a user in the ordinary course of the app goes through
 * lib/supabase/server.ts, so the database enforces who may do what.
 *
 * What still applies even with this key: CHECK constraints (including the
 * separation-of-duties ones) and the append-only triggers on stock_movements and audit_log.
 *
 * Never import this from a client component. The key has no NEXT_PUBLIC_ prefix, so it is
 * undefined in the browser and this returns null there, but the import itself is a mistake.
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { env, isConfigured } from "~/lib/env";

let cached: SupabaseClient | null = null;

/** The service-role client, or null in prototype mode. */
export const getAdminSupabase = (): SupabaseClient | null => {
    if (typeof window !== "undefined") throw new Error("getAdminSupabase() must never run in the browser");
    if (!isConfigured.supabase) return null;
    cached ??= createClient(env.supabaseUrl as string, env.supabaseSecretKey as string, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { "x-application-name": "meraki-inventory-server" } },
    });
    return cached;
};
