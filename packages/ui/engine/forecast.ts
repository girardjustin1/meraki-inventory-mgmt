/**
 * Forecast engine.
 *
 * Pure functions, no I/O: the same code runs in Storybook, in the Next.js app and in the
 * scheduled digest job. Inputs are observations of how much of an item was consumed in a
 * period; outputs are a usage rate, a reorder point and a suggested order quantity.
 *
 * Today the only real signal is the 2026 order backlog (what was ordered and received each
 * cycle). Because Meraki orders to replace what was used, received quantity over a span of
 * time is a fair proxy for consumption. Once counts and usage are logged in the app, the same
 * functions take the movement ledger instead (`method: "movement-ledger"`), which is far better.
 */
import type { Forecast, ForecastConfidence, LocationId, UsagePoint } from "@/data/types";
import { addDays, addMonths, daysBetween, monthKey } from "./dates";

export interface UsageObservation {
    /** yyyy-mm the quantity belongs to. */
    month: string;
    qty: number;
}

export interface ForecastInput {
    itemId: string;
    locationId: LocationId;
    onHand: number;
    par?: number;
    leadTimeDays: number;
    /** One entry per order cycle (or per month once the ledger exists). */
    observations: UsageObservation[];
    /** First and last day the observations cover. Months with no order inside this window count as zero. */
    windowStart: string;
    windowEnd: string;
    today: string;
    method?: Forecast["method"];
    /** Months to project forward. */
    horizonMonths?: number;
    /** Days between routine orders. Meraki orders monthly. */
    reviewPeriodDays?: number;
}

/** Service-level factor: 1.28 ≈ 90% chance of not running out during lead time. */
export const SERVICE_Z = 1.28;

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export const stdDev = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** Simple exponential smoothing. Higher alpha reacts faster to recent periods. */
export const exponentialSmoothing = (xs: number[], alpha = 0.4) => {
    if (!xs.length) return 0;
    let level = xs[0] ?? 0;
    for (const x of xs.slice(1)) level = alpha * x + (1 - alpha) * level;
    return level;
};

export const confidenceFor = (observations: number): ForecastConfidence => {
    if (observations >= 3) return "high";
    if (observations === 2) return "medium";
    if (observations === 1) return "low";
    return "none";
};

/** Reorder point = demand during lead time + safety stock. */
export const reorderPoint = (dailyUsage: number, leadTimeDays: number, safetyStock: number) => Math.ceil(dailyUsage * leadTimeDays + safetyStock);

/**
 * Safety stock. With three or more observations we use demand variability (z × σ × √lead time).
 * With fewer we fall back to half the lead-time demand, which is deliberately cautious.
 */
export const safetyStock = (monthlySeries: number[], dailyUsage: number, leadTimeDays: number) => {
    if (monthlySeries.length >= 3) {
        const sigmaDaily = stdDev(monthlySeries) / Math.sqrt(30);
        return Math.ceil(SERVICE_Z * sigmaDaily * Math.sqrt(leadTimeDays));
    }
    return Math.ceil(dailyUsage * leadTimeDays * 0.5);
};

/** Top up to par once stock has fallen to this share of it. Stops the order filling with one-bottle top-ups. */
export const PAR_TOP_UP_AT = 0.75;

export interface SuggestInput {
    onHand: number;
    par?: number;
    /** Zero when there is no usage estimate. */
    dailyUsage: number;
    leadTimeDays: number;
    safetyStock: number;
    reorderPoint: number;
    reviewPeriodDays?: number;
}

/**
 * How many to order now. Two triggers:
 *   1. stock is at or below the reorder point AND would run out within the next order cycle
 *      (a slow item sitting at its reorder point with months of cover does not need ordering), or
 *   2. stock has fallen to 75% of par or less.
 * The quantity orders up to the larger of par or (review period + lead time) demand plus safety stock.
 */
