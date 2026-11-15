"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Download01, Mail01 } from "@untitledui/icons";
import {
    Area,
    Bar,
    CartesianGrid,
    ComposedChart,
    LabelList,
    Line,
    Pie,
    PieChart,
    BarChart as RechartsBarChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { InsightCard } from "@/components/meraki/insight-card";
import { StatCard, StatGrid } from "@/components/meraki/stat-card";
import { AbcBadge, RealDataBadge, SampleBadge } from "@/components/meraki/status-badges";
import {
    CURRENT_USER,
    TODAY,
    countSessions,
    flags,
    forecasts,
    getItem,
    getStock,
    items,
    locationName,
    purchaseOrders,
    stockRows,
    vendorById,
    vendors,
} from "@/data/inventory";
import type { AbcClass, LocationId, PurchaseOrder } from "@/data/types";
import { addDays, addMonths, daysBetween, formatDate, formatMonth, monthKey } from "@/engine/dates";
import { formatCount, formatCurrency } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

// ------------------------------------------------------------------------------------ period

type Period = "3m" | "6m" | "ytd";

const PERIODS: { id: Period; label: string; months: number }[] = [
    { id: "3m", label: "3 months", months: 3 },
    { id: "6m", label: "6 months", months: 6 },
    { id: "ytd", label: "Year to date", months: Number(TODAY.slice(5, 7)) },
];

/** First order cycle (yyyy-mm) inside the period. Cycles are monthly, so the period is a whole number of months. */
const periodStart = (period: Period) => {
    const months = PERIODS.find((p) => p.id === period)?.months ?? 12;
    return monthKey(addMonths(TODAY, -(months - 1)));
};

const periodPhrase: Record<Period, string> = { "3m": "the last 3 months", "6m": "the last 6 months", ytd: "2026 so far" };

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : undefined);
const shortMonth = (month: string) => formatMonth(month).slice(0, 3);
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ------------------------------------------------------------------------------------ data (real: 2026 order backlog)

/** Imported 2026 orders for one location whose monthly cycle falls inside the period. */
const ordersInScope = (loc: LocationId, start: string) => purchaseOrders.filter((po) => po.imported && po.locationId === loc && po.cycle >= start);

interface CycleRow {
    key: string;
    name: string;
    cycle: string;
    lines: number;
    received: number;
    open: number;
    avgDays?: number;
}

/** One row per monthly order cycle and kind (supplies, polish). */
const cycleRows = (orders: PurchaseOrder[]): CycleRow[] => {
    const map = new Map<string, { cycle: string; kind: PurchaseOrder["kind"]; lines: number; received: number; days: number[] }>();
    for (const po of orders) {
        const key = `${po.cycle}|${po.kind}`;
        const row = map.get(key) ?? { cycle: po.cycle, kind: po.kind, lines: 0, received: 0, days: [] };
        for (const l of po.lines) {
            if (l.qtyOrdered <= 0) continue;
            row.lines += 1;
            if (l.qtyReceived > 0) row.received += 1;
            if (l.receivedAt) row.days.push(daysBetween(po.createdAt, l.receivedAt));
        }
        map.set(key, row);
    }
    return [...map.entries()]
        .map(([key, r]) => {
            const mean = avg(r.days);
            return {
                key,
                name: `${shortMonth(r.cycle)} ${r.kind === "polish" ? "polish" : "supplies"}`,
                cycle: r.cycle,
                lines: r.lines,
                received: r.received,
                open: r.lines - r.received,
                avgDays: mean === undefined ? undefined : Math.round(mean),
            };
        })
        .sort((a, b) => a.key.localeCompare(b.key));
};

/** Fill rate and lead time per vendor. Same maths as engine/digest.ts, limited to the period. */
const vendorPerformance = (orders: PurchaseOrder[]) => {
    const perf = new Map<string, { lines: number; ordered: number; received: number; leadDays: number[]; assumed: number }>();
    for (const po of orders) {
        if (po.status !== "received" && po.status !== "partially-received") continue;
        const vendor = vendorById(po.vendorId);
        const p = perf.get(vendor.name) ?? { lines: 0, ordered: 0, received: 0, leadDays: [], assumed: vendor.leadTimeDays };
        for (const l of po.lines) {
            if (l.qtyOrdered <= 0) continue;
            p.lines += 1;
            p.ordered += l.qtyOrdered;
            p.received += Math.min(l.qtyReceived, l.qtyOrdered);
            if (l.receivedAt) p.leadDays.push(daysBetween(po.createdAt, l.receivedAt));
        }
        perf.set(vendor.name, p);
    }
    return [...perf.entries()]
        .filter(([, p]) => p.lines > 0)
        .map(([vendor, p]) => {
            const mean = avg(p.leadDays);
            return {
                vendor,
                lines: p.lines,
                fillRate: p.ordered ? p.received / p.ordered : 0,
                avgLeadDays: mean === undefined ? undefined : Math.round(mean),
                assumedLeadDays: p.assumed,
            };
        })
        .sort((a, b) => b.lines - a.lines);
};

