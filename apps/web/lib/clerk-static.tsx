/**
 * Stand-in for `@clerk/nextjs` in the static site (see next.config.ts).
 *
 * Clerk's package ships server actions, which a static export cannot contain, and the static
 * site has no sign-in to connect anyway: it always runs in prototype mode. Nothing here is
 * rendered, because every use of Clerk is behind `isConfigured.clerk`.
 */
import type { ReactNode } from "react";

export const ClerkProvider = ({ children }: { children?: ReactNode; [prop: string]: unknown }) => <>{children}</>;
export const SignIn = () => null;
