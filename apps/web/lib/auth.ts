/**
 * Who is making this request?
 *
 * Clerk's current guidance (v7) is to check authentication next to the data, in each page,
 * route handler and server action, and to treat the request proxy as an early redirect and
 * not as the guarantee. `proxy.ts` does the early redirect; these helpers are the guarantee.
 * Call one of them at the top of every route handler and server action that reads or
 * changes data.
 *
 * This file answers "who". "What may they do" is lib/permissions.ts, which builds on it:
 * most routes want `requirePermission()` from there and never call this file directly.
 *
 * In prototype mode (Clerk not configured) there is nobody to authenticate, so the helpers
 * return a demo identity from the sample staff and the app runs on sample data.
 */
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { isConfigured } from "~/lib/env";

export interface RequestUser {
    userId: string;
    /** Clerk session id. Null only for the prototype identity. */
    sessionId: string | null;
    /** True when Clerk is not configured and this is the stand-in demo user. */
    isPrototype: boolean;
}

/** Matches the manager in packages/ui/data/inventory.ts (CURRENT_USER). */
export const PROTOTYPE_USER: RequestUser = { userId: "u-mgr-lyn", sessionId: null, isPrototype: true };

/**
 * PROTOTYPE MODE ONLY: "view as" another sample staff member.
 *
 * Send the header `x-demo-user: u-owner`, or set a `demo_user` cookie, with an id from
 * `users` in packages/ui/data/inventory.ts. It exists so the Admin and User experiences can
 * both be demoed (and tested with curl) before sign-in is switched on: the default demo
 * user is a manager with User access, who is rightly refused by the admin-only routes.
 *
 * It is read only when Clerk is NOT configured. With Clerk keys set the header and cookie
 * are ignored completely; identity then comes from the Clerk session and nothing else.
 */
export const DEMO_USER_HEADER = "x-demo-user";
export const DEMO_USER_COOKIE = "demo_user";

const demoUserId = async (): Promise<string | null> => {
    try {
        const value = (await headers()).get(DEMO_USER_HEADER) ?? (await cookies()).get(DEMO_USER_COOKIE)?.value ?? "";
        return /^[a-z0-9-]{1,40}$/.test(value) ? value : null;
    } catch {
        // Not inside a request (a build-time render, a script): there is nothing to read.
        return null;
    }
};

/** The signed-in user, or null. Never throws. */
export const getRequestUser = async (): Promise<RequestUser | null> => {
    if (!isConfigured.clerk) {
        const demo = await demoUserId();
        return demo ? { userId: demo, sessionId: null, isPrototype: true } : PROTOTYPE_USER;
    }
    const { userId, sessionId } = await auth();
    return userId && sessionId ? { userId, sessionId, isPrototype: false } : null;
};

/**
 * For route handlers: returns the user, or a 401 response to return as-is.
 *
 *   const user = await requireUser();
 *   if (user instanceof Response) return user;
 *
 * This only proves someone is signed in. It does not prove they were invited: a signed-in
 * Clerk user with no profile gets through here. Use requirePermission() or requireActor()
 * from lib/permissions.ts for anything that reads or changes data.
 */
export const requireUser = async (): Promise<RequestUser | Response> => {
    const user = await getRequestUser();
    return user ?? Response.json({ ok: false, error: "not_signed_in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
};

export interface SessionIdentity {
    /** The user's primary email address, lower-cased. Undefined when the claim is not configured. */
    email?: string;
    /** Undefined when the claim is not configured. */
    emailVerified?: boolean;
    name?: string;
}

/**
 * The custom claims on the Clerk session token that accepting an invite depends on.
 *
 * A Clerk session token does not carry the email address by default. It is added in the
 * Clerk dashboard under Sessions > Customize session token:
 *
 *   {
 *     "email": "{{user.primary_email_address}}",
 *     "email_verified": "{{user.email_verified}}",
 *     "name": "{{user.full_name}}"
 *   }
 *
 * The database reads the same claims from the same token (accept_invite() in
 * supabase/migrations/0002_access_and_invites.sql). This helper exists so the API route can
 * notice a missing claim first and say so in plain words. Null in prototype mode and when
 * nobody is signed in.
 */
export const getSessionIdentity = async (): Promise<SessionIdentity | null> => {
    if (!isConfigured.clerk) return null;
    const { userId, sessionClaims } = await auth();
    if (!userId) return null;
    const claims = (sessionClaims ?? {}) as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
    const verified = claims.email_verified;
    return {
        email: text(claims.email)?.toLowerCase(),
        emailVerified: typeof verified === "boolean" ? verified : typeof verified === "string" ? verified.toLowerCase() === "true" : undefined,
        name: text(claims.name),
    };
};
