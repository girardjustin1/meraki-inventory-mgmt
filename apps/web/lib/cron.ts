/**
 * Authorisation for cron routes.
 *
 * Vercel Cron calls the route with `Authorization: Bearer <CRON_SECRET>` when a CRON_SECRET
 * environment variable exists on the project. These routes are public as far as the request
 * proxy is concerned (there is no user session on a scheduled request), so this check is the
 * only thing standing between the internet and "email the owners".
 *
 * Rules:
 *   - CRON_SECRET set:    the header must match exactly. Always.
 *   - CRON_SECRET unset, production:   every request is refused.
 *   - CRON_SECRET unset, development:  only `?dryRun=1` requests are allowed, so the routes
 *     can be previewed in prototype mode with no keys at all. A dry run never writes to the
 *     database and never sends email.
 */
import { env } from "~/lib/env";
import { safeEqual } from "~/lib/pin";

const NO_STORE = { "Cache-Control": "no-store" };

export const isDryRun = (url: URL) => ["1", "true", "yes"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());

/** Returns null when the request may proceed, or the response to send back. */
export const authorizeCron = (request: Request, options: { dryRun: boolean }): Response | null => {
    const secret = env.cronSecret;
    const header = request.headers.get("authorization") ?? "";

    if (secret) {
        if (safeEqual(header, `Bearer ${secret}`)) return null;
        return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
    }

    if (!env.isProduction && options.dryRun) return null;

    return Response.json(
        { ok: false, error: "cron_secret_not_set", message: "Set CRON_SECRET. Without it only ?dryRun=1 is allowed, and only outside production." },
        { status: 401, headers: NO_STORE },
    );
};

export const cronJson = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: NO_STORE });
