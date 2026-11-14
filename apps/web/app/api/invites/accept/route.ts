/**
 * Accept an invite. The caller must be signed in with Clerk (Google).
 *
 *   POST /api/invites/accept   { token }
 *        200 { ok: true, alreadyAccepted, role, access, locations, next, prototype }
 *            `next` is where to send the person: "/lock", where they choose a PIN.
 *
 * Who is accepting comes from the Clerk session and from nothing in the request. The body
 * carries the token and that is all; an email address in the body would be ignored.
 * With Supabase configured the work is done by the database function accept_invite(), as
 * the caller, in one transaction: it locks the invite, checks it, creates the profile and
 * its locations, marks the invite used and writes the audit log.
 *
 * Errors (`error`, status):
 *   not_signed_in        401  no Clerk session. Sign in with Google first, then call again.
 *   bad_origin           403
 *   invalid_json         400
 *   invalid              404  no such invite (or no token sent)
 *   expired              410  ask the inviter to resend it
 *   revoked              410
 *   already_accepted     410  the link has been used, by someone else
 *   email_mismatch       403  signed in with a different Google account than the one invited
 *   email_not_verified   403
 *   already_member       409  the caller already has access; nothing was changed
 *   email_in_use         409  the address belongs to another account's profile; an admin has to help
 *   email_claim_missing  503  SET-UP FAULT, not the person's: the Clerk session token does not
 *                             carry the email address. Add the claims described in lib/auth.ts
 *                             (Clerk dashboard > Sessions > Customize session token).
 *
 * The request proxy lets this path through for a signed-in user who has no profile and no
 * PIN yet: that is exactly who calls it.
 *
 * Prototype mode (no Clerk or no Supabase): there is no Google account, so the route acts
 * as a brand-new person whose address is the one the invite is for. Send the header
 * `x-demo-email: someone@example.com` to try the wrong-account case. Nothing is stored
 * beyond marking the in-memory invite as used.
 */
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSessionIdentity, requireUser } from "~/lib/auth";
import { isConfigured } from "~/lib/env";
import { isSameOrigin, json, jsonError, readJsonObject } from "~/lib/http";
import { type AcceptError, type AcceptIdentity, acceptInvite } from "~/lib/invites";

export const runtime = "nodejs"; // lib/invites.ts uses node:crypto
export const dynamic = "force-dynamic";

const REFUSALS: Record<AcceptError, { status: number; message: string }> = {
    not_signed_in: { status: 401, message: "Sign in with Google first." },
    invalid: { status: 404, message: "This invite link is not valid. Check that you copied all of it, or ask for a new one." },
    expired: { status: 410, message: "This invite has expired. Ask the person who invited you to send it again." },
    revoked: { status: 410, message: "This invite was cancelled. Ask the person who invited you for a new one." },
    already_accepted: { status: 410, message: "This invite has already been used." },
    email_mismatch: { status: 403, message: "This invite is for a different Google account. Sign out, then sign in with the account it was sent to." },
    email_not_verified: { status: 403, message: "Your email address has not been verified. Sign in with Google and try again." },
    already_member: { status: 409, message: "You already have access. Nothing was changed." },
    email_in_use: { status: 409, message: "This email address is already linked to another account here. Ask an admin to sort it out." },
    email_claim_missing: { status: 503, message: "Sign-in is not fully set up yet, so invites cannot be accepted. Tell the person who invited you." },
};

/** Prototype mode: a stand-in for the Google account that would be signed in. */
const prototypeIdentity = (request: NextRequest): AcceptIdentity => {
    const header = request.headers.get("x-demo-email")?.trim().toLowerCase();
    const email = header && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(header) ? header : undefined;
    // No header: `presentInvitedEmail` below makes lib/invites.ts act as the invited person.
    return { userId: `u-demo-${createHash("sha256").update(email ?? "invitee").digest("hex").slice(0, 8)}`, email, emailVerified: true };
};

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

    const user = await requireUser();
    if (user instanceof Response) return user;

    const body = await readJsonObject(request);
    if (!body) return jsonError("invalid_json", 400);

    const live = isConfigured.clerk && isConfigured.supabase && !user.isPrototype;
    let identity: AcceptIdentity;
    if (live) {
        const session = await getSessionIdentity();
        // Checked here so the fault is named clearly. The database checks it again and
        // would refuse on its own.
        if (!session?.email) {
            console.error("[api/invites/accept] The Clerk session token has no `email` claim. Add it under Sessions > Customize session token (see lib/auth.ts).");
            return jsonError("email_claim_missing", REFUSALS.email_claim_missing.status, REFUSALS.email_claim_missing.message);
        }
        identity = { userId: user.userId, ...session };
    } else {
        identity = prototypeIdentity(request);
    }

    try {
        const result = await acceptInvite(body.token, identity, { presentInvitedEmail: !live && !identity.email });
        if (!result.ok) return jsonError(result.error, REFUSALS[result.error].status, REFUSALS[result.error].message, { prototype: result.prototype });
        const { ok: _ok, ...granted } = result;
        return json({ ok: true, ...granted, next: "/lock" });
    } catch (error) {
        console.error("[api/invites/accept] failed", error);
        return jsonError("server_error", 500, "The invite could not be accepted just now. Try again.");
    }
}
