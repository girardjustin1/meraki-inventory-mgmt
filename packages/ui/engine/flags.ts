/**
 * Flag engine: rules that turn the ledger and purchase orders into things a manager should look at.
 *
 * Every rule is deliberately simple and explainable. A flag never says "theft"; it says what was
 * observed, shows the numbers, and suggests the next step. Thresholds live in FLAG_THRESHOLDS so
 * they can be tuned per location (and later stored in Supabase).
 */
import type { CountSession, Flag, FlagSeverity, Forecast, Item, PurchaseOrder, StockLevel, StockMovement, Vendor } from "@/data/types";
import { daysBetween, formatDate, formatMonth, formatTime } from "./dates";
import { median } from "./forecast";
import { REASON_LABEL } from "./reasons";
import { variancePct } from "./stock";

export const FLAG_THRESHOLDS = {
    /** Count variance beyond this fraction (and at least `countVarianceMinUnits`) raises a flag. */
    countVariancePct: 0.2,
    countVarianceMinUnits: 2,
    /** A count this far out is high severity. */
    countVarianceHighPct: 0.4,
    /** An order line this many times the item's usual quantity is a spike. */
    orderSpikeMultiple: 2,
    orderSpikeMinExtraUnits: 4,
    /** On-hand above par × this is overstock. */
    overParMultiple: 1.5,
    /** Open order lines older than max(this, 2 × vendor lead time) are overdue. */
    overdueReceiptDays: 21,
    /** Orders older than this with open lines are a one-time reconciliation job, reported as a single flag. */
    backlogAfterDays: 120,
    /** Adjustments at or above this many units need a note. */
    adjustmentNoteUnits: 3,
    /** Business hours (24h, local). Adjustments outside are highlighted. */
    openHour: 8,
    closeHour: 20,
};

export interface FlagInput {
    today: string;
    items: Item[];
    vendors: Vendor[];
    stock: StockLevel[];
    purchaseOrders: PurchaseOrder[];
    forecasts: Forecast[];
    countSessions: CountSession[];
    movements: StockMovement[];
    /** Overrides for FLAG_THRESHOLDS, e.g. from the settings table. */
    thresholds?: Partial<typeof FLAG_THRESHOLDS>;
}

const sev = (n: number, high: number, medium: number): FlagSeverity => (n >= high ? "high" : n >= medium ? "medium" : "low");

