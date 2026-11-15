/**
 * Insights engine: forward-looking analysis for planning.
 *
 * Pure functions over purchase orders, stock and forecasts. Each function is honest about what the
 * data can support: where there is not enough history it returns a status saying so, with what is
 * needed, instead of a number that looks precise.
 *
 * What today's data supports (2026 order cycles only, no costs, no service counts):
 *   - demand per product and per colour, from what was ordered each cycle
 *   - colour-family mix by cycle (an early seasonal signal)
 *   - slow movers: stocked but never reordered
 *   - when each item will need reordering
 * What needs more:
 *   - seasonality indices: 12 months of monthly usage
 *   - spend and profitability: unit costs from invoices, service prices and counts from Meevo
 */
import type { Forecast, Item, LocationId, PolishLine, PurchaseOrder, StockLevel, Vendor } from "@/data/types";
import { addDays, addMonths, daysBetween, monthKey } from "./dates";

// ------------------------------------------------------------------------------------ demand

export interface DemandRow {
    itemId: string;
    name: string;
    kind: Item["kind"];
    line?: PolishLine;
    family?: string;
    colorCode?: string;
    swatch?: string;
    /** Number of order cycles this item appeared in. */
    cycles: number;
    /** Total quantity ordered across those cycles. */
    qty: number;
    /** Quantity ordered that was never logged as received. */
    unfilled: number;
    /** yyyy-mm -> quantity ordered. */
    byCycle: Record<string, number>;
    firstCycle: string;
    lastCycle: string;
}

export interface DemandOptions {
    kind?: Item["kind"];
    locationId?: LocationId;
    line?: PolishLine;
}

/** What was ordered, per item, across cycles. Ordered quantity is the demand signal: it is what staff asked for. */
export const demandByItem = (purchaseOrders: PurchaseOrder[], items: Item[], options: DemandOptions = {}): DemandRow[] => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const rows = new Map<string, DemandRow>();
    for (const po of purchaseOrders) {
        if (options.locationId && po.locationId !== options.locationId) continue;
        if (po.status === "draft" || po.status === "cancelled") continue;
        for (const line of po.lines) {
            if (!line.itemId || line.qtyOrdered <= 0) continue;
            const item = itemById.get(line.itemId);
            if (!item) continue;
            if (options.kind && item.kind !== options.kind) continue;
            if (options.line && item.line !== options.line) continue;
            const row = rows.get(item.id) ?? {
                itemId: item.id,
                name: item.name,
                kind: item.kind,
                line: item.line,
                family: item.colorFamily,
                colorCode: item.colorCode,
                swatch: item.swatch,
                cycles: 0,
                qty: 0,
                unfilled: 0,
                byCycle: {},
                firstCycle: po.cycle,
                lastCycle: po.cycle,
            };
            if (row.byCycle[po.cycle] === undefined) row.cycles += 1;
            row.byCycle[po.cycle] = (row.byCycle[po.cycle] ?? 0) + line.qtyOrdered;
            row.qty += line.qtyOrdered;
            row.unfilled += Math.max(0, line.qtyOrdered - line.qtyReceived);
            if (po.cycle < row.firstCycle) row.firstCycle = po.cycle;
            if (po.cycle > row.lastCycle) row.lastCycle = po.cycle;
            rows.set(item.id, row);
        }
    }
    return [...rows.values()].sort((a, b) => b.qty - a.qty || b.cycles - a.cycles || a.name.localeCompare(b.name));
};

/** The order cycles (yyyy-mm) present for a kind of order, oldest first. */
export const cyclesOf = (purchaseOrders: PurchaseOrder[], kind?: PurchaseOrder["kind"], locationId?: LocationId): string[] =>
    [
        ...new Set(
            purchaseOrders
                .filter((po) => (!kind || po.kind === kind) && (!locationId || po.locationId === locationId) && po.status !== "draft")
                .map((po) => po.cycle),
        ),
    ].sort();

