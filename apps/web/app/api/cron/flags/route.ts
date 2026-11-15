/**
 * Daily flag scan. Called by Vercel Cron (see vercel.json).
 *
 *   GET /api/cron/flags
 *       Authorization: Bearer <CRON_SECRET>
 *
 *   &dryRun=1   detect and report, but insert nothing and send nothing.
 *
 * Flow: loadState() -> detectFlags() -> insert the flags that are not on file yet -> email
 * each NEW high-severity flag to the roles named by the "high-flag" notification rule.
 *
 * Flag ids are deterministic (for example "cv-<count>-<item>"), which is what makes the scan
 * repeatable: a finding that is already on file is left exactly as it is, including its
 * status, assignee and notes. Existing flags are never updated or closed from here.
 *
 * Two guards against flooding inboxes:
 *   - the first scan on an empty flags table is treated as a baseline. Everything it finds in
 *     the imported backlog is stored, and nothing is emailed. Those flags reach people
 *     through the next digest.
 *   - at most MAX_ALERTS_PER_RUN emails per run. Any further high-severity flags are stored
 *     and appear in the app and the digest.
 *
 * Known limit: the thresholds in the `settings` table are not applied yet. detectFlags()
 * reads the FLAG_THRESHOLDS constant in packages/ui/engine/flags.ts; it needs a thresholds
 * argument before per-location settings can take effect.
 */
import type { NextRequest } from "next/server";
import type { Flag } from "@/data/types";
import { detectFlags } from "@/engine/flags";
import { authorizeCron, cronJson, isDryRun } from "~/lib/cron";
import { sendFlagAlert } from "~/lib/email";
import { env } from "~/lib/env";
import { type AppState, loadState, locationShortName, recipientsFor } from "~/lib/state";
import { getAdminSupabase } from "~/lib/supabase/admin";
import { toFlagInsert } from "~/lib/supabase/mappers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ALERTS_PER_RUN = 10;
const CHUNK = 200;

const chunks = <T>(items: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
};

const countBy = <T>(items: T[], key: (item: T) => string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
    return out;
};

interface StoreResult {
    /** Flags that were not on file before this run. */
    fresh: Flag[];
    /** True when the flags table was empty before this run. */
    baseline: boolean;
}

/**
 * Works out which detected flags are new and, unless this is a dry run, inserts them.
 * In prototype mode "on file" means the flags the sample data layer already holds.
 */
const storeNewFlags = async (state: AppState, detected: Flag[], dryRun: boolean): Promise<StoreResult> => {
    const db = getAdminSupabase();

    if (!db) {
        const onFile = new Set(state.flags.map((f) => f.id));
        return { fresh: detected.filter((f) => !onFile.has(f.id)), baseline: false };
    }

    const any = await db.from("flags").select("id").limit(1);
    if (any.error) throw new Error(`Could not read flags: ${any.error.message}`);
    const baseline = (any.data?.length ?? 0) === 0;

    // Look up by id in chunks: this must see resolved and dismissed flags too, so a finding
    // that was closed is not raised again.
    const onFile = new Set<string>();
    for (const ids of chunks(detected.map((f) => f.id), CHUNK)) {
        const { data, error } = await db.from("flags").select("id").in("id", ids);
        if (error) throw new Error(`Could not read flags: ${error.message}`);
        for (const row of data ?? []) onFile.add((row as { id: string }).id);
    }
    const fresh = detected.filter((f) => !onFile.has(f.id));
    if (dryRun || !fresh.length) return { fresh, baseline };

    // Foreign keys: reference only rows that exist (state was read from the same database).
    const known = {
        items: new Set(state.items.map((i) => i.id)),
        orders: new Set(state.purchaseOrders.map((o) => o.id)),
        users: new Set(state.users.map((u) => u.id)),
    };

    for (const batch of chunks(fresh, CHUNK)) {
        // ignoreDuplicates => ON CONFLICT DO NOTHING: a concurrent run cannot overwrite a flag.
        const { error } = await db.from("flags").upsert(
            batch.map((f) => toFlagInsert(f, known)),
            { onConflict: "id", ignoreDuplicates: true },
        );
        if (error) throw new Error(`Could not insert flags: ${error.message}`);
    }
    return { fresh, baseline };
};

export async function GET(request: NextRequest) {
    const dryRun = isDryRun(request.nextUrl);

    const denied = authorizeCron(request, { dryRun });
    if (denied) return denied;

    let state: AppState;
    let detected: Flag[];
    let stored: StoreResult;
    try {
        state = await loadState();
        detected = detectFlags({
            today: state.today,
            items: state.items,
            vendors: state.vendors,
            stock: state.stock,
            purchaseOrders: state.purchaseOrders,
            forecasts: state.forecasts,
            countSessions: state.countSessions,
            movements: state.movements,
        });
        stored = await storeNewFlags(state, detected, dryRun);
    } catch (error) {
        console.error("[cron/flags] scan failed", error);
        return cronJson({ ok: false, error: "scan_failed", message: error instanceof Error ? error.message : String(error) }, 500);
    }

    const sampleData = state.source === "prototype";
    const high = stored.fresh.filter((f) => f.severity === "high");
    const alerts: { flag: string; location: string; outcome: string; detail?: string }[] = [];

    if (!dryRun && !stored.baseline) {
        const db = getAdminSupabase();
        for (const flag of high.slice(0, MAX_ALERTS_PER_RUN)) {
            const to = recipientsFor(state, "high-flag", flag.locationId);
            if (!to.length) {
                alerts.push({ flag: flag.id, location: flag.locationId, outcome: "skipped", detail: "no_recipients" });
                continue;
            }
            if (sampleData && !env.emailRedirectTo) {
                alerts.push({ flag: flag.id, location: flag.locationId, outcome: "skipped", detail: "prototype_mode" });
                continue;
            }
            const result = await sendFlagAlert({ flag, locationName: locationShortName(state, flag.locationId), sampleData, to });
            alerts.push({
                flag: flag.id,
                location: flag.locationId,
                outcome: result.status,
                ...(result.status === "failed" ? { detail: result.error } : result.status === "skipped" ? { detail: result.reason } : {}),
            });
            if (result.status === "sent" && db) {
                const { error } = await db.from("flags").update({ alerted_at: new Date().toISOString() }).eq("id", flag.id);
                if (error) console.error(`[cron/flags] could not mark ${flag.id} as alerted: ${error.message}`);
            }
        }
    }

    const failed = alerts.some((a) => a.outcome === "failed");
    return cronJson(
        {
            ok: !failed,
            dryRun,
            source: state.source,
            today: state.today,
            detected: detected.length,
            detectedBySeverity: countBy(detected, (f) => f.severity),
            new: stored.fresh.length,
            newBySeverity: countBy(stored.fresh, (f) => f.severity),
            newHigh: high.map((f) => ({ id: f.id, location: f.locationId, title: f.title })),
            baseline: stored.baseline,
            alerts,
            alertsNotSent: stored.baseline ? high.length : Math.max(0, high.length - MAX_ALERTS_PER_RUN),
        },
        failed ? 500 : 200,
    );
}