/** Received lines against the mismatch flags the engine raised for them. */
const receivingAccuracy = (loc: LocationId, orders: PurchaseOrder[]) => {
    const ids = new Set(orders.map((po) => po.id));
    const receivedLines = sum(orders.map((po) => po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived > 0).length));
    const relevant = flags.filter((f) => f.locationId === loc && f.purchaseOrderId && ids.has(f.purchaseOrderId));
    const lineKey = (id: string) => id.replace(/^[a-z]+-/, "");
    const quantity = new Set(relevant.filter((f) => f.type === "received-mismatch").map((f) => lineKey(f.id)));
    const variant = new Set(relevant.filter((f) => f.type === "variant-mismatch").map((f) => lineKey(f.id)));
    const either = new Set([...quantity, ...variant]);
    return { receivedLines, quantity: quantity.size, variant: variant.size, mismatched: either.size, matched: Math.max(0, receivedLines - either.size) };
};

// ------------------------------------------------------------------------------------ chart pieces (house style: charts/*.demo.tsx)

interface BarSeries {
    key: string;
    name: string;
    /** Text colour utility; the bar fills with currentColor. */
    className: string;
}

interface HorizontalBarsProps {
    data: ({ name: string; label?: string } & Record<string, string | number | undefined>)[];
    series: BarSeries[];
    /** Unit appended to tooltip values. */
    unit?: string;
    /** Dashed vertical marker, e.g. an assumed lead time. */
    reference?: number;
    formatValue?: (n: number) => string;
}

/** Legend as plain HTML above the chart, so it wraps cleanly on phones and never overlaps the plot. */
const ChartLegend = ({ items }: { items: { name: string; className: string; dashed?: boolean }[] }) => (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
            <li key={item.name} className="flex items-center gap-2 text-sm text-tertiary">
                {item.dashed ? (
                    <span aria-hidden="true" className={cx("block h-0 w-4 border-t-2 border-dashed border-current", item.className)} />
                ) : (
                    <span aria-hidden="true" className={cx("block size-2 rounded-full bg-current", item.className)} />
                )}
                {item.name}
            </li>
        ))}
    </ul>
);

/**
 * Horizontal bars with the category names on the left, so labels stay readable at phone width.
 * The value is printed at the end of each bar; nothing depends on hover.
 */
const HorizontalBars = ({ data, series, unit, reference, formatValue }: HorizontalBarsProps) => {
    const isDesktop = useBreakpoint("lg");
    const format = formatValue ?? ((n: number) => `${n.toLocaleString()}${unit ? ` ${unit}` : ""}`);
    const stacked = series.length > 1;
    const last = series[series.length - 1];
    return (
        <div className="flex flex-col gap-3">
            {stacked && <ChartLegend items={series} />}
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={data.length * 40 + 8}>
                <RechartsBarChart
                    data={data}
                    layout="vertical"
                    className="text-tertiary [&_.recharts-text]:text-xs"
                    margin={{ left: 0, right: 88, top: 0, bottom: 0 }}
                    barCategoryGap={8}
                >
                    <CartesianGrid horizontal={false} stroke="currentColor" className="text-utility-neutral-100" />
                    <XAxis type="number" hide domain={[0, "dataMax"]} />
                    <YAxis
                        type="category"
                        dataKey="name"
                        fill="currentColor"
                        axisLine={false}
                        tickLine={false}
                        width={isDesktop ? 150 : 116}
                        tickFormatter={(value) => truncate(String(value), isDesktop ? 34 : 26)}
                    />
                    <Tooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => format(Number(value))}
                        cursor={{ className: "fill-utility-neutral-200/20" }}
                    />
                    {reference !== undefined && (
                        <ReferenceLine x={reference} stroke="currentColor" strokeDasharray="4 4" className="text-utility-neutral-400" />
                    )}
                    {series.map((s) => (
                        <Bar
                            key={s.key}
                            isAnimationActive={false}
                            dataKey={s.key}
                            name={s.name}
                            stackId={stacked ? "a" : undefined}
                            className={s.className}
                            fill="currentColor"
                            maxBarSize={20}
                            radius={stacked ? 0 : [0, 4, 4, 0]}
                        >
                            {s === last && <LabelList dataKey="label" position="right" fill="currentColor" className="text-secondary" width={96} />}
                        </Bar>
                    ))}
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    );
};

const NoData = ({ children }: { children: ReactNode }) => (
    <p className="rounded-lg bg-secondary px-4 py-6 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">{children}</p>
);

/** A row with a name, a figure and a proportional bar. Used where a chart would add nothing. */
const MeterRow = ({
    label,
    value,
    detail,
    fraction,
    tone = "brand",
    href,
}: {
    label: ReactNode;
    value: string;
    detail?: string;
    fraction: number;
    tone?: "brand" | "bad" | "warning" | "good";
    href?: string;
}) => {
    const bar = { brand: "bg-fg-brand-primary", bad: "bg-fg-error-secondary", warning: "bg-fg-warning-secondary", good: "bg-fg-success-secondary" }[tone];
    return (
        <li className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
                {href ? (
                    <a
                        href={href}
                        className="min-w-0 rounded-xs text-sm font-medium text-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                    >
                        {label}
                    </a>
                ) : (
                    <span className="min-w-0 text-sm font-medium text-secondary">{label}</span>
                )}
                <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <div className={cx("h-2 rounded-full", bar)} style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }} />
            </div>
            {detail && <p className="text-xs text-tertiary">{detail}</p>}
        </li>
    );
};