export interface GroupMix {
    group: string;
    qty: number;
    /** Share of all quantity ordered, 0 to 1. */
    share: number;
    items: number;
    byCycle: Record<string, number>;
    /** Share of each cycle's quantity taken by this group: the early seasonal signal. */
    shareByCycle: Record<string, number>;
}

/** Demand grouped by colour family, product line, category or any other key. */
export const demandMix = (rows: DemandRow[], cycles: string[], groupOf: (row: DemandRow) => string | undefined): GroupMix[] => {
    const total = rows.reduce((n, r) => n + r.qty, 0);
    const cycleTotals: Record<string, number> = {};
    for (const c of cycles) cycleTotals[c] = rows.reduce((n, r) => n + (r.byCycle[c] ?? 0), 0);
    const groups = new Map<string, GroupMix>();
    for (const row of rows) {
        const key = groupOf(row) || "Ungrouped";
        const g = groups.get(key) ?? { group: key, qty: 0, share: 0, items: 0, byCycle: {}, shareByCycle: {} };
        g.qty += row.qty;
        g.items += 1;
        for (const c of cycles) g.byCycle[c] = (g.byCycle[c] ?? 0) + (row.byCycle[c] ?? 0);
        groups.set(key, g);
    }
    for (const g of groups.values()) {
        g.share = total ? g.qty / total : 0;
        for (const c of cycles) g.shareByCycle[c] = cycleTotals[c] ? (g.byCycle[c] ?? 0) / (cycleTotals[c] as number) : 0;
    }
    return [...groups.values()].sort((a, b) => b.qty - a.qty);
};

/** Groups whose share of an order cycle moved most between the first and last cycle. */
export const mixShifts = (mix: GroupMix[], cycles: string[]) => {
    const first = cycles[0];
    const last = cycles[cycles.length - 1];
    if (!first || !last || first === last) return [];
    return mix
        .map((g) => ({
            group: g.group,
            from: g.shareByCycle[first] ?? 0,
            to: g.shareByCycle[last] ?? 0,
            change: (g.shareByCycle[last] ?? 0) - (g.shareByCycle[first] ?? 0),
        }))
        .filter((s) => Math.abs(s.change) >= 0.03)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
};

// ------------------------------------------------------------------------------------ slow movers

export interface SlowMover {
    itemId: string;
    name: string;
    onHand: number;
    value: number;
    reason: "never-ordered" | "not-ordered-recently";
    lastCycle?: string;
}

/**
 * Stock that is sitting: on the shelf, yet not reordered in the window. For polish this is the
 * list of colours to consider retiring; for supplies it is cash on the shelf.
 */
export const slowMovers = (
    stock: StockLevel[],
    items: Item[],
    demand: DemandRow[],
    cycles: string[],
    options: { kind?: Item["kind"]; minOnHand?: number } = {},
): SlowMover[] => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const demandById = new Map(demand.map((d) => [d.itemId, d]));
    const recent = cycles.slice(-2);
    const out: SlowMover[] = [];
    for (const level of stock) {
        const item = itemById.get(level.itemId);
        if (!item || (options.kind && item.kind !== options.kind) || level.fillLevel) continue;
        if (level.onHand < (options.minOnHand ?? 1)) continue;
        const d = demandById.get(level.itemId);
        const orderedRecently = d && recent.some((c) => (d.byCycle[c] ?? 0) > 0);
        if (orderedRecently) continue;
        out.push({
            itemId: item.id,
            name: item.name,
            onHand: level.onHand,
            value: level.onHand * (item.unitCost ?? 0),
            reason: d ? "not-ordered-recently" : "never-ordered",
            lastCycle: d?.lastCycle,
        });
    }
    return out.sort((a, b) => b.value - a.value || b.onHand - a.onHand);
};

// ------------------------------------------------------------------------------------ concentration

export interface ParetoPoint {
    itemId: string;
    name: string;
    value: number;
    /** Cumulative share of the total after this item, 0 to 1. */
    cumulative: number;
}

