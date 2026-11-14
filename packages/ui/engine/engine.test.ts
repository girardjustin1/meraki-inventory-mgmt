/**
 * Engine tests. Run from packages/ui: npm run test:engine
 * Uses Node's built-in test runner so there is no test framework to maintain.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CountSession, Item, PurchaseOrder, StockLevel, StockMovement, Vendor } from "@/data/types";
import { addDays, daysBetween, monthKey } from "./dates";
import { buildDigest } from "./digest";
import { detectFlags } from "./flags";
import { confidenceFor, exponentialSmoothing, forecastItem, median, reorderPoint, safetyStock, suggestOrderQty } from "./forecast";
import { formatCount, stockStatus, variancePct } from "./stock";

const TODAY = "2026-11-14";

const vendor: Vendor = { id: "nail-supply-store", name: "Nail Supply Store", channel: "in-store", leadTimeDays: 14, leadTimeIsEstimate: true };
const item = (id: string, over: Partial<Item> = {}): Item => ({
    id,
    kind: "supply",
    name: id,
    category: "Test",
    vendorId: "nail-supply-store",
    unit: "Bottle",
    abc: "B",
    unitCost: 10,
    ...over,
});
const level = (itemId: string, over: Partial<StockLevel> = {}): StockLevel => ({
    itemId,
    locationId: "lynnfield",
    area: "Nail Area",
    shelf: "1A",
    onHand: 10,
    par: 12,
    parRule: "quantity",
    reorderRequested: false,
    isSample: false,
    ...over,
});
const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
    id: "po-1",
    number: "PO-1",
    locationId: "lynnfield",
    vendorId: "nail-supply-store",
    kind: "supply",
    status: "received",
    cycle: "2026-04",
    createdAt: "2026-04-08",
    createdBy: "u-mgr",
    lines: [],
    imported: true,
    ...over,
});
const base = {
    today: TODAY,
    items: [item("a")],
    vendors: [vendor],
    stock: [] as StockLevel[],
    purchaseOrders: [] as PurchaseOrder[],
    forecasts: [],
    countSessions: [] as CountSession[],
    movements: [] as StockMovement[],
};

describe("dates", () => {
    it("adds days and measures gaps in UTC", () => {
        assert.equal(addDays("2026-11-14", 3), "2026-11-17");
        assert.equal(addDays("2026-03-01", -1), "2026-02-28");
        assert.equal(daysBetween("2025-12-15", "2026-02-03"), 50);
        assert.equal(monthKey("2026-11-14"), "2026-11");
    });
});

describe("forecast", () => {
    const input = {
        itemId: "a",
        locationId: "lynnfield" as const,
        onHand: 4,
        par: 12,
        leadTimeDays: 14,
        windowStart: "2025-12-15",
        windowEnd: "2026-08-28",
        today: TODAY,
    };

    it("turns received quantities over a window into a monthly rate", () => {
        const f = forecastItem({
            ...input,
            observations: [
                { month: "2026-01", qty: 12 },
                { month: "2026-03", qty: 6 },
                { month: "2026-04", qty: 5 },
                { month: "2026-07", qty: 6 },
            ],
        });
        // 29 units over 256 days is 3.4 a month.
        assert.equal(f.monthlyUsage, 3.4);
        assert.equal(f.confidence, "high");
        assert.equal(f.observations, 4);
        assert.equal(f.method, "order-history");
        assert.equal(f.projection.length, 3);
        assert.equal(f.projection[0]?.month, "2026-12");
        assert.ok((f.projection[0]?.low ?? 0) < f.monthlyUsage && (f.projection[0]?.high ?? 0) > f.monthlyUsage);
    });

    it("suggests ordering up to par when stock is below it", () => {
        const f = forecastItem({
            ...input,
            observations: [
                { month: "2026-01", qty: 12 },
                { month: "2026-04", qty: 6 },
                { month: "2026-07", qty: 6 },
            ],
        });
        assert.ok(f.suggestedOrderQty >= 8, `expected at least par minus on-hand, got ${f.suggestedOrderQty}`);
        assert.ok(f.daysOfCover !== undefined && f.daysOfCover > 0);
        assert.equal(f.projectedStockoutDate, addDays(TODAY, f.daysOfCover ?? 0));
    });

    it("suggests nothing when stock is above par and above the reorder point", () => {
        const f = forecastItem({
            ...input,
            onHand: 20,
            observations: [
                { month: "2026-01", qty: 3 },
                { month: "2026-04", qty: 3 },
            ],
        });
        assert.equal(f.suggestedOrderQty, 0);
        assert.equal(f.confidence, "medium");
    });

    it("does not suggest one-bottle top-ups or slow items with months of cover", () => {
        const args = { leadTimeDays: 14, safetyStock: 1, reorderPoint: 1 };
        // 10 of 12 on the shelf: above 75% of par, leave it.
        assert.equal(suggestOrderQty({ ...args, onHand: 10, par: 12, dailyUsage: 0 }), 0);
        // 9 of 12: at 75%, top up to par.
        assert.equal(suggestOrderQty({ ...args, onHand: 9, par: 12, dailyUsage: 0 }), 3);
        // At the reorder point but with about 250 days of cover and at par: leave it.
        assert.equal(suggestOrderQty({ ...args, onHand: 1, par: 1, dailyUsage: 0.004 }), 0);
        // At the reorder point and running out within the cycle: order.
        assert.ok(suggestOrderQty({ ...args, onHand: 1, par: 6, dailyUsage: 0.1 }) >= 5);
    });

    it("falls back to par with no history, and says so", () => {
        const f = forecastItem({ ...input, observations: [] });
        assert.equal(f.confidence, "none");
        assert.equal(f.method, "none");
        assert.equal(f.suggestedOrderQty, 8);
        assert.match(f.explanation, /No order history/);
    });

    it("ignores zero-quantity observations when judging confidence", () => {
        const f = forecastItem({
            ...input,
            observations: [
                { month: "2026-01", qty: 0 },
                { month: "2026-04", qty: 4 },
            ],
        });
        assert.equal(f.confidence, "low");
    });

    it("has consistent building blocks", () => {
        assert.equal(confidenceFor(0), "none");
        assert.equal(confidenceFor(1), "low");
        assert.equal(confidenceFor(2), "medium");
        assert.equal(confidenceFor(5), "high");
        assert.equal(median([5, 1, 3]), 3);
        assert.equal(median([4, 6]), 5);
        assert.equal(reorderPoint(0.5, 14, 3), 10);
        // Fewer than three observations: half of lead-time demand.
        assert.equal(safetyStock([4, 6], 0.5, 14), 4);
        assert.equal(exponentialSmoothing([10, 10, 10]), 10);
        assert.ok(exponentialSmoothing([2, 2, 10]) > 2 && exponentialSmoothing([2, 2, 10]) < 10);
    });
});

describe("stock status", () => {
    it("uses the forecast reorder point when there is one", () => {
        assert.equal(stockStatus(level("a", { onHand: 5 }), { reorderPoint: 6, confidence: "high" }), "low");
        assert.equal(stockStatus(level("a", { onHand: 7 }), { reorderPoint: 6, confidence: "high" }), "ok");
    });
    it("falls back to half of par, and a par of 1 with 1 on the shelf is not low", () => {
        assert.equal(stockStatus(level("a", { onHand: 6, par: 12 })), "low");
        assert.equal(stockStatus(level("a", { onHand: 7, par: 12 })), "ok");
        assert.equal(stockStatus(level("a", { onHand: 1, par: 1 })), "ok");
    });
    it("handles out, overstock, paused, no par and fill levels", () => {
        assert.equal(stockStatus(level("a", { onHand: 0 })), "out");
        assert.equal(stockStatus(level("a", { onHand: 20, par: 12 })), "over");
        assert.equal(stockStatus(level("a", { parRule: "paused" })), "paused");
        assert.equal(stockStatus(level("a", { par: undefined, parRule: "unset", onHand: 3 })), "unknown");
        assert.equal(stockStatus(level("a", { fillLevel: "half", onHand: 0.5, parRule: "level" })), "low");
        assert.equal(stockStatus(level("a", { fillLevel: "full", onHand: 1, parRule: "level" })), "ok");
    });
    it("formats counts and variance", () => {
        assert.equal(formatCount(1, "Box"), "1 box");
        assert.equal(formatCount(3, "Box"), "3 boxes");
        assert.equal(formatCount(2, "Bottle"), "2 bottles");
        assert.equal(variancePct(10, 7), -0.3);
        assert.equal(variancePct(0, 0), 0);
    });
});

describe("flags", () => {
    it("flags a receipt that does not match the order", () => {
        const flags = detectFlags({
            ...base,
            purchaseOrders: [po({ lines: [{ id: "l1", itemId: "a", name: "OPI Gel Base Coat", qtyOrdered: 20, qtyReceived: 6, receivedAt: "2026-05-21" }] })],
        });
        const f = flags.find((x) => x.type === "received-mismatch");
        assert.ok(f);
        assert.equal(f.severity, "high");
        assert.equal(f.fromRealData, true);
        assert.ok(f.evidence.some((e) => e.label === "Difference" && e.value === "-14"));
    });

    it("does not flag a line received in full", () => {
        const flags = detectFlags({ ...base, purchaseOrders: [po({ lines: [{ id: "l1", itemId: "a", name: "x", qtyOrdered: 4, qtyReceived: 4 }] })] });
        assert.equal(flags.filter((x) => x.type === "received-mismatch").length, 0);
    });

    it("flags a different polish type at receiving but accepts 'Regular & Gel'", () => {
        const flags = detectFlags({
            ...base,
            purchaseOrders: [
                po({
                    kind: "polish",
                    lines: [
                        { id: "l1", name: "Funny Bunny", qtyOrdered: 3, qtyReceived: 3, variant: "Regular", variantReceived: "Gel" },
                        { id: "l2", name: "DND 601", qtyOrdered: 1, qtyReceived: 1, variant: "Regular & Gel", variantReceived: "Gel" },
                    ],
                }),
            ],
        });
        assert.equal(flags.filter((x) => x.type === "variant-mismatch").length, 1);
    });

    it("flags an order well above the item's usual size, but not drafts", () => {
        const line = (id: string, qty: number) => ({ id, itemId: "a", name: "Base gel", qtyOrdered: qty, qtyReceived: qty });
        const history = [po({ id: "p1", lines: [line("l1", 5)] }), po({ id: "p2", lines: [line("l1", 4)] }), po({ id: "p3", lines: [line("l1", 6)] })];
        const spike = po({ id: "p4", cycle: "2026-07", lines: [line("l1", 12)] });
        assert.equal(detectFlags({ ...base, purchaseOrders: [...history, spike] }).filter((x) => x.type === "order-spike").length, 1);
        assert.equal(detectFlags({ ...base, purchaseOrders: [...history, { ...spike, status: "draft" }] }).filter((x) => x.type === "order-spike").length, 0);
    });

    it("flags a sent order with nothing received, scaled by how much is open", () => {
        const flags = detectFlags({
            ...base,
            purchaseOrders: [
                po({
                    status: "sent",
                    createdAt: addDays(TODAY, -60),
                    lines: [
                        { id: "l1", name: "Acetone", qtyOrdered: 4, qtyReceived: 0 },
                        { id: "l2", name: "Alcohol", qtyOrdered: 4, qtyReceived: 0 },
                    ],
                }),
            ],
        });
        const f = flags.find((x) => x.type === "overdue-receipt");
        assert.ok(f);
        assert.equal(f.severity, "high");
        // A recent order is left alone.
        assert.equal(
            detectFlags({
                ...base,
                purchaseOrders: [po({ status: "sent", createdAt: addDays(TODAY, -5), lines: [{ id: "l1", name: "Acetone", qtyOrdered: 4, qtyReceived: 0 }] })],
            }).length,
            0,
        );
    });

    it("rolls orders older than 120 days into one reconciliation flag per location", () => {
        const old = (id: string, days: number) =>
            po({ id, number: id, status: "sent", createdAt: addDays(TODAY, -days), lines: [{ id: "l1", name: "Acetone", qtyOrdered: 4, qtyReceived: 0 }] });
        const flags = detectFlags({ ...base, purchaseOrders: [old("p1", 177), old("p2", 334)] }).filter((x) => x.type === "overdue-receipt");
        assert.equal(flags.length, 1);
        assert.equal(flags[0]?.severity, "medium");
        assert.match(flags[0]?.title ?? "", /2 older orders still have 2 lines/);
    });

    it("puts shrinkage findings ahead of paperwork findings at the same severity", () => {
        const session: CountSession = {
            id: "c9",
            locationId: "lynnfield",
            area: "Supply Closet",
            name: "Supply Closet",
            status: "submitted",
            assignedTo: "u1",
            dueAt: TODAY,
            submittedAt: `${addDays(TODAY, -3)}T10:00:00Z`,
            blind: true,
            isSample: true,
            lines: [{ itemId: "a", expected: 10, counted: 4 }],
        };
        const flags = detectFlags({
            ...base,
            countSessions: [session],
            purchaseOrders: [po({ status: "sent", createdAt: addDays(TODAY, -60), lines: [{ id: "l1", name: "Acetone", qtyOrdered: 4, qtyReceived: 0 }] })],
        });
        assert.equal(flags[0]?.type, "count-variance");
        assert.equal(flags[1]?.type, "overdue-receipt");
    });

    it("flags a count that is well short, and only on submitted counts", () => {
        const session: CountSession = {
            id: "c1",
            locationId: "lynnfield",
            area: "Supply Closet",
            name: "Supply Closet",
            status: "submitted",
            assignedTo: "u1",
            dueAt: TODAY,
            submittedAt: `${TODAY}T10:00:00Z`,
            blind: true,
            isSample: true,
            lines: [
                { itemId: "a", expected: 10, counted: 5 },
                { itemId: "a", expected: 10, counted: 9 },
            ],
        };
        const flags = detectFlags({ ...base, countSessions: [session] });
        const variance = flags.filter((x) => x.type === "count-variance");
        assert.equal(variance.length, 1);
        assert.equal(variance[0]?.severity, "high");
        assert.equal(detectFlags({ ...base, countSessions: [{ ...session, status: "in-progress" }] }).filter((x) => x.type === "count-variance").length, 0);
    });

    it("honours per-location threshold overrides", () => {
        const session: CountSession = {
            id: "c3",
            locationId: "lynnfield",
            area: "Supply Closet",
            name: "Supply Closet",
            status: "submitted",
            assignedTo: "u1",
            dueAt: TODAY,
            submittedAt: `${TODAY}T10:00:00Z`,
            blind: true,
            isSample: true,
            lines: [{ itemId: "a", expected: 10, counted: 9 }],
        };
        assert.equal(detectFlags({ ...base, countSessions: [session] }).length, 0);
        assert.equal(detectFlags({ ...base, countSessions: [session], thresholds: { countVariancePct: 0.05, countVarianceMinUnits: 1 } }).length, 1);
    });

    it("flags an overdue scheduled count", () => {
        const session: CountSession = {
            id: "c2",
            locationId: "newburyport",
            area: "Nail Area",
            name: "Nail Area",
            status: "scheduled",
            assignedTo: "u1",
            dueAt: addDays(TODAY, -9),
            blind: true,
            isSample: true,
            lines: [],
        };
        assert.equal(detectFlags({ ...base, countSessions: [session] }).filter((x) => x.type === "missed-count").length, 1);
    });

    it("flags after-hours write-offs with no note, and leaves explained daytime ones alone", () => {
        const m = (over: Partial<StockMovement>): StockMovement => ({
            id: "m1",
            itemId: "a",
            locationId: "lynnfield",
            type: "adjust",
            delta: -4,
            balance: 2,
            reason: "correction",
            userId: "u1",
            at: `${TODAY}T21:47:00Z`,
            isSample: true,
            ...over,
        });
        assert.equal(detectFlags({ ...base, movements: [m({})] })[0]?.severity, "high");
        assert.equal(detectFlags({ ...base, movements: [m({ id: "m2", at: `${TODAY}T11:00:00Z`, delta: -1, reason: "damaged", note: "Cracked" })] }).length, 0);
    });

    it("flags overstock only for supplies with a real count", () => {
        const stock = [level("a", { onHand: 5, par: 3 })];
        assert.equal(detectFlags({ ...base, stock }).filter((x) => x.type === "over-par").length, 1);
        assert.equal(detectFlags({ ...base, stock: [{ ...(stock[0] as StockLevel), isSample: true }] }).filter((x) => x.type === "over-par").length, 0);
    });

    it("sorts high severity first", () => {
        const flags = detectFlags({
            ...base,
            stock: [level("a", { onHand: 5, par: 3 })],
            purchaseOrders: [po({ lines: [{ id: "l1", itemId: "a", name: "x", qtyOrdered: 20, qtyReceived: 6 }] })],
        });
        assert.equal(flags[0]?.severity, "high");
    });
});

describe("digest", () => {
    it("summarises a location and keeps only that location's flags", () => {
        const stock = [level("a", { onHand: 2, par: 12 }), level("a", { locationId: "newburyport", onHand: 12 })];
        const orders = [po({ status: "sent", createdAt: "2026-05-21", lines: [{ id: "l1", itemId: "a", name: "a", qtyOrdered: 4, qtyReceived: 0 }] })];
        const flags = detectFlags({ ...base, stock, purchaseOrders: orders });
        const d = buildDigest({
            period: "weekly",
            locationId: "lynnfield",
            today: TODAY,
            items: base.items,
            vendors: base.vendors,
            stock,
            forecasts: [],
            purchaseOrders: orders,
            flags,
            recipients: ["owner@example.com"],
            locationName: "Lynnfield",
        });
        assert.equal(d.period, "weekly");
        assert.equal(d.rangeStart, addDays(TODAY, -7));
        assert.equal(d.stats[0]?.value, "1");
        assert.ok(d.flags.every((f) => f.locationId === "lynnfield"));
        assert.ok(d.insights.length > 0);
        assert.match(d.headline, /Lynnfield/);
    });
});
