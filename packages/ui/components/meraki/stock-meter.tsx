import type { StockLevel, StockStatus } from "@/data/types";
import { FILL_FRACTION, FILL_LABEL } from "@/engine/stock";
import { cx } from "@/utils/cx";

const FILL: Record<StockStatus, string> = {
    out: "bg-error-solid",
    low: "bg-warning-solid",
    ok: "bg-success-solid",
    over: "bg-utility-blue-500",
    unknown: "bg-utility-neutral-400",
    paused: "bg-utility-neutral-400",
};

const heights = { sm: "h-1.5", md: "h-2.5" } as const;

interface StockMeterProps {
    level: Pick<StockLevel, "onHand" | "fillLevel" | "par" | "parRule">;
    status: StockStatus;
    /** Quantity at which the item should be reordered. Drawn as a tick on the bar. */
    reorderPoint?: number;
    size?: keyof typeof heights;
    /** Show "6 / 15", "Half full" or "No par" beside the bar. */
    showValue?: boolean;
    className?: string;
}

const Tick = ({ at, tone = "strong" }: { at: number; tone?: "strong" | "soft" }) => (
    <span
        aria-hidden="true"
        className={cx(
            "absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full ring-1 ring-bg-primary",
            tone === "strong" ? "bg-fg-secondary" : "bg-fg-quaternary",
        )}
        style={{ left: `${Math.min(100, Math.max(0, at))}%` }}
    />
);

/**
 * On hand against par in one glance.
 * Counted items: the bar runs from zero to par (or to on hand when overstocked), with a tick at the reorder point.
 * Fill-level items: four segments, quarter to full, with the tick at half, where the sheet says to reorder.
 * Items with no par: a neutral dashed bar, because there is nothing to measure against.
 */
export const StockMeter = ({ level, status, reorderPoint, size = "sm", showValue, className }: StockMeterProps) => {
    const height = heights[size];
    const value = (text: string) =>
        showValue ? <span className="shrink-0 text-xs font-medium whitespace-nowrap text-tertiary tabular-nums">{text}</span> : null;

    if (level.fillLevel) {
        const filled = Math.round(FILL_FRACTION[level.fillLevel] * 4);
        return (
            <div className={cx("flex items-center gap-2", className)}>
                <div role="img" aria-label={`${FILL_LABEL[level.fillLevel]}. Reorder at half.`} className={cx("relative flex min-w-12 flex-1 gap-0.5", height)}>
                    {[1, 2, 3, 4].map((n) => (
                        <span
                            key={n}
                            className={cx(
                                "h-full flex-1 first:rounded-l-full last:rounded-r-full",
                                n <= filled ? FILL[status] : status === "out" ? "bg-error-secondary" : "bg-quaternary",
                            )}
                        />
                    ))}
                    <Tick at={50} />
                </div>
                {value(FILL_LABEL[level.fillLevel])}
            </div>
        );
    }

    const par = level.par;
    if (par === undefined || par <= 0 || level.parRule === "paused") {
        const text = level.parRule === "paused" ? "Reorder paused" : par === undefined ? "No par" : `Par ${par}`;
        return (
            <div className={cx("flex items-center gap-2", className)}>
                <div
                    role="img"
                    aria-label={`${level.onHand} on hand. ${text}.`}
                    className={cx("min-w-12 flex-1 rounded-full border border-dashed border-primary bg-secondary", height)}
                />
                {value(text)}
            </div>
        );
    }

    const scale = Math.max(par, level.onHand);
    const pct = (n: number) => (n / scale) * 100;
    const showReorder = reorderPoint !== undefined && reorderPoint > 0 && reorderPoint < scale;
    const overPar = level.onHand > par;

    return (
        <div className={cx("flex items-center gap-2", className)}>
            <div
                role="img"
                aria-label={`${level.onHand} on hand against a par of ${par}${showReorder ? `, reorder at ${reorderPoint}` : ""}.`}
                className={cx("relative min-w-12 flex-1", height)}
            >
                <span className={cx("absolute inset-0 overflow-hidden rounded-full", status === "out" ? "bg-error-secondary" : "bg-quaternary")}>
                    <span className={cx("block h-full rounded-full", FILL[status])} style={{ width: `${pct(level.onHand)}%` }} />
                </span>
                {showReorder && <Tick at={pct(reorderPoint)} />}
                {overPar && <Tick at={pct(par)} tone="soft" />}
            </div>
            {value(`${level.onHand} / ${par}`)}
        </div>
    );
};
