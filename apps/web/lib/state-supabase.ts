/**
 * Live implementation of loadState(): reads Supabase with the service-role client and
 * returns the same domain shapes as the prototype data layer.
 *
 * Used by cron routes only (no user is present, so there is no Clerk token to apply RLS
 * with). Screens that act for a user should query through lib/supabase/server.ts instead.
 *
 * STATUS: written against the schema in supabase/migrations/0001_init.sql and type-checked,
 * but not yet run against a live project. Treat the first run as a test: call
 *   GET /api/cron/digest?period=weekly&dryRun=1
 * and read the output before letting the schedule send anything.
 */
import type { CountSession, Forecast, Item, LocationId, PurchaseOrder, StockLevel, Vendor } from "@/data/types";
import { addDays } from "@/engine/dates";
import { forecastItem } from "@/engine/forecast";
import type { AppState } from "~/lib/state";
import { getAdminSupabase } from "~/lib/supabase/admin";
import {
    type CountLineRow,
    type CountSessionRow,
    type FlagRow,
    type ItemRow,
    type LocationRow,
    type NotificationRuleRow,
    type ProfileRow,
    type PurchaseOrderLineRow,
    type PurchaseOrderRow,
    type StockLevelRow,
    type StockMovementRow,
    type VendorRow,
    toCountSession,
    toFlag,
    toItem,
    toLocation,
    toNotificationRule,
    toPurchaseOrder,
    toStockLevel,
    toStockMovement,
    toUser,
    toVendor,
    todayIn,
} from "~/lib/supabase/mappers";

const DEFAULT_TIMEZONE = "America/New_York";
/** PostgREST returns at most 1,000 rows per request by default; the catalogue alone is ~1,750. */
const PAGE = 1000;
/** How far back the flag scan looks at adjustments and counts. Longer than the gap between scans. */
const MOVEMENT_WINDOW_DAYS = 35;
const COUNT_WINDOW_DAYS = 120;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every row of a query, a page at a time. The query must have a stable ORDER BY. */
const readAll = async <T>(label: string, query: (from: number, to: number) => Page<T>): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await query(from, from + PAGE - 1);
        if (error) throw new Error(`Supabase: could not read ${label}: ${error.message}`);
        rows.push(...(data ?? []));
        if (!data || data.length < PAGE) return rows;
    }
};

const groupBy = <T>(rows: T[], key: (row: T) => string): Map<string, T[]> => {
    const out = new Map<string, T[]>();
    for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
    return out;
};

export const loadSupabaseState = async (): Promise<AppState> => {
    const db = getAdminSupabase();
    if (!db) throw new Error("loadSupabaseState() called without Supabase configured");

    const now = new Date();
    const since = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

    const [locationRows, vendorRows, itemRows, stockRows, orderRows, lineRows, sessionRows, movementRows, flagRows, profileRows, ruleRows] = await Promise.all([
        readAll<LocationRow>("locations", (a, b) => db.from("locations").select("id, name, short_name, timezone").order("id").range(a, b)),
        readAll<VendorRow>("vendors", (a, b) => db.from("vendors").select("id, name, channel, lead_time_days, lead_time_is_estimate, contact, note").order("id").range(a, b)),
        // The view adds unit_cost; the service role is allowed to see it.
        readAll<ItemRow>("items", (a, b) => db.from("items_with_cost").select("*").order("id").range(a, b)),
        readAll<StockLevelRow>("stock levels", (a, b) => db.from("stock_levels").select("*").order("location_id").order("item_id").range(a, b)),
        readAll<PurchaseOrderRow>("purchase orders", (a, b) => db.from("purchase_orders").select("*").neq("status", "cancelled").order("id").range(a, b)),
        readAll<PurchaseOrderLineRow>("purchase order lines", (a, b) => db.from("purchase_order_lines_with_cost").select("*").order("id").range(a, b)),
        readAll<CountSessionRow>("count sessions", (a, b) =>
            db.from("count_sessions").select("*").gte("due_at", since(COUNT_WINDOW_DAYS).slice(0, 10)).order("id").range(a, b),
        ),
        readAll<StockMovementRow>("stock movements", (a, b) =>
            db.from("stock_movements").select("*").gte("occurred_at", since(MOVEMENT_WINDOW_DAYS)).order("occurred_at", { ascending: false }).order("id").range(a, b),
        ),
        readAll<FlagRow>("flags", (a, b) => db.from("flags").select("*").in("status", ["open", "reviewing"]).order("id").range(a, b)),
        readAll<ProfileRow>("profiles", (a, b) =>
            db.from("profiles").select("id, email, name, role, has_pin, last_active_at, profile_locations(location_id)").eq("active", true).order("id").range(a, b),
        ),
        readAll<NotificationRuleRow>("notification rules", (a, b) => db.from("notification_rules").select("id, label, description, channel, roles, enabled").order("id").range(a, b)),
    ]);

    // Count lines only for the sessions in the window.
    const sessionIds = sessionRows.map((s) => s.id);
    const countLineRows: CountLineRow[] = [];
    for (let i = 0; i < sessionIds.length; i += 100) {
        const ids = sessionIds.slice(i, i + 100);
        countLineRows.push(
            ...(await readAll<CountLineRow>("count lines", (a, b) =>
                db.from("count_lines").select("count_session_id, item_id, expected, counted, note").in("count_session_id", ids).order("id").range(a, b),
            )),
        );
    }

    const timezoneOf = new Map(locationRows.map((l) => [l.id, l.timezone || DEFAULT_TIMEZONE]));
    const today = todayIn(locationRows[0]?.timezone || DEFAULT_TIMEZONE, now);

    const locations = locationRows.map(toLocation);
    const vendors = vendorRows.map(toVendor);
    const items = itemRows.map(toItem);
    const stock = stockRows.map(toStockLevel);

    const linesByOrder = groupBy(lineRows, (l) => l.purchase_order_id);
    const purchaseOrders = orderRows.map((o) => toPurchaseOrder(o, linesByOrder.get(o.id) ?? [])).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const onHandBy = new Map(stock.map((s) => [`${s.locationId}:${s.itemId}`, s.onHand]));
    const linesBySession = groupBy(countLineRows, (l) => l.count_session_id);
    const countSessions: CountSession[] = sessionRows.map((s) =>
        toCountSession(s, linesBySession.get(s.id) ?? [], (itemId) => onHandBy.get(`${s.location_id}:${itemId}`) ?? 0),
    );

    return {
        source: "supabase",
        today,
        locations,
        vendors,
        items,
        stock,
        forecasts: buildForecasts({ today, items, vendors, stock, purchaseOrders }),
        purchaseOrders,
        countSessions,
        movements: movementRows.map((m) => toStockMovement(m, timezoneOf.get(m.location_id) ?? DEFAULT_TIMEZONE)),
        flags: flagRows.map(toFlag),
        users: profileRows.map(toUser),
        notificationRules: ruleRows.map(toNotificationRule),
    };
};