const SectionHeading = ({ title, description }: { title: string; description: string }) => (
    <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        <p className="text-sm text-tertiary">{description}</p>
    </div>
);

// ------------------------------------------------------------------------------------ cards

interface CardProps {
    loc: LocationId;
    period: Period;
}

const UsageCard = ({ loc, period }: CardProps) => {
    const start = periodStart(period);
    const months = PERIODS.find((p) => p.id === period)?.months ?? 12;
    const borrowed = loc === "newburyport";
    const rows = forecasts
        .filter((f) => f.locationId === loc && f.monthlyUsage > 0)
        .map((f) => {
            const inPeriod = f.history.filter((h) => h.month >= start);
            const usage = period === "ytd" ? f.monthlyUsage : round1(sum(inPeriod.map((h) => h.qty)) / months);
            return { item: getItem(f.itemId), usage, cycles: inPeriod.length };
        })
        .filter((r) => r.item && r.usage > 0)
        .sort((a, b) => b.usage - a.usage);
    const top = rows.slice(0, 6);
    const first = top[0];
    const lastCycle = ordersInScope("lynnfield", "2026-01")
        .filter((po) => po.kind === "supply")
        .map((po) => po.cycle)
        .sort()
        .pop();

    return (
        <InsightCard
            metric="Usage"
            provenance={borrowed ? "sample" : "real"}
            sampleLabel="Estimated from Lynnfield"
            title={
                first?.item
                    ? `${first.item.name} is the fastest-moving supply, at about ${formatCount(first.usage, first.item.unit)} a month`
                    : `No supply orders were received in ${periodPhrase[period]}, so there is no usage to show`
            }
            why={
                first
                    ? borrowed
                        ? "Newburyport has one order form on file, so its usage is estimated at 70% of Lynnfield's until it has its own history."
                        : `${rows.length} supplies have enough order history to estimate. These six move fastest, so they are the ones to keep an eye on.`
                    : lastCycle
                      ? `The last supply order cycle on file is ${formatMonth(lastCycle)}. Choose a longer period, or log the orders placed since then.`
                      : undefined
            }
            footnote="Usage is worked out from what was received each order cycle, because Meraki orders to replace what was used. It becomes exact once usage is logged in the app."
            action={{ label: "See stock", href: ROUTES.stock }}
        >
            {top.length ? (
                <HorizontalBars
                    data={top.map((r) => ({ name: r.item?.name ?? "", usage: r.usage, label: `${r.usage}/mo` }))}
                    series={[{ key: "usage", name: "Used per month", className: "text-utility-brand-600" }]}
                    formatValue={(n) => `${n} a month`}
                />
            ) : (
                <NoData>Nothing received in this period.</NoData>
            )}
        </InsightCard>
    );
};

