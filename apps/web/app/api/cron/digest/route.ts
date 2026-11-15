/**
 * Weekly and monthly digest.
 *
 *   GET /api/cron/digest?period=weekly|monthly
 *       Authorization: Bearer <CRON_SECRET>
 *
 *   &dryRun=1            render only: returns the email HTML, sends nothing, writes nothing
 *   &location=lynnfield  one location only
 *
 * The work is in lib/digest-job.ts. Vercel Cron calls the path form of this route,
 * /api/cron/digest/weekly and /api/cron/digest/monthly (see vercel.json), so the schedule
 * does not depend on query strings surviving in a cron path.
 */
import type { NextRequest } from "next/server";
import { runDigestJob } from "~/lib/digest-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: NextRequest) {
    return runDigestJob(request, request.nextUrl.searchParams.get("period"));
}