/** Rank items by a value (spend, quantity) with the running share: "9 items are 80% of spend". */
export const pareto = (rows: { itemId: string; name: string; value: number }[]): { points: ParetoPoint[]; itemsFor80: number; total: number } => {
    const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    const total = sorted.reduce((n, r) => n + r.value, 0);
    let running = 0;
    const points = sorted.map((r) => {
        running += r.value;
        return { ...r, cumulative: total ? running / total : 0 };
    });
    const idx = points.findIndex((p) => p.cumulative >= 0.8);
    return { points, itemsFor80: idx < 0 ? points.length : idx + 1, total };
};

// ------------------------------------------------------------------------------------ seasonality

export const SEASONALITY_MIN_MONTHS = 12;

export type Seasonality =
    | {
          status: "ok";
          monthsCovered: number;
          /** month number 1-12 -> index, where 1.0 is an average month */ index: Record<number, number>;
          peak: number;
          trough: number;
      }
    | {
          status: "insufficient";
          monthsCovered: number;
          monthsNeeded: number;
          /** Earliest date a full year can exist: twelve months after the first month of data, and only if every month from now on has usage logged. */
          readyFrom?: string;
      };

/**
 * Seasonal index per calendar month: that month's usage relative to the average month.
 * Needs at least twelve distinct months of monthly data. With less it says so; a seasonal
 * pattern read from a few order cycles is noise.
 */
export const seasonality = (monthly: { month: string; qty: number }[]): Seasonality => {
    const byMonth = new Map<string, number>();
    for (const m of monthly) byMonth.set(m.month, (byMonth.get(m.month) ?? 0) + m.qty);
    const months = [...byMonth.keys()].sort();
    if (months.length < SEASONALITY_MIN_MONTHS) {
        return {
            status: "insufficient",
            monthsCovered: months.length,
            monthsNeeded: SEASONALITY_MIN_MONTHS - months.length,
            readyFrom: months[0] ? addMonths(`${months[0]}-01`, SEASONALITY_MIN_MONTHS) : undefined,
        };
    }
    const avg = [...byMonth.values()].reduce((a, b) => a + b, 0) / months.length || 1;
    const sums: Record<number, number[]> = {};
    for (const [month, qty] of byMonth) {
        const n = Number(month.slice(5, 7));
        sums[n] = [...(sums[n] ?? []), qty / avg];
    }
    const index: Record<number, number> = {};
    for (const [n, xs] of Object.entries(sums)) index[Number(n)] = Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
    const entries = Object.entries(index).map(([n, v]) => [Number(n), v] as const);
    const peak = entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const trough = entries.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
    return { status: "ok", monthsCovered: months.length, index, peak, trough };
};

/** Quantity ordered per cycle: the only time series the 2026 backlog gives. */
export const volumeByCycle = (purchaseOrders: PurchaseOrder[], kind?: PurchaseOrder["kind"], locationId?: LocationId) =>
    cyclesOf(purchaseOrders, kind, locationId).map((cycle) => {
        const lines = purchaseOrders
            .filter((po) => po.cycle === cycle && (!kind || po.kind === kind) && (!locationId || po.locationId === locationId) && po.status !== "draft")
            .flatMap((po) => po.lines.filter((l) => l.qtyOrdered > 0));
        return {
            cycle,
            lines: lines.length,
            qty: lines.reduce((n, l) => n + l.qtyOrdered, 0),
            received: lines.reduce((n, l) => n + Math.min(l.qtyReceived, l.qtyOrdered), 0),
        };
    });

// ------------------------------------------------------------------------------------ planning

export interface ReorderEvent {
    itemId: string;
    name: string;
    vendorId: Vendor["id"];
    vendorName: string;
    onHand: number;
    /** Date stock is expected to reach the reorder point. Today if it is already there. */
    reorderOn: string;
    /** Date stock is expected to run out. */
    stockoutOn?: string;
    /** Latest date to place the order so it arrives before stock runs out. */
    orderBy?: string;
    qty: number;
    confidence: Forecast["confidence"];
    /** Already at or below the reorder point. */
    due: boolean;
}