// ------------------------------------------------------------------------------------ forecasts

/**
 * Forecasts for every supply at every location, from that location's own order history.
 *
 * Same method as the prototype data layer (packages/ui/data/inventory.ts): what was received
 * each cycle stands in for what was used, because Meraki orders to replace what it used.
 * Two deliberate differences from the prototype:
 *   - no borrowing of Lynnfield's usage for Newburyport. A location with little history gets
 *     a low-confidence forecast, which is the honest answer.
 *   - `forecastItem` also accepts `method: "movement-ledger"`. Once a few months of `use`
 *     movements exist, switch the observations below to the ledger.
 * This function would be better placed in packages/ui/engine so both data sources share it.
 */
const buildForecasts = (input: { today: string; items: Item[]; vendors: Vendor[]; stock: StockLevel[]; purchaseOrders: PurchaseOrder[] }): Forecast[] => {
    const { today, items, vendors, stock, purchaseOrders } = input;
    const itemById = new Map(items.map((i) => [i.id, i]));
    const leadTime = new Map(vendors.map((v) => [v.id as string, v.leadTimeDays]));

    const windows = new Map<LocationId, { start: string; end: string }>();
    const demand = new Map<string, Map<string, number>>(); // "location:item" -> month -> qty

    for (const po of purchaseOrders) {
        if (po.kind !== "supply") continue;
        const start = po.createdAt.slice(0, 10);
        const end = (po.closedAt ?? po.createdAt).slice(0, 10);
        const w = windows.get(po.locationId);
        windows.set(po.locationId, { start: !w || start < w.start ? start : w.start, end: !w || end > w.end ? end : w.end });

        for (const line of po.lines) {
            if (!line.itemId) continue;
            // Received quantity where the line was received; ordered quantity while it is still open.
            const qty = line.qtyReceived > 0 ? line.qtyReceived : line.qtyOrdered;
            if (qty <= 0) continue;
            const key = `${po.locationId}:${line.itemId}`;
            const months = demand.get(key) ?? new Map<string, number>();
            months.set(po.cycle, (months.get(po.cycle) ?? 0) + qty);
            demand.set(key, months);
        }
    }

    return stock
        .filter((s) => itemById.get(s.itemId)?.kind === "supply")
        .map((s): Forecast => {
            const item = itemById.get(s.itemId) as Item;
            const window = windows.get(s.locationId) ?? { start: addDays(today, -180), end: today };
            const months = demand.get(`${s.locationId}:${s.itemId}`);
            const untracked = Boolean(s.fillLevel) || s.parRule === "paused";
            const forecast = forecastItem({
                itemId: s.itemId,
                locationId: s.locationId,
                onHand: s.fillLevel ? 0 : s.onHand,
                par: s.par,
                leadTimeDays: leadTime.get(item.vendorId) ?? 7,
                observations: untracked ? [] : [...(months?.entries() ?? [])].map(([month, qty]) => ({ month, qty })),
                windowStart: window.start,
                windowEnd: window.end,
                today,
            });
            if (!s.fillLevel) return forecast;
            const low = s.fillLevel === "half" || s.fillLevel === "quarter" || s.fillLevel === "empty";
            return { ...forecast, onHand: s.onHand, suggestedOrderQty: low ? 1 : 0, explanation: "Tracked by fill level. Reorder one when it reaches half." };
        });
};
