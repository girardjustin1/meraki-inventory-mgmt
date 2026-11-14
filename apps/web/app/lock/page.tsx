import { viewer } from "~/lib/view-params";
import { LockClient } from "./lock-client";

/** PIN lock. The proxy sends locked sessions here with `?next=<path>`. */
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
    const { next } = await searchParams;
    // Only follow same-site relative paths.
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <LockClient next={safeNext} user={await viewer()} />;
}