/**
 * When each item will need ordering, soonest first. Only items with a usage estimate.
 * `leadTimeOverrideDays` lets the caller plan with the measured order-to-shelf time (about 48 days
 * in 2026) instead of the vendor's quoted lead time.
 */
export const reorderCalendar = (
    forecasts: Forecast[],
    items: Item[],
    vendors: Vendor[],
    today: string,
    options: { horizonDays?: number; leadTimeOverrideDays?: number } = {},
): ReorderEvent[] => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    const vendorById = new Map(vendors.map((v) => [v.id, v]));
    const horizon = options.horizonDays ?? 120;
    const out: ReorderEvent[] = [];
    for (const f of forecasts) {
        if (f.confidence === "none" || f.dailyUsage <= 0) continue;
        const item = itemById.get(f.itemId);
        if (!item) continue;
        const vendor = vendorById.get(item.vendorId);
        const lead = options.leadTimeOverrideDays ?? vendor?.leadTimeDays ?? 7;
        const daysToRop = Math.max(0, Math.floor((f.onHand - f.reorderPoint) / f.dailyUsage));
        if (daysToRop > horizon) continue;
        const stockoutOn = f.daysOfCover !== undefined ? addDays(today, f.daysOfCover) : undefined;
        const orderBy = stockoutOn ? addDays(stockoutOn, -lead) : undefined;
        out.push({
            itemId: item.id,
            name: item.name,
            vendorId: item.vendorId,
            vendorName: vendor?.name ?? "Other",
            onHand: f.onHand,
            reorderOn: addDays(today, daysToRop),
            stockoutOn,
            orderBy: orderBy && orderBy < today ? today : orderBy,
            qty: Math.max(f.suggestedOrderQty, Math.ceil(f.dailyUsage * 30)),
            confidence: f.confidence,
            due: daysToRop === 0,
        });
    }
    return out.sort((a, b) => a.reorderOn.localeCompare(b.reorderOn) || (a.stockoutOn ?? "9").localeCompare(b.stockoutOn ?? "9"));
};

export interface SpendMonth {
    month: string;
    total: number;
    byGroup: Record<string, number>;
}

/**
 * Projected spend for the months ahead: forecast monthly usage × unit cost.
 * Meaningful only once unit costs come from invoices; the caller must label it when they are sample values.
 */
export const spendProjection = (forecasts: Forecast[], items: Item[], today: string, months: number, groupOf: (item: Item) => string): SpendMonth[] => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    return Array.from({ length: months }, (_, i) => {
        const month = monthKey(addMonths(today, i + 1));
        const byGroup: Record<string, number> = {};
        let total = 0;
        for (const f of forecasts) {
            const item = itemById.get(f.itemId);
            if (!item || f.monthlyUsage <= 0) continue;
            const spend = f.monthlyUsage * (item.unitCost ?? 0);
            byGroup[groupOf(item)] = (byGroup[groupOf(item)] ?? 0) + spend;
            total += spend;
        }
        return { month, total: Math.round(total), byGroup };
    });
};

// ------------------------------------------------------------------------------------ profitability

export interface RecipeLine {
    itemId?: string;
    name: string;
    /** Cost of one container, in dollars. */
    unitCost: number;
    /** How many services one container covers. */
    servicesPerUnit: number;
}

export interface ServiceRecipe {
    id: string;
    service: string;
    /** Price charged to the client. */
    price: number;
    /** Services per month, from the booking system once connected. */
    monthlyServices?: number;
    lines: RecipeLine[];
    /** True while the numbers are examples and not Meraki's own. */
    isExample: boolean;
}

export interface ServiceCost {
    productCost: number;
    /** Price minus product cost. Labour, rent and card fees are not included. */
    productMargin: number;
    productMarginPct: number;
    monthlyProductCost?: number;
    costliest?: RecipeLine & { costPerService: number };
}

