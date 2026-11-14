/**
 * Supabase client for requests made on behalf of the signed-in user.
 *
 * Uses Supabase's native third-party auth integration with Clerk (not the deprecated JWT
 * template): the client is given the publishable key plus an `accessToken` callback that
 * returns the user's Clerk session token. Supabase verifies that token against Clerk's
 * signing keys and exposes its claims to Postgres through auth.jwt(), which is what every
 * row-level security policy in supabase/migrations/0001_init.sql is written against.
 *
 * Consequences worth knowing:
 *   - Everything this client does is subject to RLS as that user. There is no way to
 *     escalate from here; that is the point.
 *   - `supabase.auth.*` is not usable on a client created with `accessToken` (Supabase Auth
 *     is not in play). Identity comes from Clerk.
 *   - Clerk session tokens live for about a minute. `getToken()` hands back a fresh one each
 *     time, so create the client per request (as below) and do not cache it across requests.
 *
 * Server only: Server Components, Route Handlers and Server Actions.
 */
import { auth } from "@clerk/nextjs/server";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { env, isConfigured } from "~/lib/env";

/**
 * Returns a client acting as the current Clerk user, or null in prototype mode (Supabase or
 * Clerk not configured). Callers fall back to the sample data layer on null.
 */
export const createServerSupabase = async (): Promise<SupabaseClient | null> => {
    if (!isConfigured.supabase || !isConfigured.clerk) return null;
    const { getToken } = await auth();
    return createClient(env.supabaseUrl as string, env.supabasePublishableKey as string, {
        // No template argument: this is the plain Clerk session token. It carries
        // `role: "authenticated"` once the Supabase integration is enabled in Clerk.
        accessToken: async () => (await getToken()) ?? null,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { "x-application-name": "meraki-inventory-web" } },
    });
};
