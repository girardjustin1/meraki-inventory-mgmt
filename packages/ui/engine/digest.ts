/**
 * Digest builder: turns the current state into the weekly or monthly summary that is shown in
 * the app and emailed through Resend. Pure function; the cron route calls it and renders the
 * result with the React Email template in apps/web/emails.
 */
import type { Digest, DigestInsight, DigestPeriod, DigestStat, Flag, Forecast, Item, LocationId, PurchaseOrder, StockLevel, Vendor } from "@/data/types";
import { addDays, daysBetween, formatDate } from "./dates";
import { formatCurrency, stockStatus } from "./stock";

export interface DigestInput {
    period: DigestPeriod;
    locationId: LocationId | "all";
    today: string;
    items: Item[];
    vendors: Vendor[];
    stock: StockLevel[];
    forecasts: Forecast[];
    purchaseOrders: PurchaseOrder[];
    flags: Flag[];
    recipients: string[];
    locationName: string;
}

export const buildDigest = (input: DigestInput): Digest => {
    const { period, locationId, today, items, vendors, recipients, locationName } = input;
    const inScope = <T extends { locationId: LocationId }>(xs: T[]) => (locationId === "all" ? xs : xs.filter((x) => x.locationId === locationId));
    const stock = inScope(input.stock);
    const forecasts = inScope(input.forecasts);
    const purchaseOrders = inScope(input.purchaseOrders);
    const flags = inScope(input.flags).filter((f) => f.status === "open" || f.status === "reviewing");

    const days = period === "weekly" ? 7 : 30;
    const rangeStart = addDays(today, -days);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const vendorById = new Map(vendors.map((v) => [v.id, v]));
    const forecastKey = (f: { itemId: string; locationId: LocationId }) => `${f.locationId}:${f.itemId}`;
    const forecastBy = new Map(forecasts.map((f) => [forecastKey(f), f]));

    const supplyStock = stock.filter((s) => itemById.get(s.itemId)?.kind === "supply");
    const statuses = supplyStock.map((s) => stockStatus(s, forecastBy.get(forecastKey(s))));
    const low = statuses.filter((s) => s === "low").length;
    const out = statuses.filter((s) => s === "out").length;
    const stockValue = stock.reduce((sum, s) => sum + s.onHand * (itemById.get(s.itemId)?.unitCost ?? 0), 0);

    const openLines = purchaseOrders
        .filter((po) => po.status === "sent" || po.status === "partially-received")
        .flatMap((po) => po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived === 0));
    const high = flags.filter((f) => f.severity === "high");

    const reorder = forecasts
        .filter((f) => f.suggestedOrderQty > 0 && itemById.get(f.itemId)?.kind === "supply")
        .sort((a, b) => (a.daysOfCover ?? 9999) - (b.daysOfCover ?? 9999))
        .slice(0, period === "weekly" ? 8 : 15)
        .map((f) => {
            const item = itemById.get(f.itemId);
            return {
                itemId: f.itemId,
                name: item?.name ?? f.itemId,
                vendor: vendorById.get(item?.vendorId ?? "other")?.name ?? "Other",
                onHand: f.onHand,
                suggested: f.suggestedOrderQty,
                unit: item?.unit ?? "",
                daysOfCover: f.daysOfCover,
            };
        });
    const reorderCost = forecasts.reduce((sum, f) => sum + f.suggestedOrderQty * (itemById.get(f.itemId)?.unitCost ?? 0), 0);

    // Vendor performance from received lines: fill rate and days from order to receipt.
    const perf = new Map<string, { lines: number; ordered: number; received: number; leadDays: number[] }>();
    for (const po of purchaseOrders) {
        // Only orders where receiving has started: untouched orders are reported as overdue, not as poor fill.
        if (po.status !== "received" && po.status !== "partially-received") continue;
        const name = vendorById.get(po.vendorId)?.name ?? po.vendorId;
        const p = perf.get(name) ?? { lines: 0, ordered: 0, received: 0, leadDays: [] };
        for (const l of po.lines) {
            if (l.qtyOrdered <= 0) continue;
            p.lines += 1;
            p.ordered += l.qtyOrdered;
            p.received += Math.min(l.qtyReceived, l.qtyOrdered);
            // A receipt dated before its order is a data-entry slip in the source sheet; leave it out of the average.
            if (l.receivedAt && daysBetween(po.createdAt, l.receivedAt) >= 0) p.leadDays.push(daysBetween(po.createdAt, l.receivedAt));
        }
        perf.set(name, p);
    }
    const vendorPerformance = [...perf.entries()]
        .filter(([, p]) => p.lines > 0)
        .map(([vendor, p]) => ({
            vendor,
            lines: p.lines,
            fillRate: p.ordered ? p.received / p.ordered : 0,
            avgLeadDays: p.leadDays.length ? Math.round(p.leadDays.reduce((a, b) => a + b, 0) / p.leadDays.length) : undefined,
        }))
        .sort((a, b) => b.lines - a.lines);

    const stats: DigestStat[] = [
        {
            label: "Low or out",
            value: String(low + out),
            tone: low + out > 0 ? "bad" : "good",
            hint: `${out} out, ${low} low, of ${supplyStock.length} supplies`,
        },
        { label: "Open flags", value: String(flags.length), tone: high.length ? "bad" : "neutral", hint: `${high.length} high severity` },
        { label: "Order lines not received", value: String(openLines.length), tone: openLines.length ? "bad" : "good" },
        { label: "Suggested reorder", value: formatCurrency(reorderCost), tone: "neutral", hint: "Sample costs until invoices are loaded" },
        { label: "Stock on hand", value: formatCurrency(stockValue), tone: "neutral", hint: "At sample unit costs" },
    ];

    const insights: DigestInsight[] = [];
    const soonest = reorder[0];
    if (soonest && soonest.daysOfCover !== undefined) {
        insights.push({
            id: "soonest",
            tone: soonest.daysOfCover <= 7 ? "bad" : "warning",
            title: soonest.onHand <= 0 ? `${soonest.name} is out of stock` : `${soonest.name} runs out first`,
            body:
                soonest.onHand <= 0
                    ? `Out of stock now. Order ${soonest.suggested} from ${soonest.vendor}.`
                    : `About ${soonest.daysOfCover} day${soonest.daysOfCover === 1 ? "" : "s"} of stock left (${soonest.onHand} on hand). Order ${soonest.suggested} from ${soonest.vendor}.`,
            href: `/items/${soonest.itemId}`,
        });
    }
    const openOrders = purchaseOrders.filter(
        (po) => (po.status === "sent" || po.status === "partially-received") && po.lines.some((l) => l.qtyOrdered > 0 && l.qtyReceived === 0),
    );
    if (openOrders.length) {
        insights.push({
            id: "overdue",
            tone: "bad",
            title: `${openOrders.length} order${openOrders.length === 1 ? " has" : "s have"} lines never marked received`,
            body: `${openLines.length} lines are still open. Until they are received or cancelled, on-hand numbers and usage forecasts are understated.`,
            href: "/orders",
        });
    }
    const mismatches = flags.filter((f) => f.type === "received-mismatch");
    if (mismatches.length) {
        insights.push({
            id: "mismatch",
            tone: "warning",
            title: `${mismatches.length} deliveries did not match the order`,
            body: `Largest: ${mismatches[0]?.title ?? ""}. Check each against its invoice.`,
            href: "/flags",
        });
    }
    const slow = vendorPerformance.filter((v) => v.avgLeadDays !== undefined).sort((a, b) => (b.avgLeadDays ?? 0) - (a.avgLeadDays ?? 0))[0];
    if (slow?.avgLeadDays !== undefined && slow.avgLeadDays > 14) {
        insights.push({
            id: "lead-time",
            tone: "neutral",
            title: `${slow.vendor} orders take about ${slow.avgLeadDays} days from request to shelf`,
            body: "That is the time from the count date to the receipt date in the 2026 backlog. Par levels need to cover it, or orders need to go out sooner after the count.",
            href: "/reports",
        });
    }
    const worstFill = vendorPerformance.filter((v) => v.lines >= 10).sort((a, b) => a.fillRate - b.fillRate)[0];
    if (worstFill && worstFill.fillRate < 0.9) {
        insights.push({
            id: "fill-rate",
            tone: "warning",
            title: `${worstFill.vendor} filled ${Math.round(worstFill.fillRate * 100)}% of what was ordered`,
            body: `Across ${worstFill.lines} lines on orders where receiving started. Lines the vendor could not supply and lines nobody logged both count against this.`,
            href: "/reports",
        });
    }
    if (!insights.length) insights.push({ id: "clear", tone: "good", title: "Nothing needs attention", body: "Stock, orders and counts are all on track." });

    const where = locationId === "all" ? "across both locations" : `at ${locationName}`;
    const headline = high.length
        ? `${high.length} item${high.length === 1 ? "" : "s"} need${high.length === 1 ? "s" : ""} attention ${where}`
        : low + out > 0
          ? `${low + out} supplies are low ${where}`
          : locationId === "all"
            ? "Both locations are fully stocked"
            : `${locationName} is fully stocked`;

    return {
        id: `${period}-${locationId}-${today}`,
        period,
        locationId,
        rangeStart,
        rangeEnd: today,
        generatedAt: `${today}T07:00:00Z`,
        headline,
        stats,
        insights,
        reorder,
        flags: flags.slice(0, period === "weekly" ? 5 : 10),
        vendorPerformance,
        recipients,
    };
};

export const digestSubject = (d: Digest, locationName: string) =>
    `${d.period === "weekly" ? "Weekly" : "Monthly"} inventory digest, ${locationName}: ${formatDate(d.rangeStart)} to ${formatDate(d.rangeEnd, true)}`;
