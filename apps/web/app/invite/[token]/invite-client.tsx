"use client";

import { useParams, useRouter } from "next/navigation";
import { InviteAcceptScreen } from "@/screens/invite-accept/invite-accept-screen";

export function InviteClient() {
    const { token } = useParams<{ token: string }>();
    const router = useRouter();
    return <InviteAcceptScreen token={decodeURIComponent(token)} onDone={() => router.push("/")} />;
}
