import type { Forecast } from "@/data/types";
import { addMonths, formatMonth, monthKey } from "@/engine/dates";
import { cx } from "@/utils/cx";

interface Slot {
    month: string;
    qty: number;
    projected: boolean;
}

/** One slot per calendar month from the first order cycle to the last projected month, so months with no order show as gaps. */
const buildSlots = (forecast: Pick<Forecast, "history" | "projection">): Slot[] => {
    const first = forecast.history[0]?.month;
    if (!first) return [];
    const lastHistory = forecast.history[forecast.history.length - 1]?.month ?? first;
    const last = forecast.projection[forecast.projection.length - 1]?.month ?? lastHistory;
    const history = new Map(forecast.history.map((p) => [p.month, p.qty]));
    const projection = new Map(forecast.projection.map((p) => [p.month, p.qty]));
    const slots: Slot[] = [];
    let month = first;
    for (let i = 0; i < 24 && month <= last; i++) {
        const projected = !history.has(month) && projection.has(month);
        slots.push({ month, qty: history.get(month) ?? projection.get(month) ?? 0, projected });
        month = monthKey(addMonths(`${month}-01`, 1));
    }
    return slots;
};

export interface ForecastSparklineProps {
    /** The forecast to draw. Leave out, or pass one with no history, to get the empty state. */
    forecast?: Pick<Forecast, "history" | "projection">;
    /** Drawing size in pixels. The default fits a table cell. */
    width?: number;
    height?: number;
    className?: string;
}

/**
 * A forecast at a glance, small enough for a table cell: solid bars for what each order cycle
 * recorded, outlined lighter bars for the months ahead. No axes; the numbers sit beside it.
 */
export const ForecastSparkline = ({ forecast, width = 96, height = 28, className }: ForecastSparklineProps) => {
    const slots = forecast ? buildSlots(forecast) : [];

    if (!slots.length) {
        return (
            <span className={cx("inline-flex items-center text-sm text-quaternary", className)} style={{ width, height }}>
                <span aria-hidden="true">–</span>
                <span className="sr-only">No order history</span>
            </span>
        );
    }

    const max = Math.max(...slots.map((s) => s.qty), 1);
    const gap = slots.length > 16 ? 1 : 2;
    const barWidth = Math.max(1.5, (width - gap * (slots.length - 1)) / slots.length);
    const baseline = height - 1;
    const usable = height - 3;
    const history = slots.filter((s) => !s.projected && s.qty > 0);
    const projection = slots.filter((s) => s.projected);
    const label = `${history.length} order ${history.length === 1 ? "cycle" : "cycles"} from ${formatMonth(slots[0]?.month ?? "")}${
        projection.length ? `, then about ${projection[0]?.qty ?? 0} a month projected` : ""
    }`;

    return (
        <svg
            role="img"
            aria-label={label}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cx("block shrink-0 overflow-visible", className)}
        >
            <line x1={0} x2={width} y1={baseline + 0.5} y2={baseline + 0.5} stroke="currentColor" strokeWidth={1} className="text-utility-neutral-200" />
            {slots.map((s, i) => {
                const x = i * (barWidth + gap);
                if (s.qty <= 0) return null;
                const h = Math.max(3, (s.qty / max) * usable);
                return s.projected ? (
                    <rect
                        key={s.month}
                        x={x + 0.5}
                        y={baseline - h + 0.5}
                        width={Math.max(0.5, barWidth - 1)}
                        height={Math.max(0.5, h - 0.5)}
                        rx={1}
                        fill="currentColor"
                        fillOpacity={0.2}
                        stroke="currentColor"
                        strokeOpacity={0.7}
                        strokeWidth={1}
                        className="text-utility-brand-600"
                    />
                ) : (
                    <rect key={s.month} x={x} y={baseline - h} width={barWidth} height={h} rx={1} fill="currentColor" className="text-utility-brand-600" />
                );
            })}
        </svg>
    );
};
