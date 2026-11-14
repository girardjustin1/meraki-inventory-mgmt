/**
 * Invites API: one invite. Admins only ("team.manage").
 *
 *   DELETE /api/invites/<id>     revoke
 *          200 { ok: true, invite: InviteView, prototype }
 *          The link stops working at once. The invite stays on the list as "revoked".
 *
 *   POST   /api/invites/<id>     resend (no body needed)
 *          200 { ok: true, invite: InviteView, token, url, email: { status, reason? }, prototype }
 *          Issues a NEW link and restarts the expiry clock. The previous link stops working.
 *          An invite bound to an email is emailed again. Works on a pending or an expired
 *          invite. As with creating, `token` and `url` appear in this response only.
 *
 * Errors: 401 not_signed_in    403 bad_origin | no_profile | forbidden
 *         404 not_found        409 not_pending (already accepted or revoked) | already_pending
 */
import type { NextRequest } from "next/server";
import { isSameOrigin, json, jsonError } from "~/lib/http";
import { InviteError, resendInvite, revokeInvite } from "~/lib/invites";
import { requirePermission } from "~/lib/permissions";

export const runtime = "nodejs"; // lib/invites.ts uses node:crypto
export const dynamic = "force-dynamic";

interface Context {
    params: Promise<{ id: string }>;
}

const refused = (error: unknown) => {
    if (error instanceof InviteError) return jsonError(error.code, error.status, error.message, error.field ? { field: error.field } : {});
    console.error("[api/invites/:id] unexpected error", error);
    return jsonError("server_error", 500, "Something went wrong. Try again.");
};

export async function DELETE(request: NextRequest, { params }: Context) {
    if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

    const actor = await requirePermission("team.manage");
    if (actor instanceof Response) return actor;

    try {
        const { id } = await params;
        return json({ ok: true, ...(await revokeInvite(actor.profile, id)) });
    } catch (error) {
        return refused(error);
    }
}

export async function POST(request: NextRequest, { params }: Context) {
    if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

    const actor = await requirePermission("team.manage");
    if (actor instanceof Response) return actor;

    try {
        const { id } = await params;
        return json({ ok: true, ...(await resendInvite(actor.profile, id, { requestOrigin: request.nextUrl.origin })) });
    } catch (error) {
        return refused(error);
    }
}
