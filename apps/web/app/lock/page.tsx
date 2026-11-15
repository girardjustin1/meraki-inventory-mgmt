"use client";

import { useView } from "~/lib/use-view";
import { text } from "~/lib/view-params";
import { LockClient } from "./lock-client";

/** PIN lock. The proxy sends locked sessions here with `?next=<path>`. */
export default function Page() {
    const { params, user } = useView();
    const next = text(params.next, 400);
    // Only follow same-site relative paths.
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <LockClient next={safeNext} user={user} />;
}
