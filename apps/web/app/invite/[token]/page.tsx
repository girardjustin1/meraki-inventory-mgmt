import { invites } from "@/data/inventory";
import { staticParams } from "~/lib/base-path";
import { InviteClient } from "./invite-client";

/**
 * Sign-up from an invite link: /invite/<token>.
 * Prototype: the token is looked up in the sample invites and the steps run locally.
 * Live: the preview comes from GET /api/invites/preview and the last step calls POST /api/invites/accept.
 */
/** Invite links are credentials: never leak them in a Referer header. */
export const metadata = { title: "Join Meraki Inventory", referrer: "no-referrer" as const };

export const generateStaticParams = () => staticParams(() => invites.map((invite) => ({ token: invite.token })));

export default function Page() {
    return <InviteClient />;
}