export const suggestOrderQty = ({ onHand, par, dailyUsage, leadTimeDays, safetyStock: safety, reorderPoint: rop, reviewPeriodDays = 30 }: SuggestInput) => {
    const belowPar = par !== undefined && par > 0 && onHand <= par * PAR_TOP_UP_AT;
    if (dailyUsage <= 0) return belowPar && par !== undefined ? Math.max(0, Math.ceil(par - onHand)) : 0;
    const daysOfCover = onHand / dailyUsage;
    const runsOutSoon = onHand <= rop && daysOfCover <= reviewPeriodDays + leadTimeDays;
    if (!runsOutSoon && !belowPar) return 0;
    const orderUpTo = Math.max(par ?? 0, Math.ceil(dailyUsage * (reviewPeriodDays + leadTimeDays) + safety));
    return Math.max(0, Math.ceil(orderUpTo - onHand));
};

export const forecastItem = (input: ForecastInput): Forecast => {
    const { itemId, locationId, onHand, par, leadTimeDays, observations, windowStart, windowEnd, today } = input;
    const horizon = input.horizonMonths ?? 3;
    const review = input.reviewPeriodDays ?? 30;
    const obs = observations.filter((o) => o.qty > 0);
    const confidence = confidenceFor(obs.length);
    const spanDays = Math.max(30, daysBetween(windowStart, windowEnd));
    const total = obs.reduce((a, o) => a + o.qty, 0);
    const dailyUsage = total / spanDays;
    const monthlyUsage = dailyUsage * 30;

    const history: UsagePoint[] = [...obs].sort((a, b) => a.month.localeCompare(b.month)).map((o) => ({ month: o.month, qty: o.qty }));

    if (!obs.length) {
        return {
            itemId,
            locationId,
            monthlyUsage: 0,
            dailyUsage: 0,
            observations: 0,
            confidence: "none",
            method: "none",
            onHand,
            reorderPoint: par ? Math.ceil(par / 2) : 0,
            safetyStock: 0,
            suggestedOrderQty: suggestOrderQty({ onHand, par, dailyUsage: 0, leadTimeDays, safetyStock: 0, reorderPoint: 0, reviewPeriodDays: review }),
            history: [],
            projection: [],
            explanation:
                par !== undefined
                    ? `No order history yet, so this uses the par level of ${par}. Usage will be estimated after the first count cycle.`
                    : "No order history and no par level. Set a par level or log a count to start forecasting.",
        };
    }

    const series = history.map((h) => h.qty);
    const safety = safetyStock(series, dailyUsage, leadTimeDays);
    const rop = reorderPoint(dailyUsage, leadTimeDays, safety);
    const suggestedOrderQty = suggestOrderQty({ onHand, par, dailyUsage, leadTimeDays, safetyStock: safety, reorderPoint: rop, reviewPeriodDays: review });
    const daysOfCover = dailyUsage > 0 ? Math.floor(onHand / dailyUsage) : undefined;

    // Uncertainty band: observed variability, floored so thin data never looks precise.
    const cv = series.length >= 2 && mean(series) > 0 ? stdDev(series) / mean(series) : 0.5;
    const band = Math.max(confidence === "high" ? 0.2 : confidence === "medium" ? 0.35 : 0.5, Math.min(cv, 0.8));
    const projection: UsagePoint[] = Array.from({ length: horizon }, (_, i) => ({
        month: monthKey(addMonths(today, i + 1)),
        qty: round1(monthlyUsage),
        projected: true,
        low: round1(monthlyUsage * (1 - band)),
        high: round1(monthlyUsage * (1 + band)),
    }));

    return {
        itemId,
        locationId,
        monthlyUsage: round1(monthlyUsage),
        dailyUsage,
        observations: obs.length,
        confidence,
        method: input.method ?? "order-history",
        onHand,
        daysOfCover,
        projectedStockoutDate: daysOfCover !== undefined ? addDays(today, daysOfCover) : undefined,
        reorderPoint: rop,
        safetyStock: safety,
        suggestedOrderQty,
        history,
        projection,
        explanation: `${total} received across ${obs.length} order cycle${obs.length === 1 ? "" : "s"} over ${Math.round(spanDays / 30)} months, about ${round1(
            monthlyUsage,
        )} a month. Reorder at ${rop} (${leadTimeDays}-day lead time plus ${safety} safety stock).`,
    };
};

const round1 = (n: number) => Math.round(n * 10) / 10;