const ForecastCard = ({ loc, period }: CardProps) => {
    const isDesktop = useBreakpoint("lg");
    const start = periodStart(period);
    const borrowed = loc === "newburyport";
    const aItems = forecasts.filter((f) => f.locationId === loc && f.monthlyUsage > 0 && getItem(f.itemId)?.abc === "A");

    // Received per month in the period (bars), then the next three months (dashed line and band).
    const historyMonths: string[] = [];
    for (let m = `${start}-01`; monthKey(m) <= monthKey(TODAY); m = addMonths(m, 1)) historyMonths.push(monthKey(m));
    const history = historyMonths.map((month) => ({
        month,
        received: sum(aItems.map((f) => f.history.find((h) => h.month === month)?.qty ?? 0)),
        expected: undefined as number | undefined,
        band: undefined as [number, number] | undefined,
    }));
    const projectionMonths = aItems[0]?.projection.map((p) => p.month) ?? [];
    const projection = projectionMonths.map((month) => {
        const points = aItems.map((f) => f.projection.find((p) => p.month === month));
        return {
            month,
            received: undefined as number | undefined,
            expected: round1(sum(points.map((p) => p?.qty ?? 0))),
            band: [round1(sum(points.map((p) => p?.low ?? p?.qty ?? 0))), round1(sum(points.map((p) => p?.high ?? p?.qty ?? 0)))] as [number, number],
        };
    });
    const data = [...history, ...projection];
    const next = projection[0];
    const lastMonth = projection[projection.length - 1]?.month;

    const reorder = aItems
        .map((f) => {
            const level = getStock(f.itemId, loc);
            const gap = f.onHand - f.reorderPoint;
            const days = gap <= 0 ? 0 : f.dailyUsage > 0 ? Math.ceil(gap / f.dailyUsage) : undefined;
            return { f, item: getItem(f.itemId), days, isSample: level?.isSample ?? true };
        })
        .filter((r) => r.days !== undefined)
        .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    const dueNow = reorder.filter((r) => r.days === 0);
    const soonest = reorder[0];
    const anySample = reorder.slice(0, 4).some((r) => r.isSample);

    const title = !aItems.length
        ? "There is not enough order history to forecast yet"
        : dueNow.length
          ? `${plural(dueNow.length, "top supply is", "top supplies are")} already at the reorder point`
          : soonest?.item
            ? `${soonest.item.name} reaches its reorder point first, in about ${soonest.days} days`
            : "No top supply is close to its reorder point";

    return (
        <InsightCard
            metric="Forecast, next 3 months"
            provenance={borrowed ? "sample" : "mixed"}
            sampleLabel={borrowed ? "Estimated from Lynnfield" : "Sample on-hand"}
            tone={dueNow.length ? "warning" : "neutral"}
            title={title}
            why={
                next && lastMonth
                    ? `The ${aItems.length} class A supplies should use about ${next.expected} units a month through ${formatMonth(lastMonth)}, and likely between ${next.band[0]} and ${next.band[1]}.`
                    : "Forecasts appear once an item has been received in at least one order cycle."
            }
            footnote="Bars show what was received in each order cycle. The dashed line is expected monthly demand and the shaded band is the likely range. Units are mixed: bottles, gallons and boxes."
            action={{ label: "Build the next order", href: ROUTES.newOrder }}
        >
            {aItems.length > 0 && (
                <div className="flex flex-col gap-3">
                    <ChartLegend
                        items={[
                            { name: "Received", className: "text-utility-brand-600" },
                            { name: "Expected demand", className: "text-utility-brand-700", dashed: true },
                            { name: "Likely range", className: "text-utility-brand-300" },
                        ]}
                    />
                    <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={isDesktop ? 220 : 200}>
                        <ComposedChart data={data} className="text-tertiary [&_.recharts-text]:text-xs" margin={{ left: -18, right: 6, top: 8, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                            <XAxis
                                fill="currentColor"
                                axisLine={false}
                                tickLine={false}
                                tickMargin={8}
                                interval={isDesktop || data.length <= 7 ? 0 : 1}
                                dataKey="month"
                                tickFormatter={(value) => shortMonth(String(value))}
                            />
                            <YAxis fill="currentColor" axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip
                                content={<ChartTooltipContent />}
                                labelFormatter={(value) => formatMonth(String(value))}
                                formatter={(value) => (Array.isArray(value) ? `${value[0]} to ${value[1]} units` : `${Number(value)} units`)}
                                cursor={{ className: "fill-utility-neutral-200/20" }}
                            />
                            <Bar
                                isAnimationActive={false}
                                dataKey="received"
                                name="Received"
                                className="text-utility-brand-600"
                                fill="currentColor"
                                maxBarSize={isDesktop ? 24 : 14}
                                radius={[4, 4, 0, 0]}
                            />
                            <Area
                                isAnimationActive={false}
                                dataKey="band"
                                name="Likely range"
                                type="monotone"
                                className="text-utility-brand-400"
                                stroke="none"
                                fill="currentColor"
                                fillOpacity={0.3}
                                connectNulls={false}
                            />
                            <Line
                                isAnimationActive={false}
                                dataKey="expected"
                                name="Expected demand"
                                type="monotone"
                                className="text-utility-brand-700"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeDasharray="5 4"
                                dot={{ r: 3, fill: "currentColor", strokeWidth: 0 }}
                                connectNulls={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>

                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-primary">Reaches its reorder point first</h4>
                            {anySample && !borrowed && <SampleBadge label="On-hand is sample" />}
                        </div>
                        <ul className="flex flex-col divide-y divide-border-secondary">
                            {reorder.slice(0, 4).map(({ f, item, days }) => (
                                <li key={f.itemId} className="flex items-start justify-between gap-3 py-2">
                                    <div className="min-w-0">
                                        <a
                                            href={ROUTES.item(f.itemId)}
                                            className="rounded-xs text-sm font-medium text-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                        >
                                            {item?.name}
                                        </a>
                                        <p className="text-xs text-tertiary">
                                            {formatCount(f.onHand, item?.unit)} on hand, reorder at {f.reorderPoint}
                                        </p>
                                    </div>
                                    <span
                                        className={cx(
                                            "shrink-0 text-right text-sm font-semibold tabular-nums",
                                            days === 0 ? "text-warning-primary" : "text-primary",
                                        )}
                                    >
                                        {days === 0 ? "Reorder now" : `${days} days`}
                                        {days !== undefined && days > 0 && (
                                            <span className="block text-xs font-normal text-tertiary">{formatDate(addDays(TODAY, days))}</span>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </InsightCard>
    );
};

const CycleTimeCard = ({ loc, period }: CardProps) => {
    const orders = ordersInScope(loc, periodStart(period));
    const cycles = cycleRows(orders).filter((c) => c.avgDays !== undefined);
    const main = vendorPerformance(orders).filter((v) => v.avgLeadDays !== undefined)[0];
    return (
        <InsightCard
            metric="Order cycle time"
            provenance="real"
            tone={main && main.avgLeadDays !== undefined && main.avgLeadDays > main.assumedLeadDays ? "warning" : "neutral"}
            title={
                main?.avgLeadDays !== undefined
                    ? `${main.vendor} orders take about ${main.avgLeadDays} days from the order form to the shelf`
                    : `No order lines were marked received at ${locationName(loc)} in ${periodPhrase[period]}`
            }
            why={
                main?.avgLeadDays !== undefined
                    ? `The forecast currently assumes ${main.assumedLeadDays} days for this vendor. Par levels have to cover the real wait, or orders need to go out sooner after the count.`
                    : "Cycle time is measured from the date an order form was started to the date each line was received. It appears as soon as a delivery is logged."
            }
            footnote={
                main
                    ? `Average days from order form to receipt, per order cycle. The dashed line marks the ${main.assumedLeadDays}-day lead time the forecast assumes.`
                    : undefined
            }
            action={{ label: "See orders", href: ROUTES.orders }}
        >
            {cycles.length ? (
                <HorizontalBars
                    data={cycles.map((c) => ({ name: c.name, days: c.avgDays, label: `${c.avgDays} days` }))}
                    series={[{ key: "days", name: "Days to shelf", className: "text-utility-brand-600" }]}
                    unit="days"
                    reference={main?.assumedLeadDays}
                />
            ) : (
                <NoData>No receipts in this period.</NoData>
            )}
        </InsightCard>
    );
};

const VendorCard = ({ loc, period }: CardProps) => {
    const perf = vendorPerformance(ordersInScope(loc, periodStart(period)));
    const ranked = perf.filter((v) => v.lines >= 10).sort((a, b) => a.fillRate - b.fillRate);
    const worst = ranked[0];
    const best = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;
    return (
        <InsightCard
            metric="Vendor performance"
            provenance="real"
            tone={worst && worst.fillRate < 0.75 ? "bad" : "neutral"}
            title={
                worst
                    ? `${worst.vendor} filled ${pct(worst.fillRate)} of what was ordered${best && best.fillRate > worst.fillRate ? `; ${best.vendor} filled ${pct(best.fillRate)}` : ""}`
                    : perf.length
                      ? "Too few received lines to compare vendors yet"
                      : `No deliveries were logged at ${locationName(loc)} in ${periodPhrase[period]}`
            }
            why={
                perf.length
                    ? "Fill rate is units logged as received out of units ordered. Lines the vendor could not supply and lines nobody logged both count against it."
                    : "Vendor fill rate and lead time appear once receiving has started on an order."
            }
            footnote={perf.length ? "Only orders where receiving started. Orders with nothing received are reported as not received instead." : undefined}
            action={{ label: "Vendor settings", href: ROUTES.settings }}
        >
            {perf.length ? (
                <ul className="flex flex-col gap-3.5">
                    {perf.map((v) => (
                        <MeterRow
                            key={v.vendor}
                            label={v.vendor}
                            value={pct(v.fillRate)}
                            fraction={v.fillRate}
                            tone={v.fillRate < 0.75 ? "bad" : v.fillRate < 0.9 ? "warning" : "good"}
                            detail={`${plural(v.lines, "line")} ordered · ${v.avgLeadDays !== undefined ? `${v.avgLeadDays} days to shelf on average` : "no receipt dates"}`}
                        />
                    ))}
                </ul>
            ) : (
                <NoData>No received orders in this period.</NoData>
            )}
        </InsightCard>
    );
};

const AccuracyCard = ({ loc, period }: CardProps) => {
    const acc = receivingAccuracy(loc, ordersInScope(loc, periodStart(period)));
    const share = acc.receivedLines ? acc.mismatched / acc.receivedLines : 0;
    const slices = [
        { name: "Matched the order", value: acc.matched, className: "text-utility-brand-500" },
        { name: "Quantity differed", value: acc.quantity, className: "text-utility-orange-400" },
        { name: "Different type delivered", value: acc.variant, className: "text-utility-indigo-400" },
    ];
    return (
        <InsightCard
            metric="Receiving accuracy"
            provenance="real"
            tone={share > 0.05 ? "warning" : acc.receivedLines ? "good" : "neutral"}
            title={
                acc.receivedLines
                    ? acc.mismatched
                        ? `${acc.mismatched} of ${acc.receivedLines} received lines (${pct(share)}) did not match the order`
                        : `All ${acc.receivedLines} received lines matched the order`
                    : `No order lines were marked received at ${locationName(loc)} in ${periodPhrase[period]}`
            }
            why={
                acc.mismatched
                    ? `${acc.quantity} differed in quantity and ${acc.variant} arrived as a different type (regular, gel or dip). Check each against its invoice before it is paid.`
                    : acc.receivedLines
                      ? "Quantity and type both agreed with the order form on every line."
                      : "Accuracy compares what was received with what was ordered, line by line."
            }
            footnote={acc.receivedLines ? "A line counts once even when both quantity and type differ." : undefined}
            action={{ label: "Review the mismatches", href: ROUTES.flags }}
        >
            {acc.receivedLines > 0 ? (
                <div className="flex flex-col items-center gap-5 sm:flex-row">
                    <div className="relative size-40 shrink-0">
                        <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={160}>
                            <PieChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                                <Tooltip content={<ChartTooltipContent isPieChart />} formatter={(value) => `${Number(value)} lines`} />
                                <Pie
                                    isAnimationActive={false}
                                    startAngle={-270}
                                    endAngle={-630}
                                    stroke="none"
                                    data={slices}
                                    dataKey="value"
                                    nameKey="name"
                                    fill="currentColor"
                                    innerRadius={52}
                                    outerRadius={78}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-semibold text-primary tabular-nums">{pct(1 - share)}</span>
                            <span className="text-xs text-tertiary">matched</span>
                        </div>
                    </div>
                    <ul className="flex w-full flex-col gap-2">
                        {slices.map((s) => (
                            <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex items-center gap-2 text-secondary">
                                    <span aria-hidden="true" className={cx("size-2.5 shrink-0 rounded-full bg-current", s.className)} />
                                    {s.name}
                                </span>
                                <span className="font-semibold text-primary tabular-nums">{plural(s.value, "line")}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <NoData>No receipts in this period.</NoData>
            )}
        </InsightCard>
    );
};

const UnreceivedCard = ({ loc, period }: CardProps) => {
    const cycles = cycleRows(ordersInScope(loc, periodStart(period)));
    const open = sum(cycles.map((c) => c.open));
    const total = sum(cycles.map((c) => c.lines));
    const worst = [...cycles].sort((a, b) => b.open - a.open)[0];
    return (
        <InsightCard
            metric="Unreceived order lines"
            provenance="real"
            tone={open ? "bad" : "good"}
            title={
                total
                    ? open
                        ? `${open} of ${total} order lines from ${periodPhrase[period]} were never marked received`
                        : `Every order line from ${periodPhrase[period]} was marked received`
                    : `No orders are on file for ${locationName(loc)} in ${periodPhrase[period]}`
            }
            why={
                open
                    ? `${worst && worst.open > 0 ? `${worst.name} has the most, with ${worst.open} open. ` : ""}Until they are received or cancelled, on-hand numbers and forecasts are understated.`
                    : total
                      ? "Nothing is waiting to be received."
                      : "Orders appear here once an order form is saved for this location."
            }
            footnote={total ? "Lines with a quantity ordered. Received means any quantity was logged against the line." : undefined}
            action={{ label: "Receive deliveries", href: ROUTES.receive }}
        >
            {cycles.length ? (
                <HorizontalBars
                    data={cycles.map((c) => ({ name: c.name, received: c.received, open: c.open, label: `${c.open} open` }))}
                    series={[
                        { key: "received", name: "Received", className: "text-utility-brand-600" },
                        { key: "open", name: "Not marked received", className: "text-utility-orange-300" },
                    ]}
                    unit="lines"
                />
            ) : (
                <NoData>No order cycles in this period.</NoData>
            )}
        </InsightCard>
    );
};

const StockValueCard = ({ loc }: { loc: LocationId }) => {
    const rows = stockRows(loc);
    const total = sum(rows.map((r) => r.value));
    const byCategory = new Map<string, number>();
    for (const r of rows) byCategory.set(r.item.category, (byCategory.get(r.item.category) ?? 0) + r.value);
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 7);
    const rest = sum(ranked.slice(7).map(([, v]) => v));
    const data = [...top, ...(rest > 0 ? ([[`${ranked.length - 7} other categories`, rest]] as [string, number][]) : [])].map(([name, value]) => ({
        name,
        value: Math.round(value),
        label: formatCurrency(value),
    }));
    const first = ranked[0];

    const supplies = rows.filter((r) => r.item.kind === "supply");
    const supplyTotal = sum(supplies.map((r) => r.value));
    const abc = (["A", "B", "C"] as AbcClass[]).map((cls) => {
        const inClass = supplies.filter((r) => r.item.abc === cls);
        return { cls, count: inClass.length, value: sum(inClass.map((r) => r.value)) };
    });
    const abcBar: Record<AbcClass, string> = { A: "bg-utility-brand-700", B: "bg-utility-brand-400", C: "bg-utility-neutral-300" };

    return (
        <InsightCard
            metric="Stock value by category"
            provenance="sample"
            sampleLabel="Sample costs"
            title={first ? `About ${formatCurrency(total)} of stock is on the shelves, most of it in ${first[0]}` : "No stock on file"}
            why="Quantities for polish and tips come from your sheets; unit costs are placeholders. Treat the dollar figures as a rough shape until invoices are loaded."
            footnote={`As of ${formatDate(TODAY, true)}. On hand multiplied by unit cost.`}
            action={{ label: "See stock", href: ROUTES.stock }}
        >
            <div className="flex flex-col gap-5">
                <HorizontalBars
                    data={data}
                    series={[{ key: "value", name: "Value on hand", className: "text-utility-brand-600" }]}
                    formatValue={(n) => formatCurrency(n)}
                />

                <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold text-primary">Supplies by ABC class</h4>
                    <div
                        className="flex h-3 overflow-hidden rounded-full bg-secondary"
                        role="img"
                        aria-label={abc.map((a) => `Class ${a.cls}: ${formatCurrency(a.value)}`).join(", ")}
                    >
                        {abc.map((a) => (
                            <div key={a.cls} className={abcBar[a.cls]} style={{ width: `${supplyTotal ? (a.value / supplyTotal) * 100 : 0}%` }} />
                        ))}
                    </div>
                    <ul className="grid grid-cols-3 gap-2">
                        {abc.map((a) => (
                            <li key={a.cls} className="flex flex-col gap-0.5">
                                <span className="flex items-center gap-1.5">
                                    <span aria-hidden="true" className={cx("size-2 rounded-full", abcBar[a.cls])} />
                                    <AbcBadge abc={a.cls} />
                                </span>
                                <span className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(a.value)}</span>
                                <span className="text-xs text-tertiary">{plural(a.count, "item")}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-tertiary">
                        A items carry the most yearly spend and are counted weekly. Polish is left out: it has no usage history yet.
                    </p>
                </div>
            </div>
        </InsightCard>
    );
};

const VarianceCard = ({ loc }: { loc: LocationId }) => {
    const sessions = countSessions
        .filter((c) => c.locationId === loc && c.lines.some((l) => l.counted !== undefined))
        .map((c) => {
            const counted = c.lines.filter((l) => l.counted !== undefined);
            const short = sum(counted.map((l) => Math.max(0, l.expected - (l.counted ?? 0))));
            const over = sum(counted.map((l) => Math.max(0, (l.counted ?? 0) - l.expected)));
            const value = sum(counted.map((l) => Math.max(0, l.expected - (l.counted ?? 0)) * (getItem(l.itemId)?.unitCost ?? 0)));
            return { id: c.id, name: c.name, counted: counted.length, short, over, value };
        });
    const short = sum(sessions.map((s) => s.short));
    const value = sum(sessions.map((s) => s.value));
    return (
        <InsightCard
            metric="Count variance and shrinkage"
            provenance="sample"
            title={
                sessions.length
                    ? short
                        ? `Sample counts came up ${plural(short, "unit")} short, about ${formatCurrency(value)} at sample costs`
                        : "Sample counts matched what was expected"
                    : `No counts have been recorded at ${locationName(loc)} yet`
            }
            why={
                sessions.length
                    ? "These counts are generated examples so this card has something to show. Real variance appears here after the first count is submitted in the app."
                    : "Variance is the gap between what the ledger expected and what was counted. It appears here after the first count is submitted in the app."
            }
            footnote={
                sessions.length
                    ? "Units short is expected minus counted, where the count was lower. It does not say why: damage, miscounts and unlogged use all look the same here."
                    : undefined
            }
            action={{ label: "See counts", href: ROUTES.counts }}
        >
            {sessions.length ? (
                <HorizontalBars
                    data={sessions.map((s) => ({ name: s.name, short: s.short, label: `${s.short} short` }))}
                    series={[{ key: "short", name: "Units short", className: "text-utility-neutral-400" }]}
                    unit="units short"
                />
            ) : (
                <NoData>Shrinkage is measured from counts. Schedule the first count to start the record.</NoData>
            )}
        </InsightCard>
    );
};

const DataQualityCard = ({ loc }: { loc: LocationId }) => {
    const supplies = stockRows(loc, "supply");
    const noPar = supplies.filter((r) => r.level.parRule === "unset").length;
    const names = new Map<string, number>();
    for (const i of items.filter((i) => i.kind === "supply")) {
        const key = i.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
        names.set(key, (names.get(key) ?? 0) + 1);
    }
    const duplicates = [...names.values()].filter((n) => n > 1).length;
    const orderLines = purchaseOrders.filter((po) => po.imported && po.locationId === loc).flatMap((po) => po.lines);
    const unmatched = orderLines.filter((l) => !l.itemId).length;
    const estimates = vendors.filter((v) => v.leadTimeIsEstimate).length;
    return (
        <InsightCard
            metric="Data quality"
            provenance="real"
            tone={noPar ? "warning" : "good"}
            title={
                noPar ? `${noPar} of ${supplies.length} supplies have no par level, so the app cannot tell when they are low` : "Every supply has a par level"
            }
            why="Each gap below makes a number somewhere else less reliable. Fixing them is the cheapest way to improve every other report."
            action={{ label: "Open the data quality flags", href: ROUTES.flags }}
        >
            <ul className="flex flex-col gap-3.5">
                <MeterRow
                    label="Supplies with no par level"
                    value={String(noPar)}
                    fraction={supplies.length ? noPar / supplies.length : 0}
                    tone="warning"
                    detail={`Of ${supplies.length} supplies. They are only reordered when someone notices.`}
                    href={ROUTES.stock}
                />
                <MeterRow
                    label="Order lines not matched to a catalogue item"
                    value={String(unmatched)}
                    fraction={orderLines.length ? unmatched / orderLines.length : 0}
                    tone="warning"
                    detail={`Of ${orderLines.length} lines on the 2026 order forms. Mostly free-text requests. They are left out of usage and forecasts.`}
                    href={ROUTES.orders}
                />
                <MeterRow
                    label="Supplies listed more than once"
                    value={String(duplicates)}
                    fraction={supplies.length ? duplicates / supplies.length : 0}
                    tone="warning"
                    detail="The same product on two rows splits its counts and orders between them."
                    href={ROUTES.stock}
                />
                <MeterRow
                    label="Vendor lead times that are estimates"
                    value={`${estimates} of ${vendors.length}`}
                    fraction={vendors.length ? estimates / vendors.length : 0}
                    tone="brand"
                    detail="Reorder points lean on these. Confirm them in Settings."
                    href={ROUTES.settings}
                />
            </ul>
        </InsightCard>
    );
};

// ------------------------------------------------------------------------------------ screen

export interface ReportsScreenProps {
    /** Period to start on (deep link `?period=`). */
    initialPeriod?: Period;
    location?: LocationId;
}

/**
 * Reports: each card leads with the finding in a sentence, shows the chart that backs it, and
 * says whether the numbers come from Meraki's sheets or from the sample layer.
 */
export const ReportsScreen = ({ location: initialLocation = "lynnfield", initialPeriod = "ytd" }: ReportsScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [period, setPeriod] = useState<Period>(initialPeriod);
    useUrlSync({ period: period === "ytd" ? undefined : period });
    const [notice, setNotice] = useState<string>();

    const orders = ordersInScope(location, periodStart(period));
    const cycles = cycleRows(orders);
    const perf = vendorPerformance(orders);
    const main = perf.find((v) => v.avgLeadDays !== undefined);
    const accuracy = receivingAccuracy(location, orders);
    const openLines = sum(cycles.map((c) => c.open));
    const totalLines = sum(cycles.map((c) => c.lines));
    const supplies = stockRows(location, "supply");
    const noPar = supplies.filter((r) => r.level.parRule === "unset").length;
    const card = { loc: location, period };

    return (
        <AppShell activeUrl={ROUTES.reports} location={location} onLocationChange={setLocation}>
            <PageContent>
                <PageHeader
                    title="Reports"
                    description={`What the numbers say about ${locationName(location)}, one finding per card.`}
                    actions={
                        <>
                            <Button
                                color="secondary"
                                size="md"
                                iconLeading={Download01}
                                onClick={() =>
                                    setNotice("Export is not wired up in the prototype. The live app downloads these cards as a PDF and the tables as CSV.")
                                }
                            >
                                Export
                            </Button>
                            <Button
                                color="secondary"
                                size="md"
                                iconLeading={Mail01}
                                onClick={() => setNotice(`Nothing was sent from the prototype. The live app emails this report to ${CURRENT_USER.email}.`)}
                            >
                                Email this report
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <ButtonGroup
                            aria-label="Period"
                            size="sm"
                            selectedKeys={[period]}
                            disallowEmptySelection
                            onSelectionChange={(keys) => {
                                const key = [...keys][0];
                                if (key) setPeriod(key as Period);
                            }}
                        >
                            {PERIODS.map((p) => (
                                <ButtonGroupItem key={p.id} id={p.id} className="min-h-11 lg:min-h-0">
                                    {p.label}
                                </ButtonGroupItem>
                            ))}
                        </ButtonGroup>
                        <p className="text-sm text-tertiary">
                            Order cycles from {formatMonth(periodStart(period))} to {formatMonth(TODAY)}
                        </p>
                    </div>
                    {notice && (
                        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-secondary ring-1 ring-brand_alt ring-inset">
                            {notice}
                        </p>
                    )}
                    <SampleDataNote>
                        Cards marked “From your sheets” are built from the 2026 order forms and the supply list. Cards marked “Sample” use placeholder costs,
                        counts or on-hand numbers and will change when real data is loaded.
                    </SampleDataNote>
                </div>

                <section className="flex flex-col gap-3" aria-label="Headline numbers">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-secondary">Headline numbers for {periodPhrase[period]}</h2>
                        <RealDataBadge />
                    </div>
                    <StatGrid>
                        <StatCard
                            label="Order to shelf"
                            value={main?.avgLeadDays !== undefined ? `${main.avgLeadDays} days` : "No data"}
                            hint={main ? `${main.vendor}, measured` : "No receipts logged"}
                            tone={main?.avgLeadDays !== undefined && main.avgLeadDays > main.assumedLeadDays ? "warning" : "neutral"}
                        />
                        <StatCard
                            label="Lines never received"
                            value={totalLines ? String(openLines) : "No data"}
                            hint={totalLines ? `of ${totalLines} ordered` : "No orders on file"}
                            tone={openLines ? "bad" : "neutral"}
                        />
                        <StatCard
                            label="Receipts that did not match"
                            value={accuracy.receivedLines ? pct(accuracy.mismatched / accuracy.receivedLines) : "No data"}
                            hint={accuracy.receivedLines ? `${accuracy.mismatched} of ${accuracy.receivedLines} lines` : "No receipts logged"}
                            tone={accuracy.mismatched ? "warning" : "neutral"}
                        />
                        <StatCard
                            label="Supplies with no par"
                            value={String(noPar)}
                            hint={`of ${supplies.length} supplies`}
                            tone={noPar ? "warning" : "good"}
                        />
                    </StatGrid>
                </section>

                <section className="flex flex-col gap-4">
                    <SectionHeading title="Usage and forecast" description="What moves fastest, and what will need ordering next." />
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                        <UsageCard {...card} />
                        <ForecastCard {...card} />
                    </div>
                </section>

                <section className="flex flex-col gap-4">
                    <SectionHeading title="Ordering and receiving" description="How long orders take, how complete they arrive, and what is still open." />
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                        <CycleTimeCard {...card} />
                        <VendorCard {...card} />
                        <AccuracyCard {...card} />
                        <UnreceivedCard {...card} />
                    </div>
                </section>

                <section className="flex flex-col gap-4">
                    <SectionHeading
                        title="Stock, counts and data"
                        description={`Where things stand on ${formatDate(TODAY, true)}. These cards do not change with the period.`}
                    />
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                        <StockValueCard loc={location} />
                        <div className="flex flex-col gap-4">
                            <VarianceCard loc={location} />
                            <DataQualityCard loc={location} />
                        </div>
                    </div>
                </section>
            </PageContent>
        </AppShell>
    );
};
