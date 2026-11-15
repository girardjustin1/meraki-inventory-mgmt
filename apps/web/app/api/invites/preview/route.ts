/**
 * Invite preview: what the accept screen shows someone who holds a link, before they sign in.
 *
 *   GET /api/invites/preview?token=mk_...
 *       200 { ok: true, preview: InvitePreview, prototype }
 *
 *   preview.status is one of
 *     pending    plus inviterName, role, access, locationNames, note, expiresAt, emailBound,
 *                maskedEmail ("n••••@example.com") and name (the greeting the inviter typed)
 *     accepted | expired | revoked
 *                plus inviterName, expiresAt and emailBound, and nothing about what it granted
 *     invalid    nothing else. Unknown token, malformed token and missing token all look
 *                exactly like this.
 *
 * PUBLIC, deliberately: the person opening an invite has no account yet. What keeps that safe:
 *   - It answers only to a token, which is 256 random bits. There is nothing to enumerate.
 *   - It never takes an email address and never looks one up, so it cannot be used to learn
 *     whether an address has an invite or an account. The full address is never returned.
 *   - Every request costs the same: one hash, one indexed lookup, whatever was sent. A wrong
 *     token gets the same 200 and the same shape as a right one, so neither the status code
 *     nor the timing says "close".
 *   - It is the ONLY way to look a token up. The database function behind it is not callable
 *     with the publishable key (see the migration), so limiting this one URL limits all
 *     token lookups. It is a plain GET with no body and no cookies needed: a rate-limit rule
 *     in the Vercel Firewall on the path /api/invites/preview covers it. No limiter is built
 *     in here, because an in-memory one does not hold across serverless instances.
 *   - Responses are never cached and ask not to be sent as a referrer.
 *
 * The token arrives in the query string, so it can appear in request logs. That is the same
 * exposure as the invite page's own URL, and it is why a token works once and expires.
 */
import type { NextRequest } from "next/server";
import { json, jsonError } from "~/lib/http";
import { previewInvite } from "~/lib/invites";

export const runtime = "nodejs"; // lib/invites.ts uses node:crypto
export const dynamic = "force-dynamic";

const HEADERS = { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

export async function GET(request: NextRequest) {
    try {
        const { prototype, ...preview } = await previewInvite(request.nextUrl.searchParams.get("token"));
        return json({ ok: true, preview, prototype }, 200, HEADERS);
    } catch (error) {
        // A failure to reach the database. Never includes the reason: it could describe the lookup.
        console.error("[api/invites/preview] lookup failed", error);
        return jsonError("server_error", 503, "The invite could not be checked just now. Try again.");
    }
}
