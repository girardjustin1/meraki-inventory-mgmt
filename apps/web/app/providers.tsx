/**
 * App-wide providers. A Server Component: it decides on the server whether Clerk is in play.
 *
 * With Clerk keys set, children are wrapped in <ClerkProvider>. Without them (prototype
 * mode) children are rendered as they are and Clerk is never touched, so nothing tries to
 * reach Clerk or to start its keyless development mode.
 *
 * Because <ClerkProvider> is absent in prototype mode, Clerk's hooks and components
 * (useUser, <UserButton />, <SignIn />...) will throw there. Guard them:
 *   - in Server Components with `isConfigured.clerk`
 *   - in Client Components with `isClerkEnabledOnClient`
 * both from ~/lib/env.
 *
 * Wire-up in app/layout.tsx (inside <body>):
 *   <Providers>{children}</Providers>
 */
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { env, isConfigured } from "~/lib/env";

export function Providers({ children }: { children: ReactNode }) {
    if (!isConfigured.clerk) return <>{children}</>;

    return (
        <ClerkProvider
            publishableKey={env.clerkPublishableKey}
            // Unset means Clerk's hosted Account Portal handles sign-in.
            {...(env.clerkSignInUrl ? { signInUrl: env.clerkSignInUrl } : {})}
            // Signing out goes back to sign-in; the PIN cookie is bound to the session and dies with it.
            afterSignOutUrl={env.clerkSignInUrl ?? "/"}
            appearance={{
                variables: {
                    colorPrimary: "#245b59",
                    colorForeground: "#17262e",
                    colorBackground: "#ffffff",
                    fontFamily: "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
                    borderRadius: "0.75rem",
                },
            }}
        >
            {children}
        </ClerkProvider>
    );
}
