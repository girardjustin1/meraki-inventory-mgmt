/**
 * Invites API: list and create. Admins only ("team.manage").
 *
 *   GET  /api/invites
 *        200 { ok: true, invites: InviteView[], prototype }
 *
 *   POST /api/invites   { email?, name?, role, access?, locations, note? }
 *        201 { ok: true, invite: InviteView, token, url, email: { status, reason? }, prototype }
 *
 *        `email` absent  -> an open link, valid 48 hours, for the admin to pass on
 *        `email` present -> bound to that Google account, valid 7 days, and emailed
 *        `role`           manager | front-desk | technician      (owner cannot be invited)
 *        `access`         user (default) | admin. Admin needs an `email`: no admin open links.
 *        `locations`      ["lynnfield", ...]; at least one unless access is admin
 *
 * `token` and `url` are in the POST response and NOWHERE ELSE, ever. Only a hash of the
 * token is stored, so GET cannot return a link and neither can anything else. Show the link
 * straight away; if it is lost, POST /api/invites/<id> issues a new one.
 *
 * Errors: 400 invalid_json | invalid_input (with `field`) | unknown_location
 *         401 not_signed_in    403 bad_origin | no_profile | forbidden
 *         409 already_pending | already_member
 *
 * In prototype mode (no Supabase) this works on an in-memory copy of the sample invites;
 * see lib/invites.ts. To act as an admin there, send `x-demo-user: u-owner` (lib/auth.ts).
 */
import type { NextRequest } from "next/server";
import { isSameOrigin, json, jsonError, readJsonObject } from "~/lib/http";
import { InviteError, createInvite, listInvites } from "~/lib/invites";
import { requirePermission } from "~/lib/permissions";

export const runtime = "nodejs"; // lib/invites.ts uses node:crypto
export const dynamic = "force-dynamic";

const refused = (error: unknown) => {
    if (error instanceof InviteError) return jsonError(error.code, error.status, error.message, error.field ? { field: error.field } : {});
    console.error("[api/invites] unexpected error", error);
    return jsonError("server_error", 500, "Something went wrong. Try again.");
};

export async function GET() {
    const actor = await requirePermission("team.manage");
    if (actor instanceof Response) return actor;

    try {
        const { invites, prototype } = await listInvites(actor.profile);
        return json({ ok: true, invites, prototype });
    } catch (error) {
        return refused(error);
    }
}

export async function POST(request: NextRequest) {
    if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

    const actor = await requirePermission("team.manage");
    if (actor instanceof Response) return actor;

    const body = await readJsonObject(request);
    if (!body) return jsonError("invalid_json", 400);

    try {
        const issued = await createInvite(actor.profile, body, { requestOrigin: request.nextUrl.origin });
        return json({ ok: true, ...issued }, 201);
    } catch (error) {
        return refused(error);
    }
}
