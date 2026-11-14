"use client";

import { useRouter } from "next/navigation";
import { InviteAcceptScreen } from "@/screens/invite-accept/invite-accept-screen";

export function InviteClient({ token }: { token: string }) {
    const router = useRouter();
    return <InviteAcceptScreen token={token} onDone={() => router.push("/")} />;
}
