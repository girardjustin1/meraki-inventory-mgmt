import { SignIn } from "@clerk/nextjs";
import { staticParams } from "~/lib/base-path";
import { isConfigured } from "~/lib/env";
import { SignInClient } from "./sign-in-client";

/**
 * With Clerk keys set this renders Clerk's sign-in (Google only, configured in the Clerk dashboard).
 * Without them it shows the branded prototype screen, which continues to the PIN lock.
 */
/** The static site has no catch-all: it writes out /sign-in alone. */
export const generateStaticParams = () => staticParams(() => [{ "sign-in": [] as string[] }]);

export default function Page() {
    if (!isConfigured.clerk) return <SignInClient />;
    return (
        <main className="flex min-h-dvh items-center justify-center bg-secondary_alt p-4">
            <SignIn />
        </main>
    );
}