/** Product cost of delivering one service, and what is left of the price after product. */
export const serviceCost = (recipe: ServiceRecipe): ServiceCost => {
    const perLine = recipe.lines.map((l) => ({ ...l, costPerService: l.servicesPerUnit > 0 ? l.unitCost / l.servicesPerUnit : 0 }));
    const productCost = Math.round(perLine.reduce((n, l) => n + l.costPerService, 0) * 100) / 100;
    const productMargin = Math.round((recipe.price - productCost) * 100) / 100;
    return {
        productCost,
        productMargin,
        productMarginPct: recipe.price > 0 ? productMargin / recipe.price : 0,
        monthlyProductCost: recipe.monthlyServices !== undefined ? Math.round(productCost * recipe.monthlyServices) : undefined,
        costliest: perLine.sort((a, b) => b.costPerService - a.costPerService)[0],
    };
};

/** Expected containers used in a month for a recipe line, to compare with what the ledger says was used. */
export const expectedUnits = (line: RecipeLine, monthlyServices: number) => (line.servicesPerUnit > 0 ? monthlyServices / line.servicesPerUnit : 0);

// ------------------------------------------------------------------------------------ readiness

export interface DataReadiness {
    id: "order-history" | "counts" | "costs" | "service-counts" | "twelve-months";
    label: string;
    ready: boolean;
    detail: string;
    unlocks: string;
}

/** What data exists and what each missing piece would unlock. Shown on the Insights screen so nobody mistakes a gap for a finding. */
export const dataReadiness = (input: {
    purchaseOrders: PurchaseOrder[];
    stock: StockLevel[];
    items: Item[];
    today: string;
    hasServiceCounts: boolean;
}): DataReadiness[] => {
    const cycles = cyclesOf(input.purchaseOrders);
    const first = cycles[0];
    const monthsOfHistory = first ? Math.max(1, Math.round(daysBetween(`${first}-01`, input.today) / 30)) : 0;
    const realCounts = input.stock.filter((s) => !s.isSample && s.lastCountedAt).length;
    const realCosts = input.items.filter((i) => i.unitCost !== undefined && !i.costIsSample).length;
    return [
        {
            id: "order-history",
            label: "Order history",
            ready: cycles.length >= 2,
            detail: `${cycles.length} order cycle${cycles.length === 1 ? "" : "s"} from the 2026 workbooks.`,
            unlocks: "Demand per product and per colour, reorder timing, vendor performance.",
        },
        {
            id: "counts",
            label: "Counts logged in the app",
            // One counted item is not "ready": most of the shelf has to have a real number behind it.
            ready: input.stock.length > 0 && realCounts / input.stock.length >= 0.5,
            detail:
                realCounts > 0
                    ? `${realCounts} of ${input.stock.length} stock lines ${realCounts === 1 ? "has" : "have"} a real count. The rest are placeholders.`
                    : "None yet. On-hand numbers are placeholders.",
            unlocks: "Actual usage, days of cover you can trust, and shrinkage.",
        },
        {
            id: "costs",
            label: "Unit costs",
            ready: realCosts > 0,
            detail: realCosts > 0 ? `${realCosts} items have an invoice cost.` : "None. The workbooks hold no prices, so dollar figures use sample costs.",
            unlocks: "Spend, stock value, budget forecasts and cost per service.",
        },
        {
            id: "service-counts",
            label: "Services performed",
            ready: input.hasServiceCounts,
            detail: input.hasServiceCounts ? "Connected." : "Not connected. Meevo holds these.",
            unlocks: "Product used per service, margin by service, and usage that does not match bookings.",
        },
        {
            id: "twelve-months",
            label: "Twelve months of usage",
            ready: monthsOfHistory >= SEASONALITY_MIN_MONTHS && realCounts > 0,
            detail: `${Math.min(monthsOfHistory, 99)} months since the first order cycle, as orders only.`,
            unlocks: "Seasonal indices per product and colour, and forecasts that follow the calendar.",
        },
    ];
};
