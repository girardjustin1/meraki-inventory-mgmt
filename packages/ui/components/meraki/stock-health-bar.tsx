import { summary } from "@/data/inventory";
import type { LocationId } from "@/data/types";
import { cx } from "@/utils/cx";

type HealthKey = "out" | "low" | "ok" | "over" | "unknown";

const SEGMENTS: { key: HealthKey; label: string; color: string }[] = [
    { key: "out", label: "Out", color: "bg-error-solid" },
    { key: "low", label: "Low", color: "bg-warning-solid" },
    { key: "ok", label: "In stock", color: "bg-success-solid" },
    { key: "over", label: "Overstocked", color: "bg-utility-blue-500" },
    { key: "unknown", label: "No par", color: "bg-utility-neutral-400" },
];

interface StockHealthBarProps {
    location: LocationId;
    /** Hide the legend and show only the bar, for tight spaces such as a comparison strip. */
    compact?: boolean;
    size?: "sm" | "md";
    className?: string;
}

/**
 * The whole supply shelf in one stacked bar: out, low, in stock, overstocked and items with no par.
 * Built from `summary(location)` so it always agrees with the stock list and the navigation badges.
 */
export const StockHealthBar = ({ location, compact, size = "md", className }: StockHealthBarProps) => {
    const s = summary(location);
    const total = Math.max(1, s.supplies);
    const segments = SEGMENTS.map((seg) => ({ ...seg, count: s[seg.key] }));
    const label = segments.map((seg) => `${seg.count} ${seg.label.toLowerCase()}`).join(", ");

    return (
        <div className={cx("flex flex-col gap-3", className)}>
            <div
                role="img"
                aria-label={`${s.supplies} supplies: ${label}.`}
                className={cx("flex w-full gap-0.5 overflow-hidden rounded-full", size === "sm" ? "h-2" : "h-3")}
            >
                {segments
                    .filter((seg) => seg.count > 0)
                    .map((seg) => (
                        <span key={seg.key} className={cx("h-full min-w-1.5", seg.color)} style={{ flexGrow: seg.count, flexBasis: 0 }} />
                    ))}
            </div>
            {!compact && (
                <dl className="flex flex-wrap gap-x-6 gap-y-2">
                    {segments.map((seg) => (
                        <div key={seg.key} className="flex flex-col gap-0.5">
                            <dt className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap text-tertiary">
                                <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", seg.color)} />
                                {seg.label}
                            </dt>
                            <dd className="text-md font-semibold text-primary tabular-nums">
                                {seg.count}
                                <span className="ml-1 text-xs font-medium text-quaternary">{Math.round((seg.count / total) * 100)}%</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
};
