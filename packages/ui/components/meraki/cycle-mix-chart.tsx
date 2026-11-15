"use client";

import { useState } from "react";
import { Bar, CartesianGrid, LabelList, BarChart as RechartsBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { formatMonth } from "@/engine/dates";
import type { GroupMix } from "@/engine/insights";
import { cx } from "@/utils/cx";

// ------------------------------------------------------------------------------------ swatches

interface Hsl {
    h: number;
    s: number;
    l: number;
}

/** Reads an `hsl(...)` or `#rrggbb` colour. Anything else is ignored. */
const parseColor = (value: string): Hsl | undefined => {
    const text = value.trim();
    const hsl = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(text);
    if (hsl) return { h: ((Number(hsl[1]) % 360) + 360) % 360, s: Number(hsl[2]), l: Number(hsl[3]) };
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
    if (!hex) return undefined;
    const [r, g, b] = [hex[1], hex[2], hex[3]].map((c) => Number.parseInt(c ?? "0", 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l: l * 100 };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
};

/**
 * One colour standing for a set of swatches: the average hue, saturation and lightness.
 * Returns nothing when the set has no common hue (a mixed collection averages to mud, which
 * would misrepresent it), or when there are too few swatches to tell.
 */
export const representativeSwatch = (swatches: (string | undefined)[]): string | undefined => {
    const colors = swatches.map((s) => (s ? parseColor(s) : undefined)).filter((c): c is Hsl => Boolean(c));
    if (colors.length < 3) return undefined;
    const n = colors.length;
    const x = colors.reduce((a, c) => a + Math.cos((c.h * Math.PI) / 180), 0) / n;
    const y = colors.reduce((a, c) => a + Math.sin((c.h * Math.PI) / 180), 0) / n;
    const s = colors.reduce((a, c) => a + c.s, 0) / n;
    const l = colors.reduce((a, c) => a + c.l, 0) / n;
    // How tightly the hues cluster: 1 when identical, near 0 when spread around the wheel.
    const concentration = Math.hypot(x, y);
    if (concentration < 0.85 && s > 12) return undefined;
    const h = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
};

/** A representative swatch per colour family, computed from the items' own swatches. Families with no common hue are left out. */
export const familySwatches = (items: { colorFamily?: string; swatch?: string }[]): Record<string, string> => {
    const byFamily = new Map<string, (string | undefined)[]>();
    for (const item of items) {
        if (!item.colorFamily) continue;
        byFamily.set(item.colorFamily, [...(byFamily.get(item.colorFamily) ?? []), item.swatch]);
    }
    const out: Record<string, string> = {};
    for (const [family, swatches] of byFamily) {
        const swatch = representativeSwatch(swatches);
        if (swatch) out[family] = swatch;
    }
    return out;
};

// ------------------------------------------------------------------------------------ chart

type Mode = "share" | "quantity";

/** Neutral fills for groups that are not a colour family, with whether a label on top needs light text. */
const NEUTRALS: { className: string; lightText: boolean }[] = [
    { className: "text-utility-neutral-400", lightText: false },
    { className: "text-utility-neutral-300", lightText: false },
    { className: "text-utility-neutral-500", lightText: true },
    { className: "text-utility-neutral-600", lightText: true },
];
const OTHER_TONE = { className: "text-utility-neutral-200", lightText: false };

interface Series {
    key: string;
    group: string;
    /** Number of groups folded into this one, for "Other". */
    folded?: number;
    color?: string;
    className?: string;
    lightText: boolean;
    byCycle: Record<string, number>;
    shareByCycle: Record<string, number>;
    qty: number;
    share: number;
}

const shortMonth = (cycle: string) => {
    const label = formatMonth(cycle);
    return `${label.slice(0, 3)} '${label.slice(-2)}`;
};
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface SegmentLabelProps {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    value?: number | string | boolean | null;
}

/** Prints the value inside a segment when the segment is wide enough to hold it. */
const segmentLabel = (lightText: boolean, mode: Mode) => {
    const SegmentLabel = ({ x, y, width, height, value }: SegmentLabelProps) => {
        const w = Number(width);
        const n = Number(value);
        if (!Number.isFinite(w) || !Number.isFinite(n) || w < 30 || n <= 0) return null;
        return (
            <text
                x={Number(x) + w / 2}
                y={Number(y) + Number(height) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={600}
                fill="currentColor"
                className={lightText ? "text-white" : "text-primary"}
            >
                {mode === "share" ? `${Math.round(n)}%` : n}
            </text>
        );
    };
    return SegmentLabel;
};

export interface CycleMixChartProps {
    /** Demand grouped by colour family, category or product line, from `demandMix`. */
    mix: GroupMix[];
    /** Order cycles (yyyy-mm), oldest first. One bar each. */
    cycles: string[];
    /**
     * A CSS colour for a group, e.g. from `familySwatches`. Groups it returns nothing for are drawn
     * in neutral tones, so a grey segment always means "not a colour family".
     */
    colorOf?: (group: string) => string | undefined;
    /** Groups shown on their own before the rest are folded into "Other". */
    maxGroups?: number;
    /** Plural counting unit for the quantity view and the totals, e.g. "bottles". */
    unit?: string;
    defaultMode?: Mode;
    className?: string;
}

/**
 * What each order cycle was made of. One stacked bar per cycle; switch between each group's share
 * of the cycle and the quantity ordered. The table underneath repeats every number, so nothing
 * depends on hovering or on telling two colours apart.
 */
export const CycleMixChart = ({ mix, cycles, colorOf, maxGroups = 7, unit = "units", defaultMode = "share", className }: CycleMixChartProps) => {
    const [mode, setMode] = useState<Mode>(defaultMode);

    const totals: Record<string, number> = {};
    for (const c of cycles) totals[c] = mix.reduce((n, g) => n + (g.byCycle[c] ?? 0), 0);
    const grand = mix.reduce((n, g) => n + g.qty, 0);

    if (!mix.length || !cycles.length || grand <= 0) {
        return (
            <p className={cx("rounded-lg bg-secondary px-4 py-6 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset", className)}>
                No orders on file for this selection, so there is no mix to show.
            </p>
        );
    }

    const ranked = [...mix].sort((a, b) => b.qty - a.qty);
    const shown = ranked.length > maxGroups + 1 ? ranked.slice(0, maxGroups) : ranked;
    const rest = ranked.slice(shown.length);

    let neutral = 0;
    const series: Series[] = shown.map((g, i) => {
        const color = colorOf?.(g.group);
        const tone = color ? undefined : NEUTRALS[neutral++ % NEUTRALS.length];
        return {
            key: `g${i}`,
            group: g.group,
            color,
            className: tone?.className,
            lightText: color ? (parseColor(color)?.l ?? 100) < 58 : (tone?.lightText ?? false),
            byCycle: g.byCycle,
            shareByCycle: g.shareByCycle,
            qty: g.qty,
            share: g.share,
        };
    });
    if (rest.length) {
        const byCycle: Record<string, number> = {};
        const shareByCycle: Record<string, number> = {};
        for (const c of cycles) {
            byCycle[c] = rest.reduce((n, g) => n + (g.byCycle[c] ?? 0), 0);
            shareByCycle[c] = totals[c] ? (byCycle[c] ?? 0) / (totals[c] as number) : 0;
        }
        const qty = rest.reduce((n, g) => n + g.qty, 0);
        series.push({
            key: "other",
            group: `${rest.length} smaller groups`,
            folded: rest.length,
            ...OTHER_TONE,
            byCycle,
            shareByCycle,
            qty,
            share: qty / grand,
        });
    }

    const data = cycles.map((c) => {
        const row: Record<string, string | number> = { cycle: c, name: shortMonth(c), totalLabel: `${totals[c] ?? 0} ${unit}` };
        for (const s of series) row[s.key] = mode === "share" ? Math.round((s.shareByCycle[c] ?? 0) * 1000) / 10 : (s.byCycle[c] ?? 0);
        return row;
    });
    const last = series[series.length - 1];

    return (
        <figure className={cx("flex min-w-0 flex-col gap-4", className)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-tertiary">
                    {mode === "share" ? "Each bar is one order cycle, split by share of what was ordered." : `Each bar is one order cycle, in ${unit} ordered.`}
                </p>
                <ButtonGroup
                    aria-label="Show share or quantity"
                    size="sm"
                    selectedKeys={[mode]}
                    disallowEmptySelection
                    onSelectionChange={(keys) => {
                        const key = [...keys][0];
                        if (key) setMode(key as Mode);
                    }}
                >
                    <ButtonGroupItem id="share" className="min-h-11 lg:min-h-0">
                        Share
                    </ButtonGroupItem>
                    <ButtonGroupItem id="quantity" className="min-h-11 lg:min-h-0">
                        Quantity
                    </ButtonGroupItem>
                </ButtonGroup>
            </div>

            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={cycles.length * 48 + 8}>
                <RechartsBarChart
                    data={data}
                    layout="vertical"
                    className="text-tertiary [&_.recharts-text]:text-xs"
                    margin={{ left: 0, right: 84, top: 0, bottom: 0 }}
                    barCategoryGap={10}
                >
                    <CartesianGrid horizontal={false} stroke="currentColor" className="text-utility-neutral-100" />
                    <XAxis type="number" hide domain={mode === "share" ? [0, 100] : [0, "dataMax"]} allowDataOverflow />
                    <YAxis type="category" dataKey="name" fill="currentColor" axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                        content={<ChartTooltipContent />}
                        formatter={(value) => (mode === "share" ? `${Number(value)}%` : `${Number(value)} ${unit}`)}
                        cursor={{ className: "fill-utility-neutral-200/20" }}
                    />
                    {series.map((s) => (
                        <Bar
                            key={s.key}
                            isAnimationActive={false}
                            dataKey={s.key}
                            name={s.group}
                            stackId="mix"
                            className={s.className}
                            fill={s.color ?? "currentColor"}
                            stroke="var(--color-bg-primary)"
                            strokeWidth={1}
                            maxBarSize={30}
                        >
                            <LabelList dataKey={s.key} content={segmentLabel(s.lightText, mode)} />
                            {s === last && <LabelList dataKey="totalLabel" position="right" fill="currentColor" className="text-secondary" width={96} />}
                        </Bar>
                    ))}
                </RechartsBarChart>
            </ResponsiveContainer>

            <div className="overflow-x-auto">
                <table className="w-full min-w-max text-left text-sm">
                    <caption className="sr-only">
                        {mode === "share" ? "Share of each order cycle by group" : `Quantity ordered in each cycle by group, in ${unit}`}
                    </caption>
                    <thead>
                        <tr className="border-b border-secondary text-xs text-quaternary">
                            <th scope="col" className="py-2 pr-3 font-semibold">
                                Group
                            </th>
                            {cycles.map((c) => (
                                <th key={c} scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                                    {shortMonth(c)}
                                </th>
                            ))}
                            <th scope="col" className="py-2 pl-2 text-right font-semibold">
                                All
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-secondary">
                        {series.map((s) => (
                            <tr key={s.key}>
                                <th scope="row" className="py-2 pr-3 font-medium text-secondary">
                                    <span className="flex items-center gap-2">
                                        <span
                                            aria-hidden="true"
                                            className={cx("size-3 shrink-0 rounded-xs ring-1 ring-secondary ring-inset", !s.color && "bg-current", s.className)}
                                            style={s.color ? { backgroundColor: s.color } : undefined}
                                        />
                                        <span className="whitespace-nowrap">{s.group}</span>
                                    </span>
                                </th>
                                {cycles.map((c) => (
                                    <td key={c} className="px-2 py-2 text-right text-tertiary tabular-nums">
                                        {mode === "share" ? pct(s.shareByCycle[c] ?? 0) : (s.byCycle[c] ?? 0)}
                                    </td>
                                ))}
                                <td className="py-2 pl-2 text-right font-semibold text-primary tabular-nums">{mode === "share" ? pct(s.share) : s.qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </figure>
    );
};
