/**
 * The digest job, shared by the two routes that expose it:
 *   app/api/cron/digest/route.ts            GET /api/cron/digest?period=weekly|monthly
 *   app/api/cron/digest/[period]/route.ts   GET /api/cron/digest/weekly  (what vercel.json calls)
 *
 * Flow: loadState() -> buildDigest() per location -> render with emails/digest-email.tsx ->
 * send through Resend to the roles named by the notification rule -> record a digest_runs
 * row. The data source sits behind loadState() (lib/state.ts): sample data in prototype
 * mode, Supabase when it is configured. Nothing in this file knows which.
 *
 * Query parameters:
 *   dryRun=1            build and render, but send nothing and write nothing. Returns the
 *                       email HTML for one location (the first, or the one named by
 *                       location=). Add format=json for every location as JSON.
 *   location=lynnfield  limit the run to one location.
 *
 * Safe to call twice: with Supabase configured, a digest already recorded as sent for the
 * same period, location and end date is skipped (Vercel can deliver a cron event more than
 * once), and the Resend idempotency key covers the gap between sending and recording.
 */
import type { NextRequest } from "next/server";
import type { Digest, DigestPeriod, Location } from "@/data/types";
import { buildDigest, digestSubject } from "@/engine/digest";
import { authorizeCron, cronJson, isDryRun } from "~/lib/cron";
import { type SendResult, renderDigestHtml, sendDigest } from "~/lib/email";
import { env } from "~/lib/env";
import { type AppState, loadState, recipientsFor } from "~/lib/state";
import { getAdminSupabase } from "~/lib/supabase/admin";

const RULE_FOR: Record<DigestPeriod, string> = { weekly: "weekly-digest", monthly: "monthly-digest" };

interface Built {
    location: Location;
    digest: Digest;
    subject: string;
}

const build = (state: AppState, period: DigestPeriod, location: Location): Built => {
    const digest = buildDigest({
        period,
        locationId: location.id,
        today: state.today,
        items: state.items,
        vendors: state.vendors,
        stock: state.stock,
        forecasts: state.forecasts,
        purchaseOrders: state.purchaseOrders,
        flags: state.flags,
        recipients: recipientsFor(state, RULE_FOR[period], location.id),
        locationName: location.shortName,
    });
    return { location, digest, subject: digestSubject(digest, location.shortName) };
};

type Outcome = "sent" | "skipped" | "failed";

interface RunSummary {
    location: string;
    subject: string;
    headline: string;
    recipients: number;
    outcome: Outcome;
    detail?: string;
    emailId?: string;
}

/** True when a digest for this period, location and end date has already gone out. */
const alreadySent = async (digest: Digest): Promise<boolean> => {
    const db = getAdminSupabase();
    if (!db) return false;
    const { data, error } = await db
        .from("digest_runs")
        .select("id")
        .eq("period", digest.period)
        .eq("location_id", digest.locationId)
        .eq("range_end", digest.rangeEnd)
        .eq("status", "sent")
        .limit(1);
    if (error) throw new Error(`Could not read digest_runs: ${error.message}`);
    return (data?.length ?? 0) > 0;
};

const record = async (built: Built, outcome: Outcome, result: SendResult | null, detail?: string) => {
    const db = getAdminSupabase();
    if (!db) return;
    const { digest } = built;
    const { error } = await db.from("digest_runs").insert({
        period: digest.period,
        location_id: digest.locationId === "all" ? null : digest.locationId,
        range_start: digest.rangeStart,
        range_end: digest.rangeEnd,
        status: outcome,
        subject: built.subject,
        headline: digest.headline,
        recipients: result?.to ?? digest.recipients,
        summary: { stats: digest.stats, insights: digest.insights.length, reorder: digest.reorder.length, flags: digest.flags.length },
        provider_ids: result?.status === "sent" ? [result.id] : [],
        error: detail ?? null,
    });
    // 23505 = the "sent once" unique index: another delivery of the same cron event got there first.
    if (error && error.code !== "23505") console.error(`[cron/digest] could not record digest run: ${error.message}`);
};