export const detectFlags = (input: FlagInput): Flag[] => {
    const { today, items, vendors, stock, purchaseOrders, forecasts, countSessions, movements } = input;
    // Per-location overrides (Settings → Flag rules) on top of the defaults.
    const T = { ...FLAG_THRESHOLDS, ...input.thresholds };
    const itemById = new Map(items.map((i) => [i.id, i]));
    const vendorById = new Map(vendors.map((v) => [v.id, v]));
    const flags: Flag[] = [];
    const push = (f: Omit<Flag, "status"> & { status?: Flag["status"] }) => flags.push({ status: "open", ...f });

    // --- Receiving -----------------------------------------------------------------------------
    const orderedByItem = new Map<string, number[]>();
    for (const po of purchaseOrders) {
        for (const line of po.lines) {
            if (line.itemId && line.qtyOrdered > 0) orderedByItem.set(line.itemId, [...(orderedByItem.get(line.itemId) ?? []), line.qtyOrdered]);
        }
    }

    const backlog = new Map<PurchaseOrder["locationId"], { po: PurchaseOrder; open: number; age: number }[]>();

    for (const po of purchaseOrders) {
        const vendor = vendorById.get(po.vendorId);
        for (const line of po.lines) {
            // 1. Quantity received differs from quantity ordered.
            if (line.qtyOrdered > 0 && line.qtyReceived > 0 && line.qtyReceived !== line.qtyOrdered) {
                const diff = line.qtyReceived - line.qtyOrdered;
                const pct = Math.abs(diff) / line.qtyOrdered;
                push({
                    id: `rm-${po.id}-${line.id}`,
                    type: "received-mismatch",
                    // One bottle out on a two-bottle line is worth a glance, not an alarm: severity needs size as well as share.
                    severity: Math.abs(diff) >= 4 && pct >= 0.5 ? "high" : Math.abs(diff) >= 2 ? "medium" : "low",
                    title: `${line.name}: ${diff > 0 ? "more" : "fewer"} received than ordered`,
                    summary:
                        diff > 0
                            ? `${line.qtyReceived} were logged as received against an order for ${line.qtyOrdered}. Either the order was changed without updating the form, or the receipt was entered wrong.`
                            : `Only ${line.qtyReceived} of ${line.qtyOrdered} were logged as received and the line was closed. Check the invoice so Meraki is not billed for the full quantity.`,
                    locationId: po.locationId,
                    itemId: line.itemId,
                    itemName: line.name,
                    purchaseOrderId: po.id,
                    userId: line.receivedBy,
                    detectedAt: line.receivedAt ?? po.createdAt,
                    evidence: [
                        { label: "Ordered", value: String(line.qtyOrdered) },
                        { label: "Received", value: String(line.qtyReceived) },
                        { label: "Difference", value: `${diff > 0 ? "+" : ""}${diff}` },
                        { label: "Order", value: po.number },
                    ],
                    suggestedAction: "Compare with the vendor invoice and packing slip, then correct the receipt or request a credit.",
                    fromRealData: po.imported,
                });
            }

            // 2. A different product type arrived (ordered Regular, received Gel).
            if (line.variant && line.variantReceived && !sameVariant(line.variant, line.variantReceived)) {
                push({
                    id: `vm-${po.id}-${line.id}`,
                    type: "variant-mismatch",
                    severity: "low",
                    title: `${line.name}: ${line.variantReceived} received, ${line.variant} ordered`,
                    summary: `The order asked for ${line.variant} and ${line.variantReceived} was logged at receiving. The shelf count for both types will be off until this is corrected.`,
                    locationId: po.locationId,
                    itemId: line.itemId,
                    itemName: line.name,
                    purchaseOrderId: po.id,
                    userId: line.receivedBy,
                    detectedAt: line.receivedAt ?? po.createdAt,
                    evidence: [
                        { label: "Ordered", value: line.variant },
                        { label: "Received", value: line.variantReceived },
                        { label: "Colour code", value: line.colorCode ?? "n/a" },
                    ],
                    suggestedAction: "Confirm which type is on the shelf and fix the receipt. Reorder the missing type if it is still needed.",
                    fromRealData: po.imported,
                });
            }

            // 3. Order quantity far above this item's usual order.
            if (line.itemId && line.qtyOrdered > 0 && po.status !== "draft" && po.status !== "awaiting-approval") {
                const others = [...(orderedByItem.get(line.itemId) ?? [])];
                const idx = others.indexOf(line.qtyOrdered);
                if (idx >= 0) others.splice(idx, 1);
                const usual = median(others);
                if (
                    others.length >= 2 &&
                    usual > 0 &&
                    line.qtyOrdered >= usual * T.orderSpikeMultiple &&
                    line.qtyOrdered - usual >= T.orderSpikeMinExtraUnits
                ) {
                    push({
                        id: `os-${po.id}-${line.id}`,
                        type: "order-spike",
                        severity: sev(line.qtyOrdered / usual, 3, 2),
                        title: `${line.name}: order ${round1(line.qtyOrdered / usual)}× the usual size`,
                        summary: `${line.qtyOrdered} were ordered in ${formatMonth(po.cycle)}. Other cycles ordered about ${usual}. A jump like this is fine for a promotion or bulk deal, and worth asking about otherwise.`,
                        locationId: po.locationId,
                        itemId: line.itemId,
                        itemName: line.name,
                        purchaseOrderId: po.id,
                        userId: po.createdBy,
                        detectedAt: po.createdAt,
                        evidence: [
                            { label: "This order", value: String(line.qtyOrdered) },
                            { label: "Usual order", value: String(usual) },
                            { label: "Received", value: String(line.qtyReceived) },
                        ],
                        suggestedAction: "Ask who placed the order why the quantity changed, and check where the extra stock is stored.",
                        fromRealData: po.imported,
                    });
                }
            }
        }

        // 4. Order sent, nothing logged as received, well past lead time.
        if (po.status === "sent" || po.status === "partially-received") {
            const open = po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived === 0);
            const age = daysBetween(po.sentAt ?? po.createdAt, today);
            const limit = Math.max(T.overdueReceiptDays, (vendor?.leadTimeDays ?? 7) * 2);
            if (open.length && age > T.backlogAfterDays) {
                // Too old to chase line by line: gather into one reconciliation flag per location (below).
                backlog.set(po.locationId, [...(backlog.get(po.locationId) ?? []), { po, open: open.length, age }]);
            } else if (open.length && age > limit) {
                push({
                    id: `or-${po.id}`,
                    type: "overdue-receipt",
                    // A mostly-open order is a process failure; a few stragglers on a closed order are usually vendor out-of-stocks.
                    severity: sev(open.length / Math.max(1, po.lines.length), 0.5, 0.2),
                    title: `${po.number}: ${open.length} line${open.length === 1 ? "" : "s"} never marked received`,
                    summary: `This ${vendor?.name ?? "vendor"} order was placed ${age} days ago and ${open.length} of ${po.lines.length} lines have no receipt. Either the goods arrived and were not logged, or they never arrived.`,
                    locationId: po.locationId,
                    purchaseOrderId: po.id,
                    detectedAt: today,
                    evidence: [
                        { label: "Placed", value: formatDate(po.sentAt ?? po.createdAt, true) },
                        { label: "Days open", value: String(age) },
                        { label: "Open lines", value: `${open.length} of ${po.lines.length}` },
                        {
                            label: "Examples",
                            value: open
                                .slice(0, 3)
                                .map((l) => l.name)
                                .join("; "),
                        },
                    ],
                    suggestedAction: "Check the shelf for these items. Log the receipt if they are there; contact the vendor if they are not.",
                    fromRealData: po.imported,
                });
            }
        }
    }

    // 4b. Old orders with open lines: one flag per location, so the queue is not buried in history.
    for (const [locationId, entries] of backlog) {
        const lines = entries.reduce((n, e) => n + e.open, 0);
        const sorted = [...entries].sort((x, y) => y.open - x.open);
        push({
            id: `or-backlog-${locationId}`,
            type: "overdue-receipt",
            severity: "medium",
            title: `${entries.length} older order${entries.length === 1 ? "" : "s"} still ${entries.length === 1 ? "has" : "have"} ${lines} lines not marked received`,
            summary: `These orders are more than ${T.backlogAfterDays} days old. The goods most likely arrived and were never logged, but until someone confirms it, on-hand numbers and usage are understated. One sitting to reconcile them resets the baseline.`,
            locationId,
            detectedAt: today,
            evidence: [
                { label: "Orders", value: String(entries.length) },
                { label: "Open lines", value: String(lines) },
                { label: "Oldest", value: `${Math.max(...entries.map((e) => e.age))} days` },
                ...sorted.slice(0, 4).map((e) => ({ label: e.po.number, value: `${e.open} of ${e.po.lines.length} lines open` })),
            ],
            suggestedAction: "Walk the shelves with these orders open. Receive what is there, cancel what never came, and ask the vendor about the rest.",
            fromRealData: entries.some((e) => e.po.imported),
        });
    }

    // 5. Polish repeatedly out of stock at the vendor.
    const oos = new Map<string, { name: string; cycles: Set<string>; locationId: PurchaseOrder["locationId"]; code?: string }>();
    for (const po of purchaseOrders) {
        for (const line of po.lines) {
            if (/\bo\/?s\b/i.test(line.note ?? "")) {
                const key = `${po.locationId}:${line.sku ?? line.name}`;
                const entry = oos.get(key) ?? { name: line.name, cycles: new Set<string>(), locationId: po.locationId, code: line.colorCode };
                entry.cycles.add(po.cycle);
                oos.set(key, entry);
            }
        }
    }
    for (const [key, entry] of oos) {
        if (entry.cycles.size < 2) continue;
        push({
            id: `oos-${key}`,
            type: "repeat-out-of-stock",
            severity: "low",
            title: `${entry.name}: out of stock at the vendor ${entry.cycles.size} cycles running`,
            summary: `The vendor could not supply this colour in ${[...entry.cycles].sort().join(", ")}. It may be discontinued; clients asking for it will keep being disappointed.`,
            locationId: entry.locationId,
            itemName: entry.name,
            detectedAt: today,
            evidence: [
                { label: "Cycles", value: [...entry.cycles].sort().join(", ") },
                { label: "Colour code", value: entry.code ?? "n/a" },
            ],
            suggestedAction: "Ask the vendor whether it is discontinued. If so, mark it discontinued and pick a replacement shade.",
            fromRealData: true,
        });
    }

    // --- Shelf ---------------------------------------------------------------------------------
    for (const level of stock) {
        const item = itemById.get(level.itemId);
        if (!item) continue;

        // 6. Far more on the shelf than the par level calls for.
        if (item.kind === "supply" && !level.isSample && level.par && level.onHand > level.par * T.overParMultiple) {
            push({
                id: `op-${level.locationId}-${level.itemId}`,
                type: "over-par",
                severity: "low",
                title: `${item.name}: ${level.onHand} on hand against a par of ${level.par}`,
                summary: `Stock is ${round1(level.onHand / level.par)}× the recommended level. Either the par is out of date or too much was ordered.`,
                locationId: level.locationId,
                itemId: item.id,
                itemName: item.name,
                detectedAt: level.lastCountedAt ?? today,
                evidence: [
                    { label: "On hand", value: String(level.onHand) },
                    { label: "Par", value: String(level.par) },
                    { label: "Shelf", value: level.shelf || level.area },
                ],
                suggestedAction: "Pause reordering until stock is back near par, or raise the par if usage has grown.",
                fromRealData: true,
            });
        }
    }

    // 7. Likely to run out before a new order could arrive.
    for (const f of forecasts) {
        const item = itemById.get(f.itemId);
        const vendor = item ? vendorById.get(item.vendorId) : undefined;
        if (!item || f.confidence === "none" || f.daysOfCover === undefined) continue;
        const lead = vendor?.leadTimeDays ?? 7;
        if (f.daysOfCover < lead) {
            push({
                id: `sr-${f.locationId}-${f.itemId}`,
                type: "stockout-risk",
                severity: f.daysOfCover <= 2 ? "high" : "medium",
                title: f.onHand <= 0 ? `${item.name}: out of stock` : `${item.name}: about ${f.daysOfCover} day${f.daysOfCover === 1 ? "" : "s"} of stock left`,
                summary:
                    f.onHand <= 0
                        ? `None on hand, and about ${f.monthlyUsage} a month is used. A ${vendor?.name ?? "vendor"} order takes around ${lead} days to arrive.`
                        : `At roughly ${f.monthlyUsage} a month, the ${f.onHand} on hand will run out before a ${vendor?.name ?? "vendor"} order can arrive (${lead}-day lead time).`,
                locationId: f.locationId,
                itemId: item.id,
                itemName: item.name,
                detectedAt: today,
                evidence: [
                    { label: "On hand", value: String(f.onHand) },
                    { label: "Monthly usage", value: String(f.monthlyUsage) },
                    { label: "Days of cover", value: String(f.daysOfCover) },
                    { label: "Suggested order", value: String(f.suggestedOrderQty) },
                ],
                suggestedAction: `Add ${f.suggestedOrderQty} to the next ${vendor?.name ?? "vendor"} order, or pick it up in store this week.`,
                fromRealData: !stock.find((s) => s.itemId === f.itemId && s.locationId === f.locationId)?.isSample,
            });
        }
    }

    // --- Counts --------------------------------------------------------------------------------
    for (const session of countSessions) {
        if (session.status === "scheduled" && daysBetween(session.dueAt, today) > 0) {
            push({
                id: `mc-${session.id}`,
                type: "missed-count",
                severity: sev(daysBetween(session.dueAt, today), 14, 5),
                title: `${session.name}: count is ${daysBetween(session.dueAt, today)} days overdue`,
                summary: `This count was due ${formatDate(session.dueAt, true)} and has not been started. Gaps in counting are where shrinkage hides.`,
                locationId: session.locationId,
                userId: session.assignedTo,
                detectedAt: today,
                evidence: [
                    { label: "Due", value: formatDate(session.dueAt, true) },
                    { label: "Items", value: String(session.lines.length) },
                ],
                suggestedAction: "Reassign or reschedule the count for this week.",
                fromRealData: !session.isSample,
            });
        }
        if (session.status !== "submitted" && session.status !== "approved") continue;
        for (const line of session.lines) {
            if (line.counted === undefined) continue;
            const diff = line.counted - line.expected;
            const pct = variancePct(line.expected, line.counted);
            if (Math.abs(pct) < T.countVariancePct || Math.abs(diff) < T.countVarianceMinUnits) continue;
            const item = itemById.get(line.itemId);
            const value = item?.unitCost ? Math.abs(diff) * item.unitCost : undefined;
            push({
                id: `cv-${session.id}-${line.itemId}`,
                type: "count-variance",
                severity: diff < 0 && Math.abs(pct) >= T.countVarianceHighPct ? "high" : "medium",
                title: `${item?.name ?? line.itemId}: counted ${line.counted}, expected ${line.expected}`,
                summary:
                    diff < 0
                        ? `${Math.abs(diff)} fewer than the ledger expects (${Math.round(Math.abs(pct) * 100)}% short). Nothing recorded explains the gap.`
                        : `${diff} more than the ledger expects. A delivery was probably shelved without being received in the app.`,
                locationId: session.locationId,
                itemId: line.itemId,
                itemName: item?.name,
                userId: session.assignedTo,
                detectedAt: session.submittedAt ?? today,
                evidence: [
                    { label: "Expected", value: String(line.expected) },
                    { label: "Counted", value: String(line.counted) },
                    { label: "Variance", value: `${diff > 0 ? "+" : ""}${diff} (${Math.round(pct * 100)}%)` },
                    ...(value !== undefined ? [{ label: "Value", value: `$${value.toFixed(0)}` }] : []),
                ],
                suggestedAction:
                    diff < 0
                        ? "Recount with a second person. If it holds, review who had access and whether usage was under-logged."
                        : "Look for an unlogged delivery and receive it against the right order.",
                fromRealData: !session.isSample,
            });
        }
    }

    // --- Adjustments ---------------------------------------------------------------------------
    for (const m of movements) {
        if (m.type !== "adjust" || m.delta >= 0) continue;
        const hour = Number(m.at.slice(11, 13));
        const afterHours = hour < T.openHour || hour >= T.closeHour;
        const noNote = !m.note && Math.abs(m.delta) >= T.adjustmentNoteUnits;
        if (!afterHours && !noNote && m.reason !== "suspected-theft" && m.reason !== "lost") continue;
        const item = itemById.get(m.itemId);
        push({
            id: `ua-${m.id}`,
            type: "unexplained-adjustment",
            severity: m.reason === "suspected-theft" ? "high" : afterHours && noNote ? "high" : "medium",
            title: `${item?.name ?? m.itemId}: ${Math.abs(m.delta)} written off${afterHours ? " after hours" : ""}`,
            summary: `Stock was reduced by ${Math.abs(m.delta)} with reason "${REASON_LABEL[m.reason]}"${noNote ? " and no note" : ""}${
                afterHours ? `, at ${formatTime(m.at)} when the salon is closed` : ""
            }.`,
            locationId: m.locationId,
            itemId: m.itemId,
            itemName: item?.name,
            userId: m.userId,
            detectedAt: m.at,
            evidence: [
                { label: "Change", value: String(m.delta) },
                { label: "Reason", value: REASON_LABEL[m.reason] },
                { label: "When", value: `${formatDate(m.at.slice(0, 10), true)}, ${formatTime(m.at)}` },
                { label: "Note", value: m.note ?? "None" },
            ],
            suggestedAction: "Ask the person who made the adjustment for the details and attach a note or photo.",
            fromRealData: !m.isSample,
        });
    }

    // --- Data quality --------------------------------------------------------------------------
    const byName = new Map<string, Item[]>();
    for (const item of items) {
        if (item.kind !== "supply") continue;
        const key = item.name.trim().toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), item]);
    }
    const dupes = [...byName.values()].filter((g) => g.length > 1);
    if (dupes.length) {
        push({
            id: "dq-duplicates",
            type: "data-quality",
            severity: "low",
            title: `${dupes.length} supply items are listed more than once`,
            summary: "The same product appears on two rows of the supply list. Counts and orders get split between them, which hides the true quantity.",
            locationId: "lynnfield",
            detectedAt: today,
            evidence: dupes.slice(0, 4).map((g) => ({ label: g[0]?.name ?? "", value: `${g.length} rows` })),
            suggestedAction: "Merge the duplicates, keeping one row per product per shelf.",
            fromRealData: true,
        });
    }
    const noPar = stock.filter((s) => s.locationId === "lynnfield" && s.parRule === "unset" && itemById.get(s.itemId)?.kind === "supply");
    if (noPar.length) {
        push({
            id: "dq-no-par",
            type: "data-quality",
            severity: "low",
            title: `${noPar.length} supply items have no par level`,
            summary: "Without a par level the app cannot say when these are low, so they only get reordered when someone notices.",
            locationId: "lynnfield",
            detectedAt: today,
            evidence: noPar.slice(0, 4).map((s) => ({ label: itemById.get(s.itemId)?.name ?? s.itemId, value: s.area })),
            suggestedAction: "Set a par level for each, starting with the items reordered most often.",
            fromRealData: true,
        });
    }

    // Severity first. Within a severity, the findings closest to "is anything going missing" lead.
    const order: Record<FlagSeverity, number> = { high: 0, medium: 1, low: 2 };
    return flags.sort(
        (a, b) =>
            order[a.severity] - order[b.severity] || TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type) || b.detectedAt.localeCompare(a.detectedAt),
    );
};

const TYPE_PRIORITY: Flag["type"][] = [
    "count-variance",
    "unexplained-adjustment",
    "received-mismatch",
    "stockout-risk",
    "order-spike",
    "missed-count",
    "overdue-receipt",
    "variant-mismatch",
    "repeat-out-of-stock",
    "over-par",
    "data-quality",
];

const sameVariant = (ordered: string, received: string) => {
    const a = ordered.toLowerCase();
    const b = received.toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const FLAG_TYPE_LABEL: Record<Flag["type"], string> = {
    "received-mismatch": "Receiving mismatch",
    "variant-mismatch": "Wrong type received",
    "order-spike": "Unusual order size",
    "overdue-receipt": "Order not received",
    "count-variance": "Count variance",
    "over-par": "Overstock",
    "stockout-risk": "Stockout risk",
    "repeat-out-of-stock": "Vendor out of stock",
    "missed-count": "Missed count",
    "unexplained-adjustment": "Unexplained adjustment",
    "data-quality": "Data quality",
};
