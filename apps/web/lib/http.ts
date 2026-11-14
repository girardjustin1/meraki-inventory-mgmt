/**
 * Conventions shared by the app's own API routes (/api/pin, /api/invites/*).
 *
 *   - Every response is JSON with `Cache-Control: no-store`.
 *   - Errors are `{ ok: false, error: "<code>", message?: "<for people>" }` with a matching
 *     status. Screens switch on `error`; `message` is safe to show as it is.
 *   - Requests that change something (POST, DELETE) are refused with 403 `bad_origin` when
 *     the browser says they came from another site.
 */
import { type NextRequest, NextResponse } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const json = (body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}) =>
    NextResponse.json(body, { status, headers: { ...NO_STORE, ...headers } });

export const jsonError = (error: string, status: number, message?: string, extra: Record<string, unknown> = {}) =>
    json({ ok: false, error, ...(message ? { message } : {}), ...extra }, status);

/** Browsers send Origin on every cross-site POST. Refuse the ones that are not this app. */
export const isSameOrigin = (request: NextRequest): boolean => {
    const origin = request.headers.get("origin");
    if (!origin) return true; // same-origin GET-less clients (curl, server-to-server) send none
    try {
        return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
    } catch {
        return false;
    }
};

/** The request body as a plain object, or null when it is not JSON or not an object. */
export const readJsonObject = async (request: NextRequest): Promise<Record<string, unknown> | null> => {
    try {
        const body: unknown = await request.json();
        return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
    } catch {
        return null;
    }
};