/** `period` comes from the path segment or the ?period= query parameter. */
export async function runDigestJob(request: NextRequest, period: string | null): Promise<Response> {
    const url = request.nextUrl;
    const dryRun = isDryRun(url);

    // Authorise before anything else, including before validating input.
    const denied = authorizeCron(request, { dryRun });
    if (denied) return denied;

    if (period !== "weekly" && period !== "monthly") {
        return cronJson({ ok: false, error: "bad_period", message: "Use ?period=weekly or ?period=monthly." }, 400);
    }

    let state: AppState;
    try {
        state = await loadState();
    } catch (error) {
        console.error("[cron/digest] loadState failed", error);
        return cronJson({ ok: false, error: "load_failed", message: error instanceof Error ? error.message : String(error) }, 500);
    }

    const only = url.searchParams.get("location");
    const locations = only ? state.locations.filter((l) => l.id === only) : state.locations;
    if (!locations.length) return cronJson({ ok: false, error: "unknown_location", locations: state.locations.map((l) => l.id) }, 400);

    const sampleData = state.source === "prototype";
    const builds = locations.map((location) => build(state, period, location));

    // ---- dry run: render only -----------------------------------------------------------
    if (dryRun) {
        if (url.searchParams.get("format") === "json") {
            return cronJson({
                ok: true,
                dryRun: true,
                source: state.source,
                period,
                today: state.today,
                digests: await Promise.all(
                    builds.map(async (b) => ({
                        location: b.location.id,
                        subject: b.subject,
                        recipients: b.digest.recipients,
                        digest: b.digest,
                        html: await renderDigestHtml({ digest: b.digest, locationName: b.location.shortName, sampleData }),
                    })),
                ),
            });
        }
        const first = builds[0] as Built;
        const html = await renderDigestHtml({ digest: first.digest, locationName: first.location.shortName, sampleData });
        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Digest-Source": state.source,
                "X-Digest-Location": first.location.id,
                "X-Digest-Locations": state.locations.map((l) => l.id).join(","),
                "X-Digest-Subject": encodeURIComponent(first.subject),
                "X-Digest-Recipients": String(first.digest.recipients.length),
            },
        });
    }

    // ---- real run -----------------------------------------------------------------------
    const runs: RunSummary[] = [];
    for (const built of builds) {
        const { digest, location, subject } = built;
        const summary = (outcome: Outcome, detail?: string, emailId?: string): RunSummary => ({
            location: location.id,
            subject,
            headline: digest.headline,
            recipients: digest.recipients.length,
            outcome,
            ...(detail ? { detail } : {}),
            ...(emailId ? { emailId } : {}),
        });

        try {
            if (!digest.recipients.length) {
                await record(built, "skipped", null, "no_recipients");
                runs.push(summary("skipped", "no_recipients: the notification rule is off, or nobody at this location has a role it names"));
                continue;
            }
            // Sample figures never go to real inboxes. With EMAIL_REDIRECT_TO set they go to
            // that one address, which is how the email is tested end to end before go-live.
            if (sampleData && !env.emailRedirectTo) {
                runs.push(summary("skipped", "prototype_mode: sample data is not emailed. Set EMAIL_REDIRECT_TO to send yourself a test."));
                continue;
            }
            if (await alreadySent(digest)) {
                runs.push(summary("skipped", "already_sent"));
                continue;
            }

            const result = await sendDigest({ digest, locationName: location.shortName, sampleData, to: digest.recipients });
            if (result.status === "sent") {
                await record(built, "sent", result);
                runs.push(summary("sent", undefined, result.id));
            } else if (result.status === "skipped") {
                await record(built, "skipped", result, result.reason);
                runs.push(summary("skipped", result.reason));
            } else {
                await record(built, "failed", result, result.error);
                runs.push(summary("failed", result.error));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[cron/digest] ${location.id} failed`, error);
            runs.push(summary("failed", message));
        }
    }

    const failed = runs.some((r) => r.outcome === "failed");
    // A 500 makes the failure visible in Vercel's cron logs.
    return cronJson({ ok: !failed, source: state.source, period, today: state.today, runs }, failed ? 500 : 200);
}
