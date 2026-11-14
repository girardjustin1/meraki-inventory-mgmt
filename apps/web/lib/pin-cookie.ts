/**
 * The `pin_ok` cookie: proof that the PIN was entered recently on this device.
 *
 * Written by app/api/pin/route.ts after a correct PIN, checked and refreshed by proxy.ts on
 * every request. Kept separate from lib/pin.ts and written against Web Crypto (not
 * node:crypto) so the request proxy can import it whatever runtime it is deployed to.
 *
 * Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload part))
 * Payload: { u: Clerk user id, s: Clerk session id, e: expiry in ms since epoch }
 *
 * The cookie is bound to both the user and the Clerk session, so it cannot be replayed for
 * another staff member on the same device, and signing out (which ends the Clerk session)
 * invalidates it even if the cookie itself is left behind.
 *
 * "15 minutes idle" is a sliding window: every request that passes the check gets a fresh
 * cookie with a new expiry. Fifteen minutes without a request and the next one is sent to
 * /lock. The expiry inside the signed payload is what counts; the cookie's own Max-Age only
 * tells the browser when to stop sending it.
 *
 * Like the PIN itself, this is a convenience lock and not an authentication factor.
 */
import { env } from "~/lib/env";

export const PIN_COOKIE_NAME = "pin_ok";

/** Used only outside production when PIN_COOKIE_SECRET is unset, so the flow can be demoed locally. */
const DEV_FALLBACK_SECRET = "dev-only-pin-cookie-secret-not-for-production";

export interface PinCookieSubject {
    userId: string;
    sessionId: string;
}

/** The signing secret, or undefined when the PIN lock cannot be enforced (production without a secret). */
export const pinCookieSecret = (): string | undefined => env.pinCookieSecret ?? (env.isProduction ? undefined : DEV_FALLBACK_SECRET);

export const pinIdleSeconds = () => env.pinIdleMinutes * 60;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string => {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const hmacKey = (secret: string, usage: KeyUsage) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

/** Create a signed cookie value for this user and session, valid for the idle window. */
export const signPinCookie = async (subject: PinCookieSubject, secret: string, now = Date.now()): Promise<string> => {
    const payload = toBase64Url(encoder.encode(JSON.stringify({ u: subject.userId, s: subject.sessionId, e: now + pinIdleSeconds() * 1000 })));
    const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(payload));
    return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
};

/** True when the cookie is authentic, unexpired and belongs to this user and session. */
export const verifyPinCookie = async (value: string | undefined, subject: PinCookieSubject, secret: string, now = Date.now()): Promise<boolean> => {
    if (!value) return false;
    const dot = value.indexOf(".");
    if (dot <= 0 || dot === value.length - 1) return false;
    const payload = value.slice(0, dot);
    try {
        // crypto.subtle.verify compares in constant time.
        const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromBase64Url(value.slice(dot + 1)), encoder.encode(payload));
        if (!valid) return false;
        const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { u?: unknown; s?: unknown; e?: unknown };
        return data.u === subject.userId && data.s === subject.sessionId && typeof data.e === "number" && data.e > now;
    } catch {
        return false;
    }
};

/** Cookie attributes. httpOnly so page scripts cannot read or forge it; lax so links from email still work. */
export const pinCookieOptions = () => ({
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: pinIdleSeconds(),
});
