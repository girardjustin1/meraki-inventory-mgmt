/**
 * loadState(): THE SEAM between the app's server code and wherever the data lives.
 *
 * Cron routes (digest, flag scan) call loadState() and hand the result to the pure engine
 * functions in packages/ui/engine. They never know or care which source answered:
 *
 *   prototype mode (Supabase not configured)  ->  packages/ui/data/inventory.ts
 *                                                 real catalogue and 2026 orders, plus a
 *                                                 generated sample layer (counts, costs, staff)
 *   live mode (Supabase configured)           ->  lib/state-supabase.ts
 *                                                 the same shapes, read with the service role
 *
 * Both return `AppState`, built from the domain types in packages/ui/data/types.ts. If a
 * screen or route needs something that is not here, add it to AppState and to BOTH loaders.
 */
import type { CountSession, Flag, Forecast, Item, Location, LocationId, NotificationRule, PurchaseOrder, StockLevel, StockMovement, User, Vendor } from "@/data/types";
import { isAdmin } from "@/engine/permissions";
import { isConfigured } from "~/lib/env";

export interface AppState {
    source: "prototype" | "supabase";
    /** yyyy-mm-dd, in the business's timezone. The engine treats this as "now". */
    today: string;
    locations: Location[];
    vendors: Vendor[];
    items: Item[];
    stock: StockLevel[];
    forecasts: Forecast[];
    purchaseOrders: PurchaseOrder[];
    countSessions: CountSession[];
    /**
     * Recent ledger entries. For the flag engine's "after hours" rule, `at` is expressed in
     * the location's local wall-clock time.
     */
    movements: StockMovement[];
    /** Flags already on file, with their current status. */
    flags: Flag[];
    /** Active staff. Used to work out who receives which email. */
    users: User[];
    notificationRules: NotificationRule[];
}

export const loadState = async (): Promise<AppState> => {
    if (isConfigured.supabase) {
        const { loadSupabaseState } = await import("~/lib/state-supabase");
        return loadSupabaseState();
    }
    return loadPrototypeState();
};

const loadPrototypeState = async (): Promise<AppState> => {
    // Imported lazily: the sample data layer parses ~900 KB of JSON and runs the forecast
    // and flag engines at module load, which live mode should never pay for.
    const data = await import("@/data/inventory");
    return {
        source: "prototype",
        today: data.TODAY,
        locations: data.locations,
        vendors: data.vendors,
        items: data.items,
        stock: data.stock,
        forecasts: data.forecasts,
        purchaseOrders: data.purchaseOrders,
        countSessions: data.countSessions,
        movements: data.movements,
        flags: data.flags,
        users: data.users,
        notificationRules: data.notificationRules,
    };
};

// ------------------------------------------------------------------------------------ recipients

/**
 * Email addresses for a notification rule at one location: active staff whose role the rule
 * names and who work there. Admins are attached to every location (engine/permissions.ts).
 * Returns [] when the rule is missing or switched off.
 */
export const recipientsFor = (state: AppState, ruleId: string, locationId: LocationId): string[] => {
    const rule = state.notificationRules.find((r) => r.id === ruleId);
    if (!rule || !rule.enabled || rule.channel !== "email") return [];
    return state.users
        .filter((u) => rule.roles.includes(u.role) && (isAdmin(u) || u.locations.includes(locationId)))
        .map((u) => u.email)
        .filter(Boolean);
};

export const locationShortName = (state: AppState, locationId: LocationId) => state.locations.find((l) => l.id === locationId)?.shortName ?? locationId;
