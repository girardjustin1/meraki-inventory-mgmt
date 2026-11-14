/**
 * Path form of the digest route, used by Vercel Cron (see vercel.json):
 *
 *   GET /api/cron/digest/weekly
 *   GET /api/cron/digest/monthly
 *       Authorization: Bearer <CRON_SECRET>
 *
 * Same job, same query parameters (dryRun, location, format) as /api/cron/digest?period=...
 */
import type { NextRequest } from "next/server";
import { runDigestJob } from "~/lib/digest-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest, context: { params: Promise<{ period: string }> }) {
    const { period } = await context.params;
    return runDigestJob(request, period);
}
