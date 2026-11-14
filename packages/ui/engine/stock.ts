/** Stock status rules shared by every screen, so "low" means the same thing everywhere. */
import type { FillLevel, Forecast, StockLevel, StockStatus } from "@/data/types";

export const FILL_FRACTION: Record<FillLevel, number> = { full: 1, "three-quarter": 0.75, half: 0.5, quarter: 0.25, empty: 0 };

export const FILL_LABEL: Record<FillLevel, string> = {
    full: "Full",
    "three-quarter": "¾ full",
    half: "Half full",
    quarter: "¼ full",
    empty: "Empty",
};

/**
 * Status for one stock line.
 * - Level-tracked items (bulk tubs, bags) go low at half and below, which is the rule written on the sheet.
 * - Counted items go low at the forecast reorder point, or at half of par when there is no forecast.
 * - "Over" means more than 1.5× par and at least 3 above it: cash tied up, and worth a second look.
 */
export const stockStatus = (level: StockLevel, forecast?: Pick<Forecast, "reorderPoint" | "confidence">): StockStatus => {
    if (level.parRule === "paused") return "paused";
    if (level.fillLevel) {
        if (level.fillLevel === "empty") return "out";
        return level.fillLevel === "half" || level.fillLevel === "quarter" ? "low" : "ok";
    }
    if (level.onHand <= 0) return level.par === undefined && level.parRule === "unset" ? "unknown" : "out";
    // Without a forecast, "low" is half of par or less. Floor, so a par of 1 with 1 on the shelf is not low.
    const threshold = forecast && forecast.confidence !== "none" ? forecast.reorderPoint : level.par !== undefined ? Math.floor(level.par / 2) : undefined;
    if (threshold === undefined) return "unknown";
    if (level.onHand <= threshold) return "low";
    // Overstock needs both a ratio and a real surplus, so one spare bottle against a par of 1 is not "overstocked".
    if (level.par !== undefined && level.par > 0 && level.onHand > level.par * 1.5 && level.onHand - level.par >= 3) return "over";
    return "ok";
};

export const STATUS_LABEL: Record<StockStatus, string> = {
    out: "Out of stock",
    low: "Low",
    ok: "In stock",
    over: "Overstocked",
    unknown: "No par set",
    paused: "Reorder paused",
};

export const STATUS_COLOR: Record<StockStatus, "error" | "warning" | "success" | "blue" | "gray"> = {
    out: "error",
    low: "warning",
    ok: "success",
    over: "blue",
    unknown: "gray",
    paused: "gray",
};

/** "6 Bottles", "1 Box", "Half full". */
export const formatQty = (level: Pick<StockLevel, "onHand" | "fillLevel">, unit?: string) => {
    if (level.fillLevel) return FILL_LABEL[level.fillLevel];
    return formatCount(level.onHand, unit);
};

export const formatCount = (n: number, unit?: string) => {
    const value = Number.isInteger(n) ? String(n) : n.toFixed(1);
    // "Each" is the placeholder unit for items the sheet gives no unit for: show the bare number.
    if (!unit || unit.toLowerCase() === "each") return value;
    const plural = n === 1 ? unit : /(x|s|ch)$/i.test(unit) ? `${unit}es` : `${unit}s`;
    return `${value} ${plural.toLowerCase()}`;
};

export const formatCurrency = (n: number, cents = false) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/** Variance of a count against the expected quantity, as a signed fraction. */
export const variancePct = (expected: number, counted: number) => (expected === 0 ? (counted === 0 ? 0 : 1) : (counted - expected) / expected);
