/**
 * Who is making this request?
 *
 * Clerk's current guidance (v7) is to check authentication next to the data, in each page,
 * route handler and server action, and to treat the request proxy as an early redirect and
 * not as the guarantee. `proxy.ts` does the early redirect; these helpers are the guarantee.
 * Call one of them at the top of every route handler and server action that reads or
 * changes data.
 *
 * In prototype mode (Clerk not configured) there is nobody to authenticate, so the helpers
 * return a fixed demo identity and the app runs on sample data.
 */
import { auth } from "@clerk/nextjs/server";
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

/** The signed-in user, or null. Never throws. */
export const getRequestUser = async (): Promise<RequestUser | null> => {
    if (!isConfigured.clerk) return PROTOTYPE_USER;
    const { userId, sessionId } = await auth();
    return userId && sessionId ? { userId, sessionId, isPrototype: false } : null;
};

/**
 * For route handlers: returns the user, or a 401 response to return as-is.
 *
 *   const user = await requireUser();
 *   if (user instanceof Response) return user;
 */
export const requireUser = async (): Promise<RequestUser | Response> => {
    const user = await getRequestUser();
    return user ?? Response.json({ error: "not_signed_in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
};
