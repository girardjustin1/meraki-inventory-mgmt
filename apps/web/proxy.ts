/**
 * Request proxy (Next.js 16's name for what used to be middleware.ts; same job, and it runs
 * on the Node.js runtime by default).
 *
 * What it does, in order:
 *   1. Prototype mode (no Clerk keys): passes every request straight through. Clerk is never
 *      invoked, so no keyless development instance is created either.
 *   2. With Clerk: lets public paths through, and sends everyone else who is not signed in
 *      to the sign-in page (API requests get a 401 JSON response).
 *   3. Invited? A signed-in person with no active profile was never invited (or has had
 *      their access removed). They are sent to /invite/required (API requests get 403
 *      `no_profile`). Skipped when Supabase is not configured.
 *   4. PIN lock: a signed-in request without a valid `pin_ok` cookie is sent to /lock (API
 *      requests get 423). A valid cookie is re-issued with a fresh expiry, which is what
 *      makes the timeout an idle timeout.
 *
 * Public paths: the sign-in page, /invite/* (the accept screen and /invite/required: the
 * person has no account or no access yet), /api/invites/preview (answers only to an invite
 * token), /manifest.webmanifest, /api/cron/* (those routes authenticate with CRON_SECRET
 * themselves) and static assets (excluded by the matcher).
 *
 * /api/invites/accept needs a Clerk session but neither a profile nor a PIN: it is the call
 * that creates the profile.
 *
 * IMPORTANT: this is the early redirect, not the guarantee. Clerk's guidance since v7 is to
 * check auth next to the data, and `createRouteMatcher` is deprecated for that reason: path
 * matching here can drift from how Next.js routes a request. Two things follow:
 *   - Every route handler and server action that touches data must call requireUser() from
 *     lib/auth.ts itself. The database is the last line: RLS keys off the Clerk token.
 *   - The path checks below are default-deny. Only the short allowlist is public, so a path
 *     this file fails to recognise ends up protected, never exposed.
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { env, isConfigured } from "~/lib/env";
import { PIN_COOKIE_NAME, pinCookieOptions, pinCookieSecret, signPinCookie, verifyPinCookie } from "~/lib/pin-cookie";
import { hasActiveProfile } from "~/lib/profile";

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Where a signed-in person with no profile is sent. Under /invite, so it is public. */
const NOT_INVITED_PATH = "/invite/required";

/** Reachable without a Clerk session. */
const PUBLIC_PREFIXES = ["/sign-in", "/invite", "/api/invites/preview", "/api/cron", ...(env.clerkSignInUrl?.startsWith("/") ? [env.clerkSignInUrl] : [])];
const isPublicPath = (pathname: string) => pathname === "/manifest.webmanifest" || PUBLIC_PREFIXES.some((p) => matches(pathname, p));

/** Reachable with a Clerk session alone: no profile and no PIN needed. This call is what creates the profile. */
const SESSION_ONLY_PREFIXES = ["/api/invites/accept"];
const isSessionOnly = (pathname: string) => SESSION_ONLY_PREFIXES.some((p) => matches(pathname, p));

/** Reachable with a Clerk session but without the PIN: the lock screen and the API behind it. */
const PIN_EXEMPT_PREFIXES = ["/lock", "/api/pin"];
const isPinExempt = (pathname: string) => PIN_EXEMPT_PREFIXES.some((p) => matches(pathname, p));

const isApiPath = (pathname: string) => matches(pathname, "/api") || matches(pathname, "/trpc");

const NO_STORE = { "Cache-Control": "no-store" };

let warnedAboutPinSecret = false;

/** Built only when Clerk is configured: constructing it is what would start Clerk's keyless mode. */
const clerkHandler = isConfigured.clerk
    ? clerkMiddleware(
          async (auth, request) => {
              const { pathname, search } = request.nextUrl;
              if (isPublicPath(pathname)) return NextResponse.next();

              // ---- signed in? ----------------------------------------------------------
              const { userId, sessionId, redirectToSignIn } = await auth();
              if (!userId || !sessionId) {
                  if (isApiPath(pathname)) return NextResponse.json({ ok: false, error: "not_signed_in" }, { status: 401, headers: NO_STORE });
                  return redirectToSignIn({ returnBackUrl: request.url });
              }

              if (isSessionOnly(pathname)) return NextResponse.next();

              // ---- invited? ------------------------------------------------------------
              // Clerk's sign-up is open, so being signed in proves only that someone has a
              // Google account. Access is having an active profile, and profiles come from
              // accepting an invite. `null` means the answer is not available (Supabase not
              // configured, or the lookup failed): the request goes on, because this is the
              // early redirect and the database refuses a person with no profile regardless.
              if ((await hasActiveProfile(userId)) === false) {
                  if (isApiPath(pathname)) {
                      return NextResponse.json({ ok: false, error: "no_profile", message: "You have not been invited yet, or your access was removed." }, { status: 403, headers: NO_STORE });
                  }
                  const required = request.nextUrl.clone();
                  required.pathname = NOT_INVITED_PATH;
                  required.search = "";
                  return NextResponse.redirect(required);
              }

              // ---- PIN lock ------------------------------------------------------------
              // A convenience lock for shared devices on top of the Clerk session. It is not
              // a second factor; see lib/pin.ts.
              if (isPinExempt(pathname)) return NextResponse.next();

              const secret = pinCookieSecret();
              if (!secret) {
                  if (!warnedAboutPinSecret) {
                      warnedAboutPinSecret = true;
                      console.warn("[proxy] PIN_COOKIE_SECRET is not set: the PIN lock is OFF. Set it to enable the lock.");
                  }
                  return NextResponse.next();
              }

              const subject = { userId, sessionId };
              const unlocked = await verifyPinCookie(request.cookies.get(PIN_COOKIE_NAME)?.value, subject, secret);
              if (!unlocked) {
                  if (isApiPath(pathname)) return NextResponse.json({ ok: false, error: "pin_locked" }, { status: 423, headers: NO_STORE });
                  const lock = request.nextUrl.clone();
                  lock.pathname = "/lock";
                  lock.search = "";
                  // Relative path only, so /lock can never be used as an open redirect.
                  if (pathname !== "/") lock.searchParams.set("next", `${pathname}${search}`);
                  return NextResponse.redirect(lock);
              }

              // Slide the idle window: each request that passes gets a fresh expiry.
              const response = NextResponse.next();
              response.cookies.set(PIN_COOKIE_NAME, await signPinCookie(subject, secret), pinCookieOptions());
              return response;
          },
          env.clerkSignInUrl ? { signInUrl: env.clerkSignInUrl } : {},
      )
    : null;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
    // Prototype mode: no keys, no auth, no-op.
    if (!clerkHandler) return NextResponse.next();
    return clerkHandler(request, event);
}

export const config = {
    matcher: [
        // Everything except Next.js internals and static files (Clerk's recommended pattern).
        // Because files with these extensions skip the proxy, never serve data from a route
        // whose URL ends in one of them (an export at /reports/stock.csv, say) unless that
        // route calls requireUser() itself. Routes under /api always run the proxy.
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
        "/(api|trpc)(.*)",
        // Clerk's own frontend API proxy path, if it is ever enabled.
        "/__clerk/(.*)",
    ],
};
