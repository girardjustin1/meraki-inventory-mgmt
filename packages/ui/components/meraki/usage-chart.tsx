"use client";

import { BarChart07 } from "@untitledui/icons";
import { Bar, CartesianGrid, ComposedChart, ErrorBar, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { TODAY } from "@/data/inventory";
import type { Forecast } from "@/data/types";
import { addMonths, formatMonth, monthKey } from "@/engine/dates";
import { cx } from "@/utils/cx";

interface Row {
    month: string;
    received?: number;
    projected?: number;
    low?: number;
    high?: number;
    /** Distance below and above the projected value, in the shape Recharts' ErrorBar expects. */
    range?: [number, number];
}

/** One row per calendar month from the first order cycle to the last projected month, so gaps between cycles stay visible. */
const buildRows = (forecast: Forecast): Row[] => {
    const first = forecast.history[0]?.month;
    if (!first) return [];
    const lastHistory = forecast.history[forecast.history.length - 1]?.month ?? first;
    const last = forecast.projection[forecast.projection.length - 1]?.month ?? lastHistory;
    const received = new Map(forecast.history.map((p) => [p.month, p.qty]));
    const projected = new Map(forecast.projection.map((p) => [p.month, p]));

    const rows: Row[] = [];
    let month = first;
    for (let i = 0; i < 24 && month <= last; i++) {
        const p = projected.get(month);
        rows.push({
            month,
            received: received.get(month),
            projected: p?.qty,
            low: p?.low,
            high: p?.high,
            range: p && p.low !== undefined && p.high !== undefined ? [Math.max(0, p.qty - p.low), Math.max(0, p.high - p.qty)] : undefined,
        });
        month = monthKey(addMonths(`${month}-01`, 1));
    }
    return rows;
};

const SHORT = (month: string) => {
    const label = formatMonth(month);
    return month.endsWith("-01") ? `${label.slice(0, 3)} '${label.slice(-2)}` : label.slice(0, 3);
};

interface UsageChartProps {
    forecast: Forecast;
    /** Counting unit, lower case plural ("bottles"). Used in the legend and tooltip. */
    unit?: string;
    /** The month the "Today" marker sits on. Defaults to the prototype's fixed date. */
    today?: string;
    className?: string;
}

const LegendItem = ({ swatch, children }: { swatch: string; children: string }) => (
    <li className="flex items-center gap-1.5 text-xs text-tertiary">
        <span aria-hidden="true" className={cx("block shrink-0", swatch)} />
        {children}
    </li>
);

/**
 * Usage for one item: solid bars for what each order cycle actually received, lighter dashed bars
 * for the months ahead with a whisker showing the likely range, and a dashed line at the monthly rate.
 * History and projection never share a style, so nobody mistakes an estimate for a record.
 */
export const UsageChart = ({ forecast, unit = "units", today = TODAY, className }: UsageChartProps) => {
    const rows = buildRows(forecast);

    if (!rows.length) {
        return (
            <div
                className={cx(
                    "flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-8 text-center ring-1 ring-secondary ring-inset",
                    className,
                )}
            >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-fg-quaternary shadow-xs ring-1 ring-secondary ring-inset">
                    <BarChart07 className="size-5" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-primary">No usage history yet</p>
                <p className="max-w-xs text-sm text-tertiary">Monthly usage and a projection appear here after the first order cycle or count is recorded.</p>
            </div>
        );
    }

    const todayMonth = monthKey(today);
    const showToday = rows.some((r) => r.month === todayMonth);
    const hasProjection = forecast.projection.length > 0;

    return (
        <figure className={cx("flex flex-col gap-3", className)}>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <LegendItem swatch="size-2.5 rounded-xs bg-utility-brand-600">Received per order cycle</LegendItem>
                {hasProjection && (
                    <LegendItem swatch="size-2.5 rounded-xs border border-dashed border-utility-brand-600 bg-utility-brand-100">
                        Projected, with likely range
                    </LegendItem>
                )}
                {forecast.monthlyUsage > 0 && (
                    <LegendItem swatch="h-0 w-4 border-t-2 border-dashed border-utility-neutral-400">{`Monthly usage, about ${forecast.monthlyUsage}`}</LegendItem>
                )}
            </ul>

            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} className="h-52! lg:h-60!">
                <ComposedChart
                    data={rows}
                    margin={{ left: 0, right: forecast.monthlyUsage > 0 ? 44 : 8, top: 16, bottom: 0 }}
                    className="text-tertiary [&_.recharts-errorBars]:text-utility-brand-700 [&_.recharts-text]:text-xs"
                >
                    <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />

                    <XAxis
                        fill="currentColor"
                        axisLine={false}
                        tickLine={false}
                        tickMargin={8}
                        interval="preserveStartEnd"
                        minTickGap={12}
                        dataKey="month"
                        tickFormatter={(value) => SHORT(String(value))}
                    />
                    <YAxis fill="currentColor" axisLine={false} tickLine={false} width={28} allowDecimals={false} />

                    <Tooltip
                        content={<ChartTooltipContent />}
                        formatter={(value, _name, entry) => {
                            const row = (entry as { payload?: Row }).payload;
                            return row?.projected !== undefined ? `About ${value} ${unit} projected (${row.low} to ${row.high})` : `${value} ${unit} received`;
                        }}
                        labelFormatter={(label) => formatMonth(String(label))}
                        cursor={{ className: "fill-utility-neutral-200/20" }}
                    />

                    {showToday && (
                        <ReferenceLine
                            x={todayMonth}
                            stroke="currentColor"
                            className="text-utility-neutral-300"
                            label={{ value: "Today", position: "top", fill: "currentColor", fontSize: 11, className: "text-utility-neutral-500" }}
                        />
                    )}

                    <Bar
                        isAnimationActive={false}
                        dataKey="received"
                        name="Received"
                        stackId="usage"
                        className="text-utility-brand-600"
                        fill="currentColor"
                        maxBarSize={28}
                        radius={[4, 4, 0, 0]}
                    />
                    <Bar
                        isAnimationActive={false}
                        dataKey="projected"
                        name="Projected"
                        stackId="usage"
                        className="text-utility-brand-600"
                        fill="currentColor"
                        fillOpacity={0.22}
                        stroke="currentColor"
                        strokeDasharray="3 3"
                        maxBarSize={28}
                        radius={[4, 4, 0, 0]}
                    >
                        <ErrorBar dataKey="range" width={4} strokeWidth={1.5} stroke="currentColor" isAnimationActive={false} />
                    </Bar>

                    {forecast.monthlyUsage > 0 && (
                        <ReferenceLine
                            y={forecast.monthlyUsage}
                            stroke="currentColor"
                            strokeDasharray="4 4"
                            className="text-utility-neutral-400"
                            label={{
                                value: `${forecast.monthlyUsage}/mo`,
                                position: "right",
                                fill: "currentColor",
                                fontSize: 11,
                                className: "text-utility-neutral-600",
                            }}
                        />
                    )}
                </ComposedChart>
            </ResponsiveContainer>

            <figcaption className="text-xs text-tertiary">
                Months with no bar had no order. {hasProjection ? "Amounts after today are projected and depend on future demand." : ""}
            </figcaption>
        </figure>
    );
};
