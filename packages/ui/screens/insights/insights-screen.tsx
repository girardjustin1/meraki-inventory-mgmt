"use client";

import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";
import {
    AlertTriangle,
    ArrowUpRight,
    BarChartSquare02,
    ChevronDown,
    ChevronRight,
    InfoCircle,
    Plus,
    SearchLg,
    ShoppingCart01,
    Trash01,
} from "@untitledui/icons";
import type { SortDescriptor as AriaSortDescriptor } from "react-aria-components";
import { Bar, CartesianGrid, ComposedChart, Line, BarChart as RechartsBarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltipContent } from "@/components/application/charts/charts-base";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { CycleMixChart, familySwatches } from "@/components/meraki/cycle-mix-chart";
import { DataReadiness } from "@/components/meraki/data-readiness";
import { ForecastSparkline } from "@/components/meraki/forecast-sparkline";
import { InsightCard } from "@/components/meraki/insight-card";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { ReorderTimeline } from "@/components/meraki/reorder-timeline";
import { ConfidenceBadge, RealDataBadge, SampleBadge } from "@/components/meraki/status-badges";
import { UsageChart } from "@/components/meraki/usage-chart";
import {
    CURRENT_USER,
    TODAY,
    demandFor,
    forecasts,
    getItem,
    getPolishForecast,
    getStock,
    items,
    locationName,
    measuredCycleDays,
    orderCycles,
    purchaseOrders,
    serviceRecipes,
    stock,
    vendorById,
    vendors,
} from "@/data/inventory";
import type { Forecast, Item, LocationId, PolishLine, StockLevel, User, Vendor, VendorId } from "@/data/types";
import { addDays, addMonths, daysBetween, formatDate, formatMonth, monthKey } from "@/engine/dates";
import {
    SEASONALITY_MIN_MONTHS,
    dataReadiness,
    demandMix,
    expectedUnits,
    mixShifts,
    pareto,
    reorderCalendar,
    seasonality,
    serviceCost,
    slowMovers,
    spendProjection,
    volumeByCycle,
} from "@/engine/insights";
import type { DemandRow, RecipeLine, ReorderEvent, ServiceRecipe } from "@/engine/insights";
import { formatCount, formatCurrency } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

// ------------------------------------------------------------------------------------ helpers

export type InsightsTab = "overview" | "products" | "colours" | "seasonality" | "profitability" | "planning";

const TABS: { id: InsightsTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "products", label: "Products" },
    { id: "colours", label: "Colours" },
    { id: "seasonality", label: "Seasonality" },
    { id: "profitability", label: "Profitability" },
    { id: "planning", label: "Planning" },
];

/** Links to a tab of this screen. Clicks are caught by the screen so the tab switches in place. */
const tabHref = (tab: InsightsTab) => `${ROUTES.insights}?tab=${tab}`;

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longMonth = (cycle: string) => MONTH_LONG[Number(cycle.slice(5, 7)) - 1] ?? cycle;
const shortMonth = (cycle: string) => formatMonth(cycle).slice(0, 3);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const dateLabel = (iso: string) => formatDate(iso, iso.slice(0, 4) !== TODAY.slice(0, 4));
/** "A", "A and B", "A, B and C". */
const listOf = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The one vendor whose order-to-shelf time was measured from the 2026 order forms. */
const MEASURED_VENDOR: VendorId = "nail-supply-store";
const HORIZON_DAYS = 90;

const LINES: { id: PolishLine; label: string }[] = [
    { id: "opi", label: "OPI" },
    { id: "dazzle-dry", label: "Dazzle Dry" },
    { id: "opi-dip", label: "OPI dip" },
    { id: "dnd", label: "DND" },
    { id: "chisel", label: "Chisel" },
];
const lineLabel = (line: PolishLine) => LINES.find((l) => l.id === line)?.label ?? line;

const orderNow = (e: ReorderEvent) => !e.orderBy || e.orderBy <= TODAY;

// ------------------------------------------------------------------------------------ model (everything derived from the data layer, per location)

const buildModel = (loc: LocationId) => {
    const all = forecasts.filter((f) => f.locationId === loc);
    const withUsage = all.filter((f) => f.confidence !== "none" && f.monthlyUsage > 0);
    const noUsage = all.filter((f) => !(f.confidence !== "none" && f.monthlyUsage > 0));
    const levels = stock.filter((s) => s.locationId === loc);
    const supplyLevels = levels.filter((s) => getItem(s.itemId)?.kind === "supply");
    const polishLevels = levels.filter((s) => getItem(s.itemId)?.kind === "polish");

    // No supply order history of its own: the data layer borrows Lynnfield's usage for this location.
    const estimated = withUsage.length > 0 && demandFor(loc, "supply").length === 0;

    const concentration = pareto(
        withUsage.map((f) => {
            const item = getItem(f.itemId);
            return { itemId: f.itemId, name: item?.name ?? f.itemId, value: f.monthlyUsage * (item?.unitCost ?? 0) };
        }),
    );

    const quoted = reorderCalendar(all, items, vendors, TODAY, { horizonDays: HORIZON_DAYS });
    const measuredRaw =
        measuredCycleDays === undefined
            ? quoted
            : reorderCalendar(all, items, vendors, TODAY, { horizonDays: HORIZON_DAYS, leadTimeOverrideDays: measuredCycleDays });
    const measuredById = new Map(measuredRaw.map((e) => [e.itemId, e]));
    // The measured cycle belongs to one vendor, so only that vendor's items move. The rest keep their quoted lead time.
    const measured = quoted.map((e) => (e.vendorId === MEASURED_VENDOR ? (measuredById.get(e.itemId) ?? e) : e));
    const eventById = new Map(reorderCalendar(all, items, vendors, TODAY, { horizonDays: 36_500 }).map((e) => [e.itemId, e]));

    const cycles = orderCycles(loc);
    const polishCycles = orderCycles(loc, "polish");
    const polishDemand = demandFor(loc, "polish");
    const slow = slowMovers(levels, items, polishDemand, polishCycles, { kind: "polish", minOnHand: 2 });

    return {
        loc,
        all,
        withUsage,
        noUsage,
        estimated,
        supplyLevels,
        polishLevels,
        sampleOnHand: supplyLevels.filter((s) => s.isSample).length,
        concentration,
        quoted,
        measured,
        eventById,
        cycles,
        polishCycles,
        polishDemand,
        slow,
        season: seasonality(volumeByCycle(purchaseOrders, undefined, loc).map((v) => ({ month: v.cycle, qty: v.qty }))),
        readiness: dataReadiness({
            purchaseOrders: purchaseOrders.filter((po) => po.locationId === loc),
            stock: levels,
            items,
            today: TODAY,
            hasServiceCounts: false,
        }),
    };
};
type Model = ReturnType<typeof buildModel>;

const modelCache = new Map<LocationId, Model>();
const modelFor = (loc: LocationId) => {
    const hit = modelCache.get(loc);
    if (hit) return hit;
    const model = buildModel(loc);
    modelCache.set(loc, model);
    return model;
};

const swatchCache = new Map<PolishLine, Record<string, string>>();
/** Representative colour per family, averaged from every colour of the line in the catalogue. */
const swatchesFor = (line: PolishLine) => {
    const hit = swatchCache.get(line);
    if (hit) return hit;
    const swatches = familySwatches(items.filter((i) => i.line === line));
    swatchCache.set(line, swatches);
    return swatches;
};

/** Colour-family mix for one polish line, over the cycles in which that line was ordered. */
const lineMix = (model: Model, line: PolishLine) => {
    const rows = model.polishDemand.filter((r) => r.line === line);
    const cycles = model.polishCycles.filter((c) => rows.some((r) => (r.byCycle[c] ?? 0) > 0));
    const mix = demandMix(rows, cycles, (r) => r.family);
    const swatches = swatchesFor(line);
    const shifts = mixShifts(mix, cycles);
    return { rows, cycles, mix, swatches, shifts, familyShifts: shifts.filter((s) => swatches[s.group]) };
};

const mainLine = (model: Model): PolishLine | undefined =>
    LINES.map((l) => ({ id: l.id, count: model.polishDemand.filter((r) => r.line === l.id).length }))
        .filter((l) => l.count > 0)
        .sort((a, b) => b.count - a.count)[0]?.id;

// ------------------------------------------------------------------------------------ shared pieces

const SectionHeading = ({ title, description, aside }: { title: string; description?: ReactNode; aside?: ReactNode }) => (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {description && <p className="text-sm text-pretty text-tertiary">{description}</p>}
        </div>
        {aside && <div className="flex flex-wrap items-center gap-1.5">{aside}</div>}
    </div>
);

const NoData = ({ children }: { children: ReactNode }) => (
    <p className="rounded-lg bg-secondary px-4 py-6 text-center text-sm text-pretty text-tertiary ring-1 ring-secondary ring-inset">{children}</p>
);

const Callout = ({ tone = "info", title, children }: { tone?: "info" | "warning"; title: string; children: ReactNode }) => (
    <div
        role="note"
        className={cx(
            "flex gap-3 rounded-xl p-4 ring-1 ring-inset",
            tone === "warning" ? "bg-utility-yellow-50 ring-utility-yellow-200" : "bg-brand-50 ring-brand_alt",
        )}
    >
        {tone === "warning" ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-fg-warning-primary" aria-hidden="true" />
        ) : (
            <InfoCircle className="mt-0.5 size-5 shrink-0 text-fg-brand-primary" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-semibold text-primary">{title}</p>
            <div className="text-sm text-pretty text-secondary">{children}</div>
        </div>
    </div>
);

const FilterChip = ({ selected, onPress, count, children }: { selected: boolean; onPress: () => void; count?: number; children: ReactNode }) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onPress}
        className={cx(
            "flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9",
            selected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
        )}
    >
        {children}
        {count !== undefined && (
            <span className={cx("font-medium tabular-nums", selected ? "text-brand-secondary" : "text-quaternary")}>{count.toLocaleString("en-US")}</span>
        )}
    </button>
);

/** One row of chips that scrolls sideways on a phone and wraps on desktop. */
const ChipRow = ({ label, children }: { label: string; children: ReactNode }) => (
    <div
        role="group"
        aria-label={label}
        className="-mx-4 scrollbar-hide flex gap-2 overflow-x-auto px-4 py-0.5 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
        {children}
    </div>
);

const ChartLegend = ({ items: entries }: { items: { name: string; className: string; dashed?: boolean }[] }) => (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {entries.map((entry) => (
            <li key={entry.name} className="flex items-center gap-2 text-sm text-tertiary">
                {entry.dashed ? (
                    <span aria-hidden="true" className={cx("block h-0 w-4 border-t-2 border-dashed border-current", entry.className)} />
                ) : (
                    <span aria-hidden="true" className={cx("block size-2 rounded-full bg-current", entry.className)} />
                )}
                {entry.name}
            </li>
        ))}
    </ul>
);

const fieldClass =
    "min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm text-primary tabular-nums shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-brand lg:min-h-9";

/** A small numeric field for inline edits. Keeps what was typed (so "4." survives) and reports the parsed number. */
const NumberField = ({
    label,
    value,
    onChange,
    prefix,
    suffix,
    step = "any",
    className,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    prefix?: string;
    suffix?: string;
    step?: number | "any";
    className?: string;
}) => {
    const [text, setText] = useState(String(value));
    const shown = Number(text) === value ? text : String(value);
    return (
        <span className={cx("relative block", className)}>
            {prefix && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-tertiary">
                    {prefix}
                </span>
            )}
            <input
                type="number"
                inputMode="decimal"
                min={0}
                step={step}
                aria-label={label}
                value={shown}
                onChange={(e) => {
                    setText(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0) onChange(n);
                }}
                className={cx(fieldClass, prefix && "pl-6", suffix && "pr-8")}
            />
            {suffix && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-tertiary">
                    {suffix}
                </span>
            )}
        </span>
    );
};

const Field = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
    <label className={cx("flex min-w-0 flex-col gap-1.5", className)}>
        <span className="text-sm font-medium text-secondary">{label}</span>
        {children}
    </label>
);

interface TabProps {
    model: Model;
}

// ------------------------------------------------------------------------------------ overview

const OverviewTab = ({ model }: TabProps) => {
    const place = locationName(model.loc);
    const top = model.polishDemand[0];
    const line = mainLine(model);
    const mix = line ? lineMix(model, line) : undefined;
    const shift = mix?.familyShifts[0] ?? mix?.shifts[0];
    const firstCycle = mix?.cycles[0];
    const lastCycle = mix?.cycles[mix.cycles.length - 1];
    const neverOrdered = model.slow.filter((s) => s.reason === "never-ordered").length;
    const slowBottles = sum(model.slow.map((s) => s.onHand));
    const due = model.quoted.filter((e) => e.due);
    const nowQuoted = model.quoted.filter(orderNow).length;
    const nowMeasured = model.measured.filter(orderNow).length;
    const { concentration } = model;

    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <section className="flex flex-col gap-4">
                <SectionHeading
                    title="What stands out"
                    description={
                        model.cycles.length < 2
                            ? `What can and cannot be said about ${place} yet. Each card says where its numbers come from and links to the detail.`
                            : `Six findings for ${place}, strongest first. Each one says where its numbers come from and links to the detail.`
                    }
                />
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                    <InsightCard
                        metric="Most reordered colour"
                        provenance="real"
                        title={
                            top && model.polishCycles.length >= 2
                                ? `${top.name} is the most reordered colour: ${plural(top.qty, "bottle")} across ${plural(top.cycles, "order cycle")}`
                                : top
                                  ? `${plural(model.polishDemand.length, "colour was", "colours were")} ordered at ${place}, in one order cycle: too few to rank`
                                  : `No colour orders are on file for ${place}`
                        }
                        why={
                            top && model.polishCycles.length >= 2
                                ? `${plural(model.polishDemand.length, "colour was", "colours were")} reordered in 2026, out of ${plural(model.polishLevels.length, "colour")} stocked. Colours that come back every cycle are the ones to hold deeper stock of.`
                                : "A ranking needs at least two order cycles. It fills in as colour orders are saved in the app."
                        }
                        action={{ label: "See demand per colour", href: tabHref("colours") }}
                    />

                    <InsightCard
                        metric="Colour mix"
                        provenance="real"
                        title={
                            shift && line && firstCycle && lastCycle
                                ? `${shift.group} went from ${pct(shift.from)} of the ${longMonth(firstCycle)} ${lineLabel(line)} order to ${pct(shift.to)} of ${longMonth(lastCycle)}'s`
                                : "There is no change in colour mix to report yet"
                        }
                        why={
                            shift && mix
                                ? `An early signal from ${plural(mix.cycles.length, "order cycle")}, not a proven season. If next summer's order shows it again, stock ${shift.group.toLowerCase()} deeper ahead of it.`
                                : "Comparing the mix needs colour orders from at least two cycles at this location."
                        }
                        action={{ label: "See the mix by cycle", href: tabHref("colours") }}
                    />

                    <InsightCard
                        metric="Colours not reordered"
                        provenance="real"
                        title={
                            model.slow.length
                                ? `${plural(model.slow.length, "stocked colour was", "stocked colours were")} left off the last two orders: ${plural(slowBottles, "bottle")} on the shelf`
                                : model.polishLevels.length
                                  ? "Every stocked colour with two or more bottles was on a recent order"
                                  : `No polish stock is on file for ${place}, so slow colours cannot be listed`
                        }
                        why={
                            model.slow.length
                                ? `${neverOrdered} of them were not ordered at all in 2026. They are candidates to review or retire, not waste: some will be seasonal shades waiting for their months.`
                                : model.polishLevels.length
                                  ? undefined
                                  : "The polish sheets cover Lynnfield only. This appears once Newburyport's colours are counted in the app."
                        }
                        action={{ label: "Review the list", href: tabHref("colours") }}
                    />

                    <InsightCard
                        metric="Spend concentration"
                        provenance={model.estimated ? "sample" : "mixed"}
                        sampleLabel={model.estimated ? "Estimated from Lynnfield, sample costs" : "Sample costs"}
                        title={
                            concentration.points.length
                                ? `${concentration.itemsFor80} of ${plural(concentration.points.length, "supply", "supplies")} make up 80% of projected spend, at sample costs`
                                : "No supply has a usage estimate yet, so spend cannot be ranked"
                        }
                        why={
                            concentration.points.length
                                ? `Get invoice costs for these ${concentration.itemsFor80} first and count them most often. Usage comes from ${model.estimated ? "Lynnfield's order forms" : "your order forms"}; the costs are placeholders, so the ranking will move.`
                                : undefined
                        }
                        action={{ label: "See forecast per product", href: tabHref("products") }}
                    />

                    <InsightCard
                        metric="Reorder points"
                        provenance={model.estimated ? "sample" : "mixed"}
                        sampleLabel={model.estimated ? "Estimated from Lynnfield" : "Sample on-hand"}
                        tone={due.length ? "warning" : "neutral"}
                        title={
                            due.length
                                ? `${plural(due.length, "supply shows", "supplies show")} at or past the reorder point, on sample on-hand numbers`
                                : "No supply with a usage estimate is at its reorder point"
                        }
                        why={
                            due.length
                                ? `${nowQuoted ? `${nowQuoted} of them ${nowQuoted === 1 ? "needs" : "need"} ordering today to arrive before the shelf is empty` : "None of them runs out before an order placed later this month would arrive"}. ${model.sampleOnHand} of ${model.supplyLevels.length} on-hand numbers are sample values until the first count, so treat the list as a shape, not a pick list.`
                                : undefined
                        }
                        action={{ label: "See the 90-day plan", href: tabHref("planning") }}
                    />

                    <InsightCard
                        metric="Order cycle"
                        provenance="mixed"
                        sampleLabel="Sample on-hand"
                        tone="warning"
                        title={
                            measuredCycleDays !== undefined
                                ? `Orders took about ${measuredCycleDays} days from order form to shelf, so plan about ${Math.round(measuredCycleDays / 7)} weeks ahead`
                                : "No delivery dates are on file, so the order cycle cannot be measured"
                        }
                        why={
                            measuredCycleDays !== undefined
                                ? `Measured on ${vendorById(MEASURED_VENDOR).name} orders at Lynnfield in 2026. The forecast assumes ${vendorById(MEASURED_VENDOR).leadTimeDays} days. ${
                                      nowMeasured === nowQuoted
                                          ? nowMeasured === 0
                                              ? `At ${place} nothing has to be ordered today under either figure, on the sample on-hand numbers.`
                                              : `At ${place} the same ${plural(nowMeasured, "supply needs", "supplies need")} ordering today under either figure.`
                                          : `Planned with the measured wait, ${plural(nowMeasured, "supply needs", "supplies need")} ordering today at ${place} instead of ${nowQuoted}.`
                                  }`
                                : undefined
                        }
                        action={{ label: "Plan with the measured cycle", href: tabHref("planning") }}
                    />
                </div>
            </section>

            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="What these insights rest on"
                    description="Five data sources feed this screen. Where one is missing, the tab that needs it says so instead of showing a number."
                />
                <DataReadiness sources={model.readiness} />
                {model.sampleOnHand > 0 && model.readiness.find((r) => r.id === "counts")?.ready && (
                    <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-pretty text-tertiary ring-1 ring-secondary ring-inset">
                        <span className="font-semibold text-secondary">Counts have only just started. </span>
                        {model.sampleOnHand} of {model.supplyLevels.length} supply on-hand numbers at {place} are still sample values, so days of cover and
                        reorder dates on this screen are marked “Sample on-hand” until a full count is logged.
                    </p>
                )}
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ products

interface ProductRow {
    item: Item;
    f: Forecast;
    vendor: Vendor;
    level?: StockLevel;
    event?: ReorderEvent;
    spend: number;
    orderSoon: boolean;
}

type SortKey = "item" | "usage" | "on-hand" | "cover" | "rop" | "reorder" | "suggested" | "confidence";

const CONFIDENCE_RANK: Record<Forecast["confidence"], number> = { high: 3, medium: 2, low: 1, none: 0 };

const sortValue = (r: ProductRow, key: SortKey): number | string => {
    switch (key) {
        case "item":
            return r.item.name.toLowerCase();
        case "usage":
            return r.f.monthlyUsage;
        case "on-hand":
            return r.f.onHand;
        case "cover":
            return r.f.daysOfCover ?? Number.MAX_SAFE_INTEGER;
        case "rop":
            return r.f.reorderPoint;
        case "reorder":
            return r.event?.reorderOn ?? "9999";
        case "suggested":
            return r.f.suggestedOrderQty;
        case "confidence":
            return CONFIDENCE_RANK[r.f.confidence];
    }
};

const SORT_OPTIONS: { value: string; label: string }[] = [
    { value: "usage:descending", label: "Monthly usage, highest first" },
    { value: "reorder:ascending", label: "Next reorder date, soonest first" },
    { value: "cover:ascending", label: "Days of cover, shortest first" },
    { value: "suggested:descending", label: "Suggested order, largest first" },
    { value: "confidence:descending", label: "Confidence, highest first" },
    { value: "item:ascending", label: "Name, A to Z" },
];

const coverText = (f: Forecast) =>
    f.daysOfCover === undefined ? "–" : f.daysOfCover === 0 ? "None" : f.daysOfCover > 365 ? "Over a year" : plural(f.daysOfCover, "day");

/** Exact date when it is close, month and year when it is far enough out that the day is false precision. */
const compactDate = (iso: string) => (daysBetween(TODAY, iso) > 120 ? formatMonth(iso) : dateLabel(iso));

const reorderText = (r: ProductRow) => {
    if (!r.event) return { main: "–", sub: undefined, due: false };
    const sub = r.event.orderBy ? (orderNow(r.event) ? "order today" : `order by ${compactDate(r.event.orderBy)}`) : undefined;
    return { main: r.event.due ? "At reorder point" : compactDate(r.event.reorderOn), sub, due: r.event.due };
};

const ParetoCard = ({ model }: TabProps) => {
    const isDesktop = useBreakpoint("lg");
    const { points, itemsFor80, total } = model.concentration;
    if (!points.length) return null;
    const data = points.map((p, i) => ({
        rank: i + 1,
        name: p.name,
        top: i < itemsFor80 ? Math.round(p.value * 100) / 100 : undefined,
        rest: i >= itemsFor80 ? Math.round(p.value * 100) / 100 : undefined,
        cumulative: Math.round(p.cumulative * 1000) / 10,
    }));
    const lead = points.slice(0, 5);

    return (
        <InsightCard
            metric="Spend concentration"
            provenance="mixed"
            sampleLabel="Sample costs"
            title={`${itemsFor80} of ${plural(points.length, "supply", "supplies")} make up 80% of projected spend, at sample costs`}
            why={`Projected spend is forecast monthly usage multiplied by unit cost, about ${formatCurrency(total)} a month across the ${points.length} supplies with a usage estimate. The costs are placeholders, so read the shape, not the dollars.`}
            footnote="Bars are each supply's projected monthly spend, ranked. The line is the running share of the total; the dashed lines mark where it crosses 80%."
        >
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
                <div className="flex min-w-0 flex-col gap-3">
                    <ChartLegend
                        items={[
                            { name: `The ${itemsFor80} that make up 80%`, className: "text-utility-brand-600" },
                            { name: "The rest", className: "text-utility-brand-300" },
                            { name: "Running share of spend", className: "text-utility-neutral-500", dashed: true },
                        ]}
                    />
                    <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={isDesktop ? 220 : 200}>
                        <ComposedChart
                            data={data}
                            className="text-tertiary [&_.recharts-text]:text-xs"
                            margin={{ left: -8, right: -8, top: 8, bottom: 0 }}
                            barCategoryGap={1}
                        >
                            <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                            <XAxis
                                dataKey="rank"
                                fill="currentColor"
                                axisLine={false}
                                tickLine={false}
                                tickMargin={8}
                                ticks={[...new Set([1, itemsFor80, points.length])]}
                                tickFormatter={(value) => (Number(value) === 1 ? "Highest spend" : `No. ${value}`)}
                            />
                            <YAxis yAxisId="spend" fill="currentColor" axisLine={false} tickLine={false} width={44} tickFormatter={(value) => `$${value}`} />
                            <YAxis
                                yAxisId="share"
                                orientation="right"
                                domain={[0, 100]}
                                ticks={[0, 50, 80, 100]}
                                fill="currentColor"
                                axisLine={false}
                                tickLine={false}
                                width={44}
                                tickFormatter={(value) => `${value}%`}
                            />
                            <Tooltip
                                content={<ChartTooltipContent />}
                                labelFormatter={(label) => data[Number(label) - 1]?.name ?? String(label)}
                                formatter={(value, name) => (name === "Running share" ? `${Number(value)}%` : `${formatCurrency(Number(value), true)} a month`)}
                                cursor={{ className: "fill-utility-neutral-200/20" }}
                            />
                            <Bar
                                yAxisId="spend"
                                isAnimationActive={false}
                                dataKey="top"
                                name="Projected spend"
                                stackId="s"
                                className="text-utility-brand-600"
                                fill="currentColor"
                                radius={[2, 2, 0, 0]}
                            />
                            <Bar
                                yAxisId="spend"
                                isAnimationActive={false}
                                dataKey="rest"
                                name="Projected spend"
                                stackId="s"
                                className="text-utility-brand-300"
                                fill="currentColor"
                                radius={[2, 2, 0, 0]}
                            />
                            <ReferenceLine yAxisId="share" y={80} stroke="currentColor" strokeDasharray="4 4" className="text-utility-neutral-400" />
                            <ReferenceLine yAxisId="share" x={itemsFor80} stroke="currentColor" strokeDasharray="4 4" className="text-utility-neutral-400" />
                            <Line
                                yAxisId="share"
                                isAnimationActive={false}
                                dataKey="cumulative"
                                name="Running share"
                                type="monotone"
                                className="text-utility-neutral-500"
                                stroke="currentColor"
                                strokeWidth={2}
                                dot={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <h4 className="text-sm font-semibold text-primary">The five that cost most each month</h4>
                    <ol className="flex flex-col divide-y divide-border-secondary">
                        {lead.map((p, i) => (
                            <li key={p.itemId} className="flex items-baseline justify-between gap-3 py-2">
                                <a
                                    href={ROUTES.item(p.itemId)}
                                    className="min-w-0 rounded-xs text-sm font-medium text-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                >
                                    <span className="mr-1.5 text-tertiary tabular-nums">{i + 1}.</span>
                                    {p.name}
                                </a>
                                <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{formatCurrency(p.value, true)}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="text-xs text-tertiary">Dollars a month at sample unit costs.</p>
                </div>
            </div>
        </InsightCard>
    );
};

const ProductPanel = ({ row, onClose }: { row: ProductRow; onClose: () => void }) => {
    const { item, f, vendor, level, event } = row;
    const duringLead = round1(f.dailyUsage * vendor.leadTimeDays);
    const maths: { label: string; value: ReactNode; note?: string }[] = [
        { label: "Monthly usage", value: formatCount(f.monthlyUsage, item.unit), note: `About ${Math.round(f.dailyUsage * 100) / 100} a day` },
        {
            label: "Lead time",
            value: plural(vendor.leadTimeDays, "day"),
            note: vendor.leadTimeIsEstimate ? `${vendor.name}, assumed and not yet confirmed` : vendor.name,
        },
        { label: "Used while waiting for delivery", value: formatCount(duringLead, item.unit), note: "Daily usage multiplied by the lead time" },
        { label: "Safety stock", value: formatCount(f.safetyStock, item.unit), note: "A cushion for months that run above average" },
        { label: "Reorder point", value: formatCount(f.reorderPoint, item.unit), note: "Used while waiting plus safety stock, rounded up" },
        {
            label: "On hand",
            value: (
                <span className="inline-flex items-center gap-1.5">
                    {formatCount(f.onHand, item.unit)}
                    {(level?.isSample ?? true) && <SampleBadge />}
                </span>
            ),
            note:
                f.daysOfCover === undefined
                    ? undefined
                    : `${coverText(f)} of cover${f.projectedStockoutDate && f.daysOfCover <= 365 ? `, runs out about ${dateLabel(f.projectedStockoutDate)}` : ""}`,
        },
        {
            label: "Suggested order now",
            value: f.suggestedOrderQty > 0 ? formatCount(f.suggestedOrderQty, item.unit) : "Nothing yet",
            note: event ? (event.due ? "Stock is at or below the reorder point" : `Reaches the reorder point about ${dateLabel(event.reorderOn)}`) : undefined,
        },
    ];

    return (
        <>
            <SlideoutMenu.Header onClose={onClose} className="flex flex-col gap-3">
                <div className="flex items-start gap-3 pr-8">
                    <ItemThumb item={item} size="lg" />
                    <div className="min-w-0">
                        <h2 className="text-md font-semibold text-primary">{item.name}</h2>
                        <p className="text-sm text-tertiary">{[vendor.name, item.category].join(" · ")}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    <ConfidenceBadge confidence={f.confidence} />
                    <RealDataBadge />
                    {(level?.isSample ?? true) && <SampleBadge label="Sample on-hand" />}
                </div>
            </SlideoutMenu.Header>
            <SlideoutMenu.Content>
                <UsageChart forecast={f} unit={formatCount(2, item.unit).replace(/^2 ?/, "") || "units"} />

                <section className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold text-primary">How the forecast was worked out</h3>
                    <p className="rounded-lg bg-secondary px-3 py-2.5 text-sm text-pretty text-secondary ring-1 ring-secondary ring-inset">{f.explanation}</p>
                </section>

                <section className="flex flex-col gap-1.5 pb-6">
                    <h3 className="text-sm font-semibold text-primary">The reorder maths</h3>
                    <dl className="flex flex-col divide-y divide-border-secondary">
                        {maths.map((m) => (
                            <div key={m.label} className="flex items-start justify-between gap-4 py-2.5">
                                <dt className="min-w-0">
                                    <span className="block text-sm text-secondary">{m.label}</span>
                                    {m.note && <span className="block text-xs text-pretty text-tertiary">{m.note}</span>}
                                </dt>
                                <dd className="shrink-0 text-sm font-semibold text-primary tabular-nums">{m.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            </SlideoutMenu.Content>
            <SlideoutMenu.Footer className="flex flex-wrap justify-end gap-3">
                <Button color="secondary" size="md" href={ROUTES.newOrder}>
                    Build the next order
                </Button>
                <Button color="primary" size="md" href={ROUTES.item(item.id)} iconTrailing={ArrowUpRight}>
                    Open item
                </Button>
            </SlideoutMenu.Footer>
        </>
    );
};

const NO_USAGE_REASONS: { id: string; label: string; next: string; match: (level?: StockLevel) => boolean }[] = [
    {
        id: "fill",
        label: "Tracked by fill level",
        next: "Tubs, bags and gallons are checked by eye and reordered at half full. A usage rate needs a count of containers opened.",
        match: (l) => Boolean(l?.fillLevel),
    },
    {
        id: "paused",
        label: "Reorder paused",
        next: "Left out on purpose. Turn reordering back on from the item page to start forecasting.",
        match: (l) => l?.parRule === "paused",
    },
    {
        id: "par",
        label: "Not on any 2026 order form, but has a par level",
        next: "Reordered by par for now. One count or one order in the app gives the first usage reading.",
        match: (l) => l?.par !== undefined,
    },
    {
        id: "nothing",
        label: "Not on any 2026 order form and no par level",
        next: "The app cannot tell when these are low. Set a par level on the stock screen.",
        match: () => true,
    },
];

const ProductsTab = ({ model }: TabProps) => {
    const isDesktop = useBreakpoint("lg");
    const [query, setQuery] = useState("");
    const [confidence, setConfidence] = useState<"all" | Forecast["confidence"]>("all");
    const [vendor, setVendor] = useState("all");
    const [category, setCategory] = useState("all");
    const [soonOnly, setSoonOnly] = useState(false);
    const [sort, setSort] = useState<AriaSortDescriptor>({ column: "usage", direction: "descending" });
    const [selected, setSelected] = useState<string>();
    const [gapsOpen, setGapsOpen] = useState(false);

    const soonLimit = addDays(TODAY, 30);
    const rows: ProductRow[] = model.withUsage.map((f) => {
        const item = getItem(f.itemId) as Item;
        const event = model.eventById.get(f.itemId);
        return {
            item,
            f,
            vendor: vendorById(item.vendorId),
            level: getStock(f.itemId, model.loc),
            event,
            spend: f.monthlyUsage * (item.unitCost ?? 0),
            orderSoon: Boolean(event?.orderBy && event.orderBy <= soonLimit),
        };
    });
    const vendorOptions = [...new Map(rows.map((r) => [r.vendor.id, r.vendor.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const categories = [...new Set(rows.map((r) => r.item.category))].sort();
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
        (r) =>
            (confidence === "all" || r.f.confidence === confidence) &&
            (vendor === "all" || r.vendor.id === vendor) &&
            (category === "all" || r.item.category === category) &&
            (!soonOnly || r.orderSoon) &&
            (!q || r.item.name.toLowerCase().includes(q) || (r.item.brand ?? "").toLowerCase().includes(q)),
    );
    const key = (sort.column ?? "usage") as SortKey;
    const dir = sort.direction === "ascending" ? 1 : -1;
    const sorted = [...filtered].sort((a, b) => {
        const [x, y] = [sortValue(a, key), sortValue(b, key)];
        const cmp = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y)) : x - y;
        return cmp * dir || a.item.name.localeCompare(b.item.name);
    });
    const selectedRow = rows.find((r) => r.item.id === selected);
    const anySample = rows.some((r) => r.level?.isSample ?? true);
    const controlSize = isDesktop ? "sm" : "md";
    const clear = () => {
        setQuery("");
        setConfidence("all");
        setVendor("all");
        setCategory("all");
        setSoonOnly(false);
    };

    const confidenceChips: { id: "all" | Forecast["confidence"]; label: string }[] = [
        { id: "all", label: "All" },
        { id: "high", label: "High confidence" },
        { id: "medium", label: "Medium" },
        { id: "low", label: "Low" },
    ];

    const gaps = NO_USAGE_REASONS.map((reason) => ({ ...reason, count: 0 }));
    for (const f of model.noUsage) {
        const level = getStock(f.itemId, model.loc);
        const hit = gaps.find((g) => g.match(level));
        if (hit) hit.count += 1;
    }

    if (!rows.length) {
        return (
            <NoData>
                No supply at {locationName(model.loc)} has a usage estimate yet. Estimates appear after an item has been on at least one order form or has been
                counted twice.
            </NoData>
        );
    }

    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <ParetoCard model={model} />

            <section className="flex flex-col gap-4">
                <SectionHeading
                    title="Forecast per product"
                    description={
                        model.estimated
                            ? `${plural(rows.length, "supply has", "supplies have")} a usage estimate, borrowed from Lynnfield's order history until ${locationName(model.loc)} has its own. Every one is marked low confidence.`
                            : `${plural(rows.length, "supply has", "supplies have")} a usage estimate, worked out from what was received on the 2026 order forms.`
                    }
                    aside={
                        <>
                            {model.estimated ? <SampleBadge label="Estimated from Lynnfield" /> : <RealDataBadge />}
                            {anySample && <SampleBadge label="Sample on-hand" />}
                        </>
                    }
                />

                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <ChipRow label="Filter by confidence">
                            {confidenceChips.map((c) => (
                                <FilterChip
                                    key={c.id}
                                    selected={confidence === c.id}
                                    count={c.id === "all" ? rows.length : rows.filter((r) => r.f.confidence === c.id).length}
                                    onPress={() => setConfidence(confidence === c.id ? "all" : c.id)}
                                >
                                    {c.label}
                                </FilterChip>
                            ))}
                        </ChipRow>
                        <Toggle
                            size="sm"
                            label="Needs ordering within 30 days"
                            className="min-h-11 shrink-0 items-center lg:min-h-0"
                            isSelected={soonOnly}
                            onChange={setSoonOnly}
                        />
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="lg:min-w-56 lg:flex-1">
                            <Input
                                size={controlSize}
                                icon={SearchLg}
                                aria-label="Search products"
                                placeholder="Search by name or brand"
                                value={query}
                                onChange={setQuery}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:flex lg:items-center">
                            <NativeSelect
                                selectClassName="w-full min-w-0 truncate"
                                aria-label="Vendor"
                                size={controlSize}
                                className="lg:w-44"
                                value={vendor}
                                onChange={(e) => setVendor(e.target.value)}
                                options={[{ label: "All vendors", value: "all" }, ...vendorOptions.map(([value, label]) => ({ label, value }))]}
                            />
                            <NativeSelect
                                selectClassName="w-full min-w-0 truncate"
                                aria-label="Category"
                                size={controlSize}
                                className="lg:w-48"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                options={[{ label: "All categories", value: "all" }, ...categories.map((c) => ({ label: c, value: c }))]}
                            />
                            {!isDesktop && (
                                <NativeSelect
                                    selectClassName="w-full min-w-0 truncate"
                                    aria-label="Sort"
                                    size={controlSize}
                                    className="col-span-2"
                                    value={`${String(sort.column)}:${sort.direction}`}
                                    onChange={(e) => {
                                        const [column, direction] = e.target.value.split(":");
                                        setSort({ column: column ?? "usage", direction: direction === "ascending" ? "ascending" : "descending" });
                                    }}
                                    options={SORT_OPTIONS}
                                />
                            )}
                        </div>
                    </div>
                    <p className="text-sm text-tertiary" aria-live="polite">
                        {filtered.length === rows.length
                            ? `${plural(rows.length, "supply", "supplies")} with a usage estimate`
                            : `${filtered.length} of ${plural(rows.length, "supply", "supplies")}`}
                        {soonOnly && " that need ordering within 30 days"}
                        {isDesktop && ". Select a row to see the chart and the reorder maths."}
                    </p>
                </div>

                {sorted.length === 0 ? (
                    <Card className="flex flex-col items-center gap-3 py-10 text-center">
                        <p className="text-md font-semibold text-primary">No products match</p>
                        <p className="max-w-sm text-sm text-tertiary">Nothing with a usage estimate fits this search and these filters.</p>
                        <Button color="secondary" size="md" onClick={clear}>
                            Clear search and filters
                        </Button>
                    </Card>
                ) : isDesktop ? (
                    <TableCard.Root size="sm">
                        <Table
                            aria-label={`Forecast per product at ${locationName(model.loc)}`}
                            sortDescriptor={sort}
                            onSortChange={setSort}
                            onRowAction={(id) => setSelected(String(id))}
                        >
                            <Table.Header>
                                <Table.Head id="item" label="Item" isRowHeader allowsSorting className="w-full" />
                                <Table.Head id="usage" label="A month" allowsSorting className="px-2.5" />
                                <Table.Head id="trend" label="Trend" className="px-2.5" />
                                <Table.Head id="on-hand" label="On hand" allowsSorting className="px-2.5" />
                                <Table.Head
                                    id="cover"
                                    label="Cover"
                                    allowsSorting
                                    className="px-2.5"
                                    tooltip="How long the stock on the shelf should last at the forecast usage rate."
                                />
                                <Table.Head id="rop" label="Reorder at" allowsSorting className="px-2.5" />
                                <Table.Head id="reorder" label="Next reorder" allowsSorting className="px-2.5" />
                                <Table.Head
                                    id="suggested"
                                    label="Order"
                                    allowsSorting
                                    className="px-2.5"
                                    tooltip="The quantity the reorder rule suggests ordering today."
                                />
                                <Table.Head id="confidence" label="Confidence" allowsSorting className="pr-5 pl-2.5" />
                            </Table.Header>
                            <Table.Body>
                                {sorted.map((r) => {
                                    const next = reorderText(r);
                                    return (
                                        <Table.Row key={r.item.id} id={r.item.id} className={cx("cursor-pointer", selected === r.item.id && "bg-secondary")}>
                                            <Table.Cell className="min-w-60 py-2.5 pr-3">
                                                <div className="flex items-center gap-3">
                                                    <ItemThumb item={r.item} />
                                                    <div className="min-w-0">
                                                        <p className="line-clamp-2 text-sm font-medium text-primary">{r.item.name}</p>
                                                        <p className="line-clamp-1 text-xs text-tertiary">{r.vendor.name}</p>
                                                    </div>
                                                </div>
                                            </Table.Cell>
                                            <Table.Cell className="px-2.5 text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
                                                {formatCount(r.f.monthlyUsage, r.item.unit)}
                                            </Table.Cell>
                                            <Table.Cell className="px-2.5">
                                                <ForecastSparkline forecast={r.f} width={84} />
                                            </Table.Cell>
                                            <Table.Cell className="px-2.5 whitespace-nowrap text-secondary tabular-nums">{r.f.onHand}</Table.Cell>
                                            <Table.Cell
                                                className={cx(
                                                    "px-2.5 whitespace-nowrap tabular-nums",
                                                    (r.f.daysOfCover ?? Number.MAX_SAFE_INTEGER) <= r.vendor.leadTimeDays
                                                        ? "font-medium text-error-primary"
                                                        : "text-secondary",
                                                )}
                                            >
                                                {coverText(r.f)}
                                            </Table.Cell>
                                            <Table.Cell className="px-2.5 whitespace-nowrap text-secondary tabular-nums">{r.f.reorderPoint}</Table.Cell>
                                            <Table.Cell className="px-2.5 whitespace-nowrap">
                                                <p className={cx("text-sm font-medium", next.due ? "text-warning-primary" : "text-secondary")}>{next.main}</p>
                                                {next.sub && <p className="text-xs text-tertiary">{next.sub}</p>}
                                            </Table.Cell>
                                            <Table.Cell className="px-2.5 whitespace-nowrap tabular-nums">
                                                {r.f.suggestedOrderQty > 0 ? (
                                                    <span className="font-semibold text-primary">{r.f.suggestedOrderQty}</span>
                                                ) : (
                                                    <span className="text-quaternary">–</span>
                                                )}
                                            </Table.Cell>
                                            <Table.Cell className="pr-5 pl-2.5 whitespace-nowrap">
                                                <ConfidenceBadge confidence={r.f.confidence} />
                                            </Table.Cell>
                                        </Table.Row>
                                    );
                                })}
                            </Table.Body>
                        </Table>
                    </TableCard.Root>
                ) : (
                    <Card padded={false}>
                        <ul className="divide-y divide-secondary">
                            {sorted.map((r) => {
                                const next = reorderText(r);
                                return (
                                    <li key={r.item.id}>
                                        <a
                                            href={ROUTES.item(r.item.id)}
                                            className="flex gap-3 px-4 py-3.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2"
                                        >
                                            <ItemThumb item={r.item} />
                                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="line-clamp-2 text-sm font-semibold text-primary">{r.item.name}</p>
                                                        <p className="truncate text-xs text-tertiary">{r.vendor.name}</p>
                                                    </div>
                                                    <ForecastSparkline forecast={r.f} width={72} height={24} />
                                                </div>
                                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                                    <div>
                                                        <dt className="text-tertiary">Usage</dt>
                                                        <dd className="text-sm font-semibold text-primary tabular-nums">
                                                            {formatCount(r.f.monthlyUsage, r.item.unit)} a month
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-tertiary">On hand</dt>
                                                        <dd className="text-sm font-medium text-secondary tabular-nums">
                                                            {r.f.onHand}, reorder at {r.f.reorderPoint}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-tertiary">Cover</dt>
                                                        <dd className="text-sm font-medium text-secondary tabular-nums">{coverText(r.f)}</dd>
                                                    </div>
                                                    <div>
                                                        <dt className="text-tertiary">Next reorder</dt>
                                                        <dd className={cx("text-sm font-medium", next.due ? "text-warning-primary" : "text-secondary")}>
                                                            {next.main}
                                                        </dd>
                                                    </div>
                                                </dl>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <ConfidenceBadge confidence={r.f.confidence} />
                                                    {r.f.suggestedOrderQty > 0 && (
                                                        <Badge type="pill-color" size="sm" color="brand">
                                                            Order {formatCount(r.f.suggestedOrderQty, r.item.unit)}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    </Card>
                )}
            </section>

            <Card padded={false}>
                <button
                    type="button"
                    aria-expanded={gapsOpen}
                    onClick={() => setGapsOpen((v) => !v)}
                    className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-4 py-3 text-left outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-5"
                >
                    <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-md font-semibold text-primary">No usage estimate yet: {plural(model.noUsage.length, "supply", "supplies")}</span>
                        <span className="text-sm text-tertiary">Why they are missing from the table above, and what would add them.</span>
                    </span>
                    <ChevronDown
                        className={cx("size-5 shrink-0 text-fg-quaternary transition duration-100 ease-linear", gapsOpen && "rotate-180")}
                        aria-hidden="true"
                    />
                </button>
                {gapsOpen && (
                    <ul className="flex flex-col divide-y divide-border-secondary border-t border-secondary px-4 lg:px-5">
                        {gaps
                            .filter((g) => g.count > 0)
                            .map((g) => (
                                <li key={g.id} className="flex items-start justify-between gap-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-secondary">{g.label}</p>
                                        <p className="text-sm text-pretty text-tertiary">{g.next}</p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{g.count}</span>
                                </li>
                            ))}
                        <li className="py-3">
                            <Button color="link-color" size="md" href={ROUTES.stock} iconTrailing={ArrowUpRight}>
                                Set par levels on the stock screen
                            </Button>
                        </li>
                    </ul>
                )}
            </Card>

            <SlideoutMenu isOpen={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelected(undefined)} isDismissable>
                {selectedRow && <ProductPanel row={selectedRow} onClose={() => setSelected(undefined)} />}
            </SlideoutMenu>
        </div>
    );
};

// ------------------------------------------------------------------------------------ colours

type SlowFilter = "all" | "never-ordered" | "not-ordered-recently";

const CycleBars = ({ row, cycles, max }: { row: DemandRow; cycles: string[]; max: number }) => (
    <div role="img" aria-label={cycles.map((c) => `${shortMonth(c)} ${row.byCycle[c] ?? 0}`).join(", ")} className="flex h-7 items-end gap-1">
        {cycles.map((c) => {
            const qty = row.byCycle[c] ?? 0;
            return (
                <span key={c} className="flex h-full w-3 items-end">
                    <span
                        className={cx("w-full rounded-t-xs", qty > 0 ? "bg-utility-brand-600" : "bg-utility-neutral-300")}
                        style={{ height: qty > 0 ? `${Math.max(18, (qty / max) * 100)}%` : "2px" }}
                    />
                </span>
            );
        })}
    </div>
);

const ColoursTab = ({ model }: TabProps) => {
    const isDesktop = useBreakpoint("lg");
    const slowPage = isDesktop ? 60 : 20;
    const place = locationName(model.loc);
    const counts = LINES.map((l) => ({ ...l, count: model.polishDemand.filter((r) => r.line === l.id).length }));
    const [line, setLine] = useState<PolishLine>(counts.find((c) => c.count > 0)?.id ?? "opi");
    const [query, setQuery] = useState("");
    const [visible, setVisible] = useState(12);
    const [slowFilter, setSlowFilter] = useState<SlowFilter>("all");
    const [slowExtra, setSlowExtra] = useState(0);
    const slowVisible = slowPage + slowExtra;

    const { rows, cycles, mix, swatches, shifts, familyShifts } = lineMix(model, line);
    const q = query.trim().toLowerCase();
    const matches = (name: string, code?: string) => !q || name.toLowerCase().includes(q) || (code ?? "").toLowerCase().includes(q);
    const ranked = rows.filter((r) => matches(r.name, r.colorCode));
    const maxCycleQty = Math.max(1, ...rows.flatMap((r) => cycles.map((c) => r.byCycle[c] ?? 0)));
    const namedGroups = mix.filter((g) => g.group !== "Ungrouped").length;
    const first = cycles[0];
    const last = cycles[cycles.length - 1];
    const up = familyShifts.find((s) => s.change > 0);
    const down = familyShifts.find((s) => s.change < 0);
    const codeGroup = mix.find((g) => !swatches[g.group] && g.group !== "Ungrouped")?.group;
    const noOrders = counts.filter((c) => c.count === 0).map((c) => c.label);

    const slowAll = model.slow;
    const slowLine = slowAll.filter((s) => getItem(s.itemId)?.line === line);
    const slowShown = slowLine.filter((s) => (slowFilter === "all" || s.reason === slowFilter) && matches(s.name, getItem(s.itemId)?.colorCode));
    const firstPolishCycle = model.polishCycles[0];

    const pick = (id: PolishLine) => {
        setLine(id);
        setVisible(12);
        setSlowExtra(0);
        setSlowFilter("all");
    };

    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <div className="flex flex-col gap-3">
                <ChipRow label="Polish line">
                    {counts.map((c) => (
                        <FilterChip key={c.id} selected={line === c.id} count={c.count} onPress={() => pick(c.id)}>
                            {c.label}
                        </FilterChip>
                    ))}
                </ChipRow>
                <p className="text-sm text-tertiary">
                    The number beside each line is how many of its colours were ordered at {place} in 2026.
                    {noOrders.length > 0 && ` ${listOf(noOrders)} ${noOrders.length === 1 ? "has" : "have"} no 2026 orders on file.`}
                </p>
                <div className="lg:max-w-sm">
                    <Input
                        size="md"
                        icon={SearchLg}
                        aria-label="Search colours"
                        placeholder="Search by colour name or code"
                        value={query}
                        onChange={setQuery}
                    />
                </div>
            </div>

            {rows.length === 0 ? (
                <Callout title={`${lineLabel(line)} has no 2026 orders on file at ${place}`}>
                    There is no demand to rank and no forecast per colour for this line. Its stocked colours still appear under “Not reordered” below, where
                    there is polish stock on file.
                </Callout>
            ) : (
                <>
                    <InsightCard
                        metric={`${lineLabel(line)} colour families by order cycle`}
                        provenance="real"
                        title={
                            cycles.length < 2
                                ? `${lineLabel(line)} colours were ordered in one cycle at ${place}, so there is no change in mix to read yet`
                                : namedGroups < 2
                                  ? `The sheet has no colour families for ${lineLabel(line)}, so its mix cannot be broken down`
                                  : up && first && last
                                    ? `${up.group} went from ${pct(up.from)} of the ${longMonth(first)} order to ${pct(up.to)} of ${longMonth(last)}'s`
                                    : shifts[0] && first && last
                                      ? `${shifts[0].group} moved from ${pct(shifts[0].from)} of the ${longMonth(first)} order to ${pct(shifts[0].to)} of ${longMonth(last)}'s`
                                      : `The ${lineLabel(line)} mix held steady from ${first ? longMonth(first) : "the first cycle"} to ${last ? longMonth(last) : "the last"}`
                        }
                        why={
                            cycles.length >= 2 && namedGroups >= 2
                                ? `${down && first && last ? `${down.group} fell from ${pct(down.from)} to ${pct(down.to)} over the same cycles. ` : ""}An early signal from ${plural(cycles.length, "order cycle")}, not a proven season: one large or small order moves these shares a lot.`
                                : cycles.length < 2
                                  ? "The mix below is that single order. A comparison appears after the next colour order is saved."
                                  : "Add a colour family to each colour on the polish sheet to see which families are growing."
                        }
                        footnote={
                            namedGroups >= 2
                                ? `Family colours are averaged from the catalogue's swatches.${codeGroup ? ` Grey segments are code groups from the sheet (for example “${codeGroup}”), which mix many shades.` : ""}`
                                : undefined
                        }
                    >
                        {namedGroups >= 2 ? (
                            <CycleMixChart mix={mix} cycles={cycles} colorOf={(group) => swatches[group]} unit={line === "opi-dip" ? "jars" : "bottles"} />
                        ) : (
                            <NoData>
                                {plural(sum(rows.map((r) => r.qty)), "bottle")} of {lineLabel(line)} ordered across {plural(cycles.length, "cycle")}, with no
                                family recorded.
                            </NoData>
                        )}
                    </InsightCard>

                    <Card className="flex flex-col gap-4">
                        <CardHeader
                            title="Most reordered colours"
                            description={`${plural(rows.length, "colour")} of ${lineLabel(line)} ordered in 2026, by bottles ordered. The forecast is bottles a month if the same pace continues.`}
                            actions={<RealDataBadge />}
                        />
                        {ranked.length === 0 ? (
                            <NoData>
                                No {lineLabel(line)} colour ordered in 2026 matches “{query}”.
                            </NoData>
                        ) : (
                            <>
                                <div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_5.5rem_11rem_11rem] items-end gap-4 border-b border-secondary pb-2 text-xs font-semibold text-quaternary lg:grid">
                                    <span>No.</span>
                                    <span>Colour</span>
                                    <span className="text-right">Ordered</span>
                                    <span>{cycles.map(shortMonth).join(" · ")}</span>
                                    <span>Forecast</span>
                                    <span>Deliveries</span>
                                </div>
                                <ol className="flex flex-col divide-y divide-border-secondary lg:-mt-4">
                                    {ranked.slice(0, visible).map((r) => {
                                        const forecast = model.loc === "lynnfield" ? getPolishForecast(r.itemId) : undefined;
                                        const item = getItem(r.itemId);
                                        const rank = rows.indexOf(r) + 1;
                                        return (
                                            <li
                                                key={r.itemId}
                                                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 lg:grid-cols-[2rem_minmax(0,1fr)_5rem_5.5rem_11rem_11rem] lg:gap-4"
                                            >
                                                <span className="hidden text-sm text-tertiary tabular-nums lg:block">{rank}</span>
                                                <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                                                    {item && <ItemThumb item={item} />}
                                                    <div className="min-w-0">
                                                        <a
                                                            href={ROUTES.item(r.itemId)}
                                                            className="line-clamp-1 rounded-xs text-sm font-medium text-primary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                                        >
                                                            {r.name}
                                                        </a>
                                                        <p className="text-xs text-tertiary">
                                                            {[r.colorCode, r.family].filter(Boolean).join(" · ") || "No code on the sheet"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-semibold text-primary tabular-nums">{r.qty}</p>
                                                    <p className="text-xs whitespace-nowrap text-tertiary">
                                                        {r.cycles} of {plural(cycles.length, "cycle")}
                                                    </p>
                                                </div>
                                                <CycleBars row={r} cycles={cycles} max={maxCycleQty} />
                                                <div className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 lg:col-span-1">
                                                    {forecast ? (
                                                        <>
                                                            <span className="text-sm font-medium text-secondary tabular-nums">
                                                                {forecast.monthlyUsage} a month
                                                            </span>
                                                            <ConfidenceBadge confidence={forecast.confidence} />
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-tertiary">No forecast: one order on file</span>
                                                    )}
                                                </div>
                                                <p className="col-span-3 text-xs text-tertiary lg:col-span-1">
                                                    {r.unfilled > 0 ? (
                                                        <span className="font-medium text-warning-primary">
                                                            {r.unfilled} of {r.qty} not logged as received
                                                        </span>
                                                    ) : (
                                                        "All received"
                                                    )}
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ol>
                                {ranked.length > visible && (
                                    <Button
                                        color="secondary"
                                        size="md"
                                        className="self-center max-lg:w-full"
                                        onClick={() => setVisible((v) => Math.min(v + 24, 84))}
                                    >
                                        Show more ({ranked.length - visible} left)
                                    </Button>
                                )}
                                <p className="text-xs text-pretty text-tertiary">
                                    “Not logged as received” means the vendor could not supply it or the delivery was never ticked off: the order forms cannot
                                    tell the two apart. Small bars are bottles ordered in {cycles.map(shortMonth).join(", ")}.
                                </p>
                            </>
                        )}
                    </Card>
                </>
            )}

            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="Not reordered"
                    description={
                        model.polishLevels.length === 0
                            ? `No polish stock is on file for ${place}.`
                            : slowAll.length === 0
                              ? "Every colour with two or more bottles on the shelf was on a recent order."
                              : `${plural(slowAll.length, "colour")} with two or more bottles on the shelf ${slowAll.length === 1 ? "was" : "were"} left off the last two colour orders: ${plural(sum(slowAll.map((s) => s.onHand)), "bottle")} in all. ${slowAll.filter((s) => s.reason === "never-ordered").length} were not ordered at all in 2026${firstPolishCycle ? `; the rest were last ordered in ${longMonth(firstPolishCycle)}` : ""}.`
                    }
                    actions={<RealDataBadge />}
                />
                {model.polishLevels.length === 0 ? (
                    <NoData>The polish sheets cover Lynnfield only. Slow colours appear here once {place}'s colours are counted in the app.</NoData>
                ) : slowLine.length === 0 ? (
                    <NoData>No {lineLabel(line)} colour has two or more bottles sitting without a recent order.</NoData>
                ) : (
                    <>
                        <p className="text-sm text-pretty text-secondary">
                            {plural(slowLine.length, "is", "are")} {lineLabel(line)}, holding {plural(sum(slowLine.map((s) => s.onHand)), "bottle")}. Treat this
                            as a list to review, not as waste: some are seasonal shades, some are client favourites that simply last. Retire the ones nobody
                            asks for and the shelf space goes to colours that move.
                        </p>
                        <ChipRow label="Filter colours not reordered">
                            {(
                                [
                                    { id: "all", label: "All" },
                                    { id: "never-ordered", label: "Not ordered in 2026" },
                                    {
                                        id: "not-ordered-recently",
                                        label: firstPolishCycle ? `Last ordered in ${longMonth(firstPolishCycle)}` : "Ordered earlier",
                                    },
                                ] as { id: SlowFilter; label: string }[]
                            ).map((c) => (
                                <FilterChip
                                    key={c.id}
                                    selected={slowFilter === c.id}
                                    count={c.id === "all" ? slowLine.length : slowLine.filter((s) => s.reason === c.id).length}
                                    onPress={() => {
                                        setSlowFilter(c.id);
                                        setSlowExtra(0);
                                    }}
                                >
                                    {c.label}
                                </FilterChip>
                            ))}
                        </ChipRow>
                        {slowShown.length === 0 ? (
                            <NoData>No colour in this list matches{q ? ` “${query}”` : " the filter"}.</NoData>
                        ) : (
                            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                                {slowShown.slice(0, slowVisible).map((s) => {
                                    const item = getItem(s.itemId);
                                    return (
                                        <li key={s.itemId}>
                                            <a
                                                href={ROUTES.item(s.itemId)}
                                                className="flex min-h-13 items-center gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2"
                                            >
                                                {item && <ItemThumb item={item} size="sm" />}
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium text-primary">{s.name}</span>
                                                    <span className="block truncate text-xs text-tertiary">
                                                        {[item?.colorCode, `${s.onHand} on hand`].filter(Boolean).join(" · ")}
                                                    </span>
                                                </span>
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {slowShown.length > slowVisible && (
                            <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={() => setSlowExtra((v) => v + 60)}>
                                Show more ({slowShown.length - slowVisible} left)
                            </Button>
                        )}
                        <p className="text-xs text-pretty text-tertiary">
                            Bottle counts come from the polish sheets. Swatch colours are approximations worked out from each colour's family, not the real
                            shade.
                        </p>
                    </>
                )}
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ seasonality

interface BusyPeriod {
    id: string;
    name: string;
    start: string;
    end: string;
    /** Expected lift in demand, percent. */
    lift: number;
    example?: boolean;
}

const EXAMPLE_PERIODS: BusyPeriod[] = [
    { id: "example-prom", name: "Example: prom and wedding season", start: "2027-05-01", end: "2027-06-30", lift: 20, example: true },
    { id: "example-holidays", name: "Example: winter holidays", start: "2026-12-07", end: "2026-12-31", lift: 15, example: true },
];

const VolumeChart = ({ loc, kind }: { loc: LocationId; kind: "supply" | "polish" }) => {
    const isDesktop = useBreakpoint("lg");
    // Imported order forms only: the order being built this month has no delivery to compare yet.
    const data = volumeByCycle(
        purchaseOrders.filter((po) => po.imported),
        kind,
        loc,
    ).map((v) => ({ ...v, name: shortMonth(v.cycle) }));
    if (!data.length) return <NoData>No {kind === "polish" ? "colour" : "supply"} order forms are on file for this location.</NoData>;
    return (
        <div className="flex flex-col gap-3">
            <ChartLegend
                items={[
                    { name: "Ordered", className: "text-utility-brand-600" },
                    { name: "Logged as received", className: "text-utility-brand-300" },
                ]}
            />
            <ResponsiveContainer initialDimension={{ width: 1, height: 1 }} width="100%" height={isDesktop ? 200 : 180}>
                <RechartsBarChart
                    data={data}
                    className="text-tertiary [&_.recharts-text]:text-xs"
                    margin={{ left: -18, right: 4, top: 8, bottom: 0 }}
                    barGap={2}
                >
                    <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-neutral-100" />
                    <XAxis dataKey="name" fill="currentColor" axisLine={false} tickLine={false} tickMargin={8} />
                    <YAxis fill="currentColor" axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                        content={<ChartTooltipContent />}
                        labelFormatter={(label) => `${label} order`}
                        formatter={(value) => `${Number(value)} units`}
                        cursor={{ className: "fill-utility-neutral-200/20" }}
                    />
                    <Bar
                        isAnimationActive={false}
                        dataKey="qty"
                        name="Ordered"
                        className="text-utility-brand-600"
                        fill="currentColor"
                        maxBarSize={28}
                        radius={[4, 4, 0, 0]}
                    />
                    <Bar
                        isAnimationActive={false}
                        dataKey="received"
                        name="Logged as received"
                        className="text-utility-brand-300"
                        fill="currentColor"
                        maxBarSize={28}
                        radius={[4, 4, 0, 0]}
                    />
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    );
};

const SeasonalityTab = ({ model }: TabProps) => {
    const place = locationName(model.loc);
    const { season } = model;
    const [kind, setKind] = useState<"supply" | "polish">("supply");
    const [periods, setPeriods] = useState<BusyPeriod[]>(EXAMPLE_PERIODS);
    const [selectedId, setSelectedId] = useState<string | undefined>(EXAMPLE_PERIODS[0]?.id);
    const [draft, setDraft] = useState({ name: "", start: "", end: "", lift: 15 });
    const [message, setMessage] = useState<string>();

    const firstMonth = model.cycles[0] ?? monthKey(TODAY);
    const strip = Array.from({ length: SEASONALITY_MIN_MONTHS }, (_, i) => monthKey(addMonths(`${firstMonth}-01`, i)));
    const covered = new Set(model.cycles);
    const line = mainLine(model);
    const mix = line ? lineMix(model, line) : undefined;
    const shifts = (mix?.familyShifts.length ? mix.familyShifts : (mix?.shifts ?? [])).slice(0, 4);
    const firstCycle = mix?.cycles[0];
    const lastCycle = mix?.cycles[mix.cycles.length - 1];
    const volumes = volumeByCycle(
        purchaseOrders.filter((po) => po.imported),
        kind,
        model.loc,
    );
    const biggest = [...volumes].sort((a, b) => b.qty - a.qty)[0];
    const unlogged = volumes.filter((v) => v.qty > 0 && v.received / v.qty < 0.5);

    const selected = periods.find((p) => p.id === selectedId) ?? periods[0];
    const topProducts = [...model.withUsage].sort((a, b) => b.monthlyUsage - a.monthlyUsage).slice(0, 6);
    const periodDays = selected ? Math.max(1, daysBetween(selected.start, selected.end) + 1) : 0;
    const orderBy = selected && measuredCycleDays !== undefined ? addDays(selected.start, -measuredCycleDays) : undefined;
    const draftError = !draft.name.trim()
        ? "Give the period a name."
        : !draft.start || !draft.end
          ? "Pick a start and an end date."
          : draft.end < draft.start
            ? "The end date is before the start date."
            : draft.lift <= 0 || draft.lift > 200
              ? "Expected lift should be between 1% and 200%."
              : undefined;

    const add = () => {
        if (draftError) {
            setMessage(draftError);
            return;
        }
        const period: BusyPeriod = {
            id: `period-${periods.length}-${draft.start}`,
            name: draft.name.trim(),
            start: draft.start,
            end: draft.end,
            lift: draft.lift,
        };
        setPeriods((list) => [...list, period]);
        setSelectedId(period.id);
        setDraft({ name: "", start: "", end: "", lift: 15 });
        setMessage(`Added “${period.name}”. The what-if below now uses it. Nothing is saved in the prototype.`);
    };

    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <Card className="flex flex-col gap-4">
                <CardHeader
                    title={
                        season.status === "ok"
                            ? "A full year of usage is on file"
                            : `Seasonality cannot be measured yet: ${season.monthsCovered} of ${SEASONALITY_MIN_MONTHS} months have order data`
                    }
                    description={
                        season.status === "ok"
                            ? "Seasonal indices are ready to calculate per product and colour."
                            : "A seasonal pattern needs every calendar month at least once. Read from a handful of order cycles it would be noise, so no seasonal index is shown here."
                    }
                    actions={<RealDataBadge />}
                />

                <div className="flex flex-col gap-2">
                    <ol
                        className="grid grid-cols-6 gap-1.5 sm:grid-cols-12"
                        aria-label={`${season.monthsCovered} of ${SEASONALITY_MIN_MONTHS} months have order data`}
                    >
                        {strip.map((m) => {
                            const has = covered.has(m);
                            const future = m > monthKey(TODAY);
                            return (
                                <li
                                    key={m}
                                    className={cx(
                                        "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-xs ring-1 ring-inset",
                                        has ? "bg-brand-primary_alt font-semibold text-brand-secondary ring-brand" : "bg-primary text-tertiary ring-secondary",
                                        !has && future && "border border-dashed border-secondary ring-0",
                                    )}
                                >
                                    <span>{shortMonth(m)}</span>
                                    <span className="text-[10px] font-medium">{has ? "Order" : future ? "Ahead" : "None"}</span>
                                </li>
                            );
                        })}
                    </ol>
                    <p className="text-xs text-tertiary">
                        The twelve months from {formatMonth(firstMonth)}, the first order cycle on file for {place}. Filled months have an order form.
                    </p>
                </div>

                {season.status === "insufficient" && (
                    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <li className="rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                            <p className="text-sm font-semibold text-primary">{plural(season.monthsNeeded, "month still has", "months still have")} no data</p>
                            <p className="text-sm text-pretty text-tertiary">
                                {season.readyFrom
                                    ? `A full year since the first order cycle is reached in ${formatMonth(season.readyFrom)}, the earliest a seasonal index could be worked out. Months with no order form stay blank unless a count is logged in them.`
                                    : "There is no order on file to start the clock."}
                            </p>
                        </li>
                        <li className="rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                            <p className="text-sm font-semibold text-primary">Counts make it far more reliable</p>
                            <p className="text-sm text-pretty text-tertiary">
                                Orders show when stock was bought, not when it was used. A count logged in the app each month turns every month into a usage
                                reading, with no gaps.
                            </p>
                        </li>
                        <li className="rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                            <p className="text-sm font-semibold text-primary">What it will show</p>
                            <p className="text-sm text-pretty text-tertiary">
                                For each product and colour family, which months run above or below an average month, so orders and forecasts follow the
                                calendar.
                            </p>
                        </li>
                    </ul>
                )}
            </Card>

            <section className="flex flex-col gap-4">
                <SectionHeading
                    title="What the 2026 cycles show so far"
                    description="Real numbers from the order forms. Each is an early signal: worth watching, not yet a pattern to plan a year around."
                />
                <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                    <InsightCard
                        metric="Order volume by cycle · Early signal"
                        provenance="real"
                        title={
                            biggest
                                ? `${longMonth(biggest.cycle)} was the largest ${kind === "polish" ? "colour" : "supply"} order of 2026 so far: ${plural(biggest.qty, "unit")} across ${plural(biggest.lines, "line")}`
                                : `No ${kind === "polish" ? "colour" : "supply"} order forms are on file for ${place}`
                        }
                        why={
                            biggest
                                ? `Order size reflects how long it had been since the last order as much as how busy the salon was, so it is not a seasonal index.${unlogged.length ? ` ${unlogged.map((v) => longMonth(v.cycle)).join(" and ")} ${unlogged.length === 1 ? "has" : "have"} most lines not yet logged as received.` : ""}`
                                : undefined
                        }
                        footnote="Quantity ordered against quantity logged as received, per order cycle. Units are mixed: bottles, boxes and gallons. The order being built this month is left out."
                    >
                        <div className="flex flex-col gap-3">
                            <ButtonGroup
                                aria-label="Kind of order"
                                size="sm"
                                selectedKeys={[kind]}
                                disallowEmptySelection
                                onSelectionChange={(keys) => {
                                    const key = [...keys][0];
                                    if (key) setKind(key as "supply" | "polish");
                                }}
                            >
                                <ButtonGroupItem id="supply" className="min-h-11 lg:min-h-0">
                                    Supplies
                                </ButtonGroupItem>
                                <ButtonGroupItem id="polish" className="min-h-11 lg:min-h-0">
                                    Colours
                                </ButtonGroupItem>
                            </ButtonGroup>
                            <VolumeChart loc={model.loc} kind={kind} />
                        </div>
                    </InsightCard>

                    <InsightCard
                        metric={`${line ? lineLabel(line) : "Colour"} family shifts · Early signal`}
                        provenance="real"
                        title={
                            shifts[0] && firstCycle && lastCycle
                                ? `${shifts[0].group} ${shifts[0].change > 0 ? "grew" : "shrank"} most between the ${longMonth(firstCycle)} and ${longMonth(lastCycle)} colour orders`
                                : "No shift in colour families can be read yet"
                        }
                        why={
                            shifts.length
                                ? `Share of each order taken by a colour family, first cycle against last. With ${plural(mix?.cycles.length ?? 0, "cycle")} this could be one season starting or one unusual order.`
                                : `Comparing families needs colour orders from at least two cycles at ${place}.`
                        }
                        action={{ label: "See the full mix by cycle", href: tabHref("colours") }}
                    >
                        {shifts.length > 0 && firstCycle && lastCycle && (
                            <ul className="flex flex-col divide-y divide-border-secondary">
                                {shifts.map((s) => (
                                    <li key={s.group} className="flex items-center justify-between gap-3 py-2.5">
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <span
                                                aria-hidden="true"
                                                className={cx(
                                                    "size-4 shrink-0 rounded-sm ring-1 ring-secondary ring-inset",
                                                    !mix?.swatches[s.group] && "bg-utility-neutral-300",
                                                )}
                                                style={mix?.swatches[s.group] ? { backgroundColor: mix.swatches[s.group] } : undefined}
                                            />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-secondary">{s.group}</span>
                                                <span className="block text-xs text-tertiary">
                                                    {pct(s.from)} in {shortMonth(firstCycle)}, {pct(s.to)} in {shortMonth(lastCycle)}
                                                </span>
                                            </span>
                                        </span>
                                        <span className="flex shrink-0 items-center gap-2">
                                            <span className={cx("text-sm font-semibold tabular-nums", s.change > 0 ? "text-primary" : "text-tertiary")}>
                                                {s.change > 0 ? "+" : "−"}
                                                {Math.abs(Math.round(s.change * 100))} pts
                                            </span>
                                            <Badge type="pill-color" size="sm" color="gray">
                                                Early signal
                                            </Badge>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </InsightCard>
                </div>
            </section>

            <Card className="flex flex-col gap-5">
                <CardHeader
                    title="Plan around your calendar"
                    description="You already know when the salon gets busy. Add those periods and the lift you expect, and the app can nudge orders ahead of them before a year of data exists."
                />
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-pretty text-tertiary ring-1 ring-secondary ring-inset">
                    <span className="font-semibold text-secondary">The two rows marked Example are not Meraki's data. </span>
                    They show the idea. Remove them and add your own.
                </p>

                {periods.length === 0 ? (
                    <NoData>No busy periods yet. Add the first one below.</NoData>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {periods.map((p) => {
                            const active = selected?.id === p.id;
                            return (
                                <li
                                    key={p.id}
                                    className={cx(
                                        "flex items-center gap-2 rounded-lg ring-1 ring-inset",
                                        active ? "bg-brand-primary_alt ring-brand" : "bg-primary ring-secondary",
                                    )}
                                >
                                    <button
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() => setSelectedId(p.id)}
                                        className="flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center gap-0.5 rounded-lg px-3 py-2 text-left outline-focus-ring focus-visible:outline-2"
                                    >
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-sm font-semibold text-primary">{p.name}</span>
                                            {p.example && <SampleBadge label="Example" />}
                                        </span>
                                        <span className="text-xs text-tertiary">
                                            {formatDate(p.start, true)} to {formatDate(p.end, true)} · expect {p.lift}% more than usual
                                        </span>
                                    </button>
                                    <Button
                                        color="tertiary"
                                        size="md"
                                        iconLeading={Trash01}
                                        aria-label={`Remove ${p.name}`}
                                        className="mr-1 shrink-0"
                                        onClick={() => {
                                            setPeriods((list) => list.filter((x) => x.id !== p.id));
                                            setMessage(`Removed “${p.name}”.`);
                                        }}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}

                {/* A group, not a form: nothing is submitted anywhere, and Enter in a field adds the period. */}
                <div
                    role="group"
                    aria-label="Add a busy period"
                    className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_auto]"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                            e.preventDefault();
                            add();
                        }
                    }}
                >
                    <Field label="Busy period" className="col-span-2 lg:col-span-1">
                        <input
                            type="text"
                            value={draft.name}
                            placeholder="For example, graduation weekend"
                            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            className={fieldClass}
                        />
                    </Field>
                    <Field label="Starts">
                        <input type="date" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} className={fieldClass} />
                    </Field>
                    <Field label="Ends">
                        <input type="date" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} className={fieldClass} />
                    </Field>
                    <Field label="Expected lift">
                        <NumberField
                            label="Expected lift, percent"
                            value={draft.lift}
                            suffix="%"
                            step={1}
                            onChange={(lift) => setDraft((d) => ({ ...d, lift }))}
                        />
                    </Field>
                    <Button color="secondary" size="md" iconLeading={Plus} className="col-span-2 min-h-11 lg:col-span-1 lg:min-h-0" onClick={add}>
                        Add period
                    </Button>
                </div>
                {message && (
                    <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-secondary ring-1 ring-brand_alt ring-inset">
                        {message}
                    </p>
                )}

                {selected && topProducts.length > 0 && (
                    <section className="flex flex-col gap-3 border-t border-secondary pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-primary">
                                What-if: {selected.name.replace(/^Example: /, "")} at {selected.lift}% above usual
                            </h3>
                            <SampleBadge label={selected.example ? "What-if, example period" : "What-if"} />
                        </div>
                        <p className="text-sm text-pretty text-tertiary">
                            The six supplies used fastest, over the {plural(periodDays, "day")} from {formatDate(selected.start, true)}. Extra is usual usage
                            multiplied by the lift, rounded up to whole units. It is your assumption applied to the forecast, not a prediction.
                            {orderBy &&
                                (orderBy <= TODAY
                                    ? ` At the measured ${measuredCycleDays} days from order to shelf, the date to order for this has passed, so the extra belongs on the next order.`
                                    : ` At the measured ${measuredCycleDays} days from order to shelf, the larger order goes out by ${formatDate(orderBy, true)}.`)}
                        </p>
                        <ul className="flex flex-col divide-y divide-border-secondary">
                            {topProducts.map((f) => {
                                const item = getItem(f.itemId);
                                const usual = (f.monthlyUsage * periodDays) / 30;
                                const extra = (usual * selected.lift) / 100;
                                return (
                                    <li key={f.itemId} className="flex items-center justify-between gap-3 py-2.5">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-secondary">{item?.name}</p>
                                            <p className="text-xs text-tertiary">
                                                Usually about {formatCount(round1(usual), item?.unit)} over the period ({f.monthlyUsage} a month)
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-right text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
                                            +{formatCount(Math.ceil(extra - 1e-9), item?.unit)}
                                            <span className="block text-xs font-normal text-tertiary">{round1(extra)} before rounding</span>
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ profitability

const cloneRecipes = (): ServiceRecipe[] => serviceRecipes.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) }));

const ProfitabilityTab = () => {
    const [recipes, setRecipes] = useState<ServiceRecipe[]>(cloneRecipes);
    const [selectedId, setSelectedId] = useState(serviceRecipes[0]?.id ?? "");
    const recipe = recipes.find((r) => r.id === selectedId) ?? recipes[0];

    const update = (patch: (r: ServiceRecipe) => ServiceRecipe) => setRecipes((list) => list.map((r) => (r.id === recipe?.id ? patch(r) : r)));
    const updateLine = (index: number, patch: Partial<RecipeLine>) =>
        update((r) => ({ ...r, lines: r.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) }));
    const addService = () => {
        const id = `custom-${recipes.length + 1}`;
        setRecipes((list) => [
            ...list,
            {
                id,
                service: "New service",
                price: 50,
                monthlyServices: 100,
                isExample: true,
                lines: [{ name: "First product", unitCost: 10, servicesPerUnit: 20 }],
            },
        ]);
        setSelectedId(id);
    };

    if (!recipe) return <NoData>No service recipes yet. Add a service to start.</NoData>;

    const cost = serviceCost(recipe);
    const monthly = recipe.monthlyServices ?? 0;
    const costliest = cost.costliest;
    const expected = costliest ? expectedUnits(costliest, monthly) : 0;
    const illustrativeActual = Math.ceil(expected * 1.25);
    const custom = !serviceRecipes.some((r) => r.id === recipe.id);

    return (
        <div className="flex flex-col gap-6 lg:gap-8">
            <Callout tone="warning" title="These are example recipes with sample costs, not Meraki's numbers">
                Prices, services per container and monthly volumes below are placeholders that show how the calculation works. Real answers need two things the
                app does not have yet: unit costs from invoices, and services performed from Meevo. Change any number to try your own.
            </Callout>

            <Card className="flex flex-col gap-5">
                <CardHeader
                    title="Product cost per service"
                    description="Pick a service, then check each product it uses: what a container costs and how many services it covers."
                    actions={<SampleBadge label="Example recipe, sample costs" />}
                />

                <ChipRow label="Service">
                    {recipes.map((r) => (
                        <FilterChip key={r.id} selected={r.id === recipe.id} onPress={() => setSelectedId(r.id)}>
                            {r.service}
                        </FilterChip>
                    ))}
                    <button
                        type="button"
                        onClick={addService}
                        className="flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-brand-secondary ring-1 ring-brand outline-focus-ring ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9"
                    >
                        <Plus className="size-4" aria-hidden="true" />
                        Add a service
                    </button>
                </ChipRow>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="Service" className="col-span-2 lg:col-span-1">
                        <input type="text" value={recipe.service} onChange={(e) => update((r) => ({ ...r, service: e.target.value }))} className={fieldClass} />
                    </Field>
                    <Field label="Price charged">
                        <NumberField
                            key={`${recipe.id}-price`}
                            label="Price charged, dollars"
                            prefix="$"
                            value={recipe.price}
                            onChange={(price) => update((r) => ({ ...r, price }))}
                        />
                    </Field>
                    <Field label="Services a month">
                        <NumberField
                            key={`${recipe.id}-volume`}
                            label="Services a month"
                            step={1}
                            value={monthly}
                            onChange={(monthlyServices) => update((r) => ({ ...r, monthlyServices }))}
                        />
                    </Field>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="hidden grid-cols-[minmax(0,1fr)_8rem_8rem_7rem_2.5rem] items-end gap-3 border-b border-secondary pb-2 text-xs font-semibold text-quaternary lg:grid">
                        <span>Product</span>
                        <span>Cost per container</span>
                        <span>Services per container</span>
                        <span className="text-right">Cost per service</span>
                        <span className="sr-only">Remove</span>
                    </div>
                    <ul className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-border-secondary">
                        {recipe.lines.map((l, i) => {
                            const perService = l.servicesPerUnit > 0 ? l.unitCost / l.servicesPerUnit : 0;
                            const isCostliest =
                                costliest !== undefined && costliest.name === l.name && recipe.lines.length > 1 && perService === costliest.costPerService;
                            return (
                                <li
                                    key={`${recipe.id}-${i}`}
                                    className="grid grid-cols-2 items-end gap-3 rounded-lg p-3 ring-1 ring-secondary ring-inset lg:grid-cols-[minmax(0,1fr)_8rem_8rem_7rem_2.5rem] lg:items-center lg:rounded-none lg:px-0 lg:py-2.5 lg:ring-0"
                                >
                                    <div className="col-span-2 flex min-w-0 flex-col gap-1 lg:col-span-1">
                                        <input
                                            type="text"
                                            aria-label={`Product ${i + 1} name`}
                                            value={l.name}
                                            onChange={(e) => updateLine(i, { name: e.target.value })}
                                            className={cx(fieldClass, "font-medium")}
                                        />
                                        {isCostliest && <span className="text-xs font-medium text-warning-primary">Costliest line in this service</span>}
                                    </div>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-tertiary lg:sr-only">Cost per container</span>
                                        <NumberField
                                            label={`${l.name}: cost per container, dollars`}
                                            prefix="$"
                                            value={l.unitCost}
                                            onChange={(unitCost) => updateLine(i, { unitCost })}
                                        />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                        <span className="text-xs text-tertiary lg:sr-only">Services per container</span>
                                        <NumberField
                                            label={`${l.name}: services per container`}
                                            step={1}
                                            value={l.servicesPerUnit}
                                            onChange={(servicesPerUnit) => updateLine(i, { servicesPerUnit })}
                                        />
                                    </label>
                                    <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-primary tabular-nums lg:block lg:text-right">
                                        <span className="text-xs font-normal text-tertiary lg:hidden">Cost per service</span>
                                        {formatCurrency(perService, true)}
                                    </p>
                                    <Button
                                        color="tertiary"
                                        size="md"
                                        iconLeading={Trash01}
                                        aria-label={`Remove ${l.name}`}
                                        className="justify-self-end"
                                        isDisabled={recipe.lines.length <= 1}
                                        onClick={() => update((r) => ({ ...r, lines: r.lines.filter((_, index) => index !== i) }))}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                    <Button
                        color="link-color"
                        size="md"
                        iconLeading={Plus}
                        className="min-h-11 self-start lg:min-h-0"
                        onClick={() => update((r) => ({ ...r, lines: [...r.lines, { name: "New product", unitCost: 10, servicesPerUnit: 20 }] }))}
                    >
                        Add a product line
                    </Button>
                </div>

                <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                        <dt className="text-xs font-medium text-tertiary">Product cost per service</dt>
                        <dd className="text-xl font-semibold text-primary tabular-nums">{formatCurrency(cost.productCost, true)}</dd>
                        <dd className="text-xs text-tertiary">{recipe.price > 0 ? `${pct(cost.productCost / recipe.price)} of the price` : "Set a price"}</dd>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                        <dt className="text-xs font-medium text-tertiary">Left after product</dt>
                        <dd className={cx("text-xl font-semibold tabular-nums", cost.productMargin < 0 ? "text-error-primary" : "text-primary")}>
                            {formatCurrency(cost.productMargin, true)}
                        </dd>
                        <dd className="text-xs text-tertiary">{pct(cost.productMarginPct)} of the price</dd>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                        <dt className="text-xs font-medium text-tertiary">Product cost a month</dt>
                        <dd className="text-xl font-semibold text-primary tabular-nums">{formatCurrency(cost.monthlyProductCost ?? 0)}</dd>
                        <dd className="text-xs text-tertiary">at {plural(monthly, "service")} a month</dd>
                    </div>
                    <div className="flex flex-col gap-1 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                        <dt className="text-xs font-medium text-tertiary">Costliest line</dt>
                        <dd className="line-clamp-2 text-sm font-semibold text-primary">{costliest?.name ?? "None"}</dd>
                        <dd className="text-xs text-tertiary tabular-nums">{costliest ? `${formatCurrency(costliest.costPerService, true)} a service` : ""}</dd>
                    </div>
                </dl>
                <p className="text-sm text-pretty text-tertiary">
                    <span className="font-semibold text-secondary">Left after product is not profit. </span>
                    Labour, rent and card fees are not included: this is only what remains of the price once the product on the client's hands is paid for.
                    {custom && " This service was added here and is not saved in the prototype."}
                </p>
            </Card>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <Card className="flex flex-col gap-4">
                    <CardHeader
                        title="Expected vs actual usage"
                        description="The check this enables once Meevo is connected: services performed, multiplied by the recipe, against what the stock ledger says was used."
                        actions={<SampleBadge label="Illustration" />}
                    />
                    {costliest && monthly > 0 ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-secondary p-3">
                            <p className="text-xs font-semibold text-tertiary">Illustration only. The “used” figure is made up to show the layout.</p>
                            <p className="text-sm font-medium text-secondary">{costliest.name}</p>
                            <dl className="grid grid-cols-3 gap-3">
                                <div>
                                    <dt className="text-xs text-tertiary">Recipe expects</dt>
                                    <dd className="text-md font-semibold text-primary tabular-nums">{round1(expected)}</dd>
                                    <dd className="text-xs text-tertiary">
                                        {monthly} services ÷ {costliest.servicesPerUnit}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-tertiary">Ledger says used</dt>
                                    <dd className="text-md font-semibold text-primary tabular-nums">{illustrativeActual}</dd>
                                    <dd className="text-xs text-tertiary">made-up figure</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-tertiary">Difference</dt>
                                    <dd className="text-md font-semibold text-warning-primary tabular-nums">+{round1(illustrativeActual - expected)}</dd>
                                    <dd className="text-xs text-tertiary">more than the recipe explains</dd>
                                </div>
                            </dl>
                        </div>
                    ) : (
                        <NoData>Add a product line and a monthly volume to see the layout of this check.</NoData>
                    )}
                    <p className="text-sm text-pretty text-tertiary">
                        A gap can mean heavier application than the recipe assumes, waste, a recipe that needs correcting, or product leaving the salon another
                        way. The app would show the gap and leave the reason to you.
                    </p>
                </Card>

                <Card className="flex flex-col gap-4">
                    <CardHeader title="What to collect" description="Three things turn this calculator into Meraki's real numbers." />
                    <ol className="flex flex-col divide-y divide-border-secondary">
                        {[
                            {
                                title: "Invoice costs for the supplies that drive spend",
                                body: "Start with the handful on the Products tab that make up 80% of projected spend. Type the unit price when a delivery is received, or load the invoices once.",
                            },
                            {
                                title: "Services performed, from Meevo",
                                body: "A monthly count of each service by location. Until Meevo is connected, its service report can be imported as a file.",
                            },
                            {
                                title: "How many services one container covers",
                                body: "Log the date a bottle is opened and the date it is finished for the main services. Two or three bottles each is enough to replace the guesses above.",
                            },
                        ].map((step, i) => (
                            <li key={step.title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-semibold text-brand-secondary">
                                    {i + 1}
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-primary">{step.title}</p>
                                    <p className="text-sm text-pretty text-tertiary">{step.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>
        </div>
    );
};

// ------------------------------------------------------------------------------------ planning

type LeadMode = "quoted" | "measured";

const PlanningTab = ({ model }: TabProps) => {
    const isDesktop = useBreakpoint("lg");
    const place = locationName(model.loc);
    const [mode, setMode] = useState<LeadMode>("quoted");
    const [byVendor, setByVendor] = useState(false);
    const main = vendorById(MEASURED_VENDOR);
    const events = mode === "measured" ? model.measured : model.quoted;
    const nowQuoted = model.quoted.filter(orderNow);
    const nowMeasured = model.measured.filter(orderNow);
    const added = nowMeasured.filter((e) => !nowQuoted.some((q) => q.itemId === e.itemId));
    const unitOf = (id: string) => getItem(id)?.unit;

    const spend = spendProjection(model.all, items, TODAY, 3, (item) => vendorById(item.vendorId).name);
    const vendorNames = [...new Set(spend.flatMap((m) => Object.keys(m.byGroup)))].sort((a, b) => (spend[0]?.byGroup[b] ?? 0) - (spend[0]?.byGroup[a] ?? 0));
    const spendTotal = sum(spend.map((m) => m.total));
    const flat = spend.every((m) => m.total === spend[0]?.total);
    const maxVendor = Math.max(1, ...vendorNames.map((v) => sum(spend.map((m) => m.byGroup[v] ?? 0))));

    const week = addDays(TODAY, 7);
    const threeWeeks = addDays(TODAY, 21);
    const month = addDays(TODAY, 30);
    const dated = events.filter((e) => e.orderBy !== undefined);
    const buckets: { id: string; label: string; hint: string; rows: ReorderEvent[] }[] = [
        { id: "week", label: "This week", hint: `by ${formatDate(week)}`, rows: dated.filter((e) => (e.orderBy as string) <= week) },
        {
            id: "fortnight",
            label: "Next 2 weeks",
            hint: `by ${formatDate(threeWeeks)}`,
            rows: dated.filter((e) => (e.orderBy as string) > week && (e.orderBy as string) <= threeWeeks),
        },
        {
            id: "month",
            label: "Later this month",
            hint: `by ${formatDate(month)}`,
            rows: dated.filter((e) => (e.orderBy as string) > threeWeeks && (e.orderBy as string) <= month),
        },
    ];

    return (
        <div className="flex flex-col gap-6 pb-16 lg:gap-8 lg:pb-0">
            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="When to order, next 90 days"
                    description={`Supplies at ${place} that reach their reorder point by ${formatDate(addDays(TODAY, HORIZON_DAYS), true)}: the latest date to order each one, and when the shelf runs empty if nobody does.`}
                    actions={
                        <>
                            {model.estimated ? <SampleBadge label="Estimated from Lynnfield" /> : <RealDataBadge />}
                            <SampleBadge label="Sample on-hand" />
                        </>
                    }
                />

                <div className="flex flex-col gap-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <ButtonGroup
                            aria-label="Lead time used for planning"
                            size="sm"
                            selectedKeys={[mode]}
                            disallowEmptySelection
                            onSelectionChange={(keys) => {
                                const key = [...keys][0];
                                if (key) setMode(key as LeadMode);
                            }}
                        >
                            <ButtonGroupItem id="quoted" className="min-h-11 lg:min-h-0">
                                {isDesktop ? `Plan with vendor lead time (${main.leadTimeDays} days)` : `Vendor: ${main.leadTimeDays} days`}
                            </ButtonGroupItem>
                            <ButtonGroupItem id="measured" isDisabled={measuredCycleDays === undefined} className="min-h-11 lg:min-h-0">
                                {measuredCycleDays === undefined
                                    ? "No measured cycle yet"
                                    : isDesktop
                                      ? `Plan with your measured cycle (${measuredCycleDays} days)`
                                      : `Measured: ${measuredCycleDays} days`}
                            </ButtonGroupItem>
                        </ButtonGroup>
                        <Toggle
                            size="sm"
                            label="Group by vendor"
                            className="hidden shrink-0 items-center lg:flex"
                            isSelected={byVendor}
                            onChange={setByVendor}
                        />
                    </div>
                    <p className="text-sm text-pretty text-secondary" aria-live="polite">
                        {mode === "quoted" ? (
                            <>
                                Planning with each vendor's quoted lead time,{" "}
                                <span className="font-semibold">{plural(nowQuoted.length, "supply needs", "supplies need")} ordering today</span>.
                                {measuredCycleDays !== undefined &&
                                    (nowMeasured.length === nowQuoted.length
                                        ? ` With the ${measuredCycleDays} days ${main.name} orders actually took in 2026, that number stays the same, but later order dates move earlier.`
                                        : ` With the ${measuredCycleDays} days ${main.name} orders actually took in 2026, that becomes ${nowMeasured.length}.`)}
                            </>
                        ) : (
                            <>
                                Planning with the {measuredCycleDays} days {main.name} orders took from order form to shelf in 2026,{" "}
                                <span className="font-semibold">{plural(nowMeasured.length, "supply needs", "supplies need")} ordering today</span>
                                {nowMeasured.length === nowQuoted.length
                                    ? ", the same as with quoted lead times, but later order dates move earlier"
                                    : `, up from ${nowQuoted.length}`}
                                {added.length > 0 && `: ${added.map((e) => e.name).join(", ")} ${added.length === 1 ? "joins" : "join"} the list`}. Other
                                vendors keep their quoted lead times.
                            </>
                        )}
                    </p>
                </div>

                <ReorderTimeline
                    events={events}
                    today={TODAY}
                    horizonDays={HORIZON_DAYS}
                    groupByVendor={byVendor}
                    maxRows={byVendor ? 40 : 12}
                    unitOf={unitOf}
                    hrefOf={ROUTES.item}
                />

                <p className="text-xs text-pretty text-tertiary">
                    Order dates are worked out from forecast usage and the on-hand number. {model.sampleOnHand} of {model.supplyLevels.length} on-hand numbers
                    at {place} are sample values, so the dates firm up after the first count. Vendor lead times are assumptions until each vendor confirms them.
                </p>
            </Card>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <Card className="flex flex-col gap-4">
                    <CardHeader
                        title="Order by"
                        description={`What has to go on an order in the next 30 days, using ${mode === "measured" ? "the measured cycle" : "quoted lead times"}.`}
                        actions={<SampleBadge label="Sample on-hand" />}
                    />
                    <div className="flex flex-col divide-y divide-border-secondary">
                        {buckets.map((b) => (
                            <section key={b.id} aria-label={b.label} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                                <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold text-primary">
                                    {b.label}
                                    <span className="text-xs font-medium text-tertiary">
                                        {b.rows.length ? `${plural(b.rows.length, "item")}, ${b.hint}` : b.hint}
                                    </span>
                                </h3>
                                {b.rows.length === 0 ? (
                                    <p className="text-sm text-tertiary">Nothing has to be ordered in this window.</p>
                                ) : (
                                    <ul className="flex flex-col gap-1.5">
                                        {b.rows.map((e) => (
                                            <li key={e.itemId} className="flex items-baseline justify-between gap-3">
                                                <a
                                                    href={ROUTES.item(e.itemId)}
                                                    className="min-w-0 truncate rounded-xs text-sm text-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                                >
                                                    {e.name}
                                                </a>
                                                <span className="shrink-0 text-xs whitespace-nowrap text-tertiary tabular-nums">
                                                    {formatCount(e.qty, unitOf(e.itemId))} · {orderNow(e) ? "today" : formatDate(e.orderBy as string)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        ))}
                    </div>
                    <Button color="primary" size="md" href={ROUTES.newOrder} iconLeading={ShoppingCart01} className="hidden self-start lg:inline-flex">
                        Build the next order
                    </Button>
                </Card>

                <Card className="flex flex-col gap-4">
                    <CardHeader
                        title="Projected spend, next 3 months"
                        description={`About ${formatCurrency(spendTotal)} across ${spend.map((m) => shortMonth(m.month)).join(", ")}, by vendor: forecast monthly usage multiplied by unit cost.`}
                        actions={<SampleBadge label="Sample costs" />}
                    />
                    {vendorNames.length === 0 ? (
                        <NoData>No supply has a usage estimate, so there is no spend to project.</NoData>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-max text-left text-sm">
                                <thead>
                                    <tr className="border-b border-secondary text-xs text-quaternary">
                                        <th scope="col" className="py-2 pr-3 font-semibold">
                                            Vendor
                                        </th>
                                        {spend.map((m) => (
                                            <th key={m.month} scope="col" className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                                                {formatMonth(m.month)}
                                            </th>
                                        ))}
                                        <th scope="col" className="py-2 pl-2 text-right font-semibold">
                                            3 months
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-secondary">
                                    {vendorNames.map((v) => {
                                        const total = sum(spend.map((m) => m.byGroup[v] ?? 0));
                                        return (
                                            <tr key={v}>
                                                <th scope="row" className="py-2 pr-3 font-medium text-secondary">
                                                    <span className="block whitespace-nowrap">{v}</span>
                                                    <span
                                                        className="mt-1 block h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-secondary"
                                                        aria-hidden="true"
                                                    >
                                                        <span
                                                            className="block h-1.5 rounded-full bg-fg-brand-primary"
                                                            style={{ width: `${Math.max(2, (total / maxVendor) * 100)}%` }}
                                                        />
                                                    </span>
                                                </th>
                                                {spend.map((m) => (
                                                    <td key={m.month} className="px-2 py-2 text-right text-tertiary tabular-nums">
                                                        {formatCurrency(m.byGroup[v] ?? 0)}
                                                    </td>
                                                ))}
                                                <td className="py-2 pl-2 text-right font-semibold text-primary tabular-nums">{formatCurrency(total)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t border-primary">
                                        <th scope="row" className="py-2 pr-3 font-semibold text-primary">
                                            All vendors
                                        </th>
                                        {spend.map((m) => (
                                            <td key={m.month} className="px-2 py-2 text-right font-semibold text-primary tabular-nums">
                                                {formatCurrency(m.total)}
                                            </td>
                                        ))}
                                        <td className="py-2 pl-2 text-right font-semibold text-primary tabular-nums">{formatCurrency(spendTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                    <p className="text-xs text-pretty text-tertiary">
                        Dollar figures use sample unit costs and cover only the {model.withUsage.length} supplies with a usage estimate, so the real total will
                        be higher.
                        {flat && " Every month shows the same amount because the forecast is a flat monthly rate until seasonality can be measured."} Polish is
                        not included.
                    </p>
                </Card>
            </div>

            <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-secondary bg-primary/95 px-4 py-3 backdrop-blur lg:hidden">
                <Button color="primary" size="lg" href={ROUTES.newOrder} iconLeading={ShoppingCart01} className="w-full">
                    Build the next order
                </Button>
            </div>
        </div>
    );
};

// ------------------------------------------------------------------------------------ screen

export interface InsightsScreenProps {
    location?: LocationId;
    initialTab?: InsightsTab;
    user?: User;
}

/**
 * Insights: forward-looking planning. What to stock, when to order and what the data can and
 * cannot say yet. Reports looks back at how orders went; this screen looks ahead.
 * Every card states whether its numbers are from Meraki's sheets or from the sample layer, and
 * where data is missing the screen says what would unlock it instead of showing a number.
 */
export const InsightsScreen = ({ location: initialLocation = "lynnfield", initialTab = "overview", user = CURRENT_USER }: InsightsScreenProps) => {
    const isDesktop = useBreakpoint("lg");
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [tab, setTab] = useState<InsightsTab>(initialTab);
    useUrlSync({ tab: tab === "overview" ? undefined : tab });
    const model = modelFor(location);
    const place = locationName(location);
    const thin = model.cycles.length < 2;

    // Links between tabs are real hrefs (so they work as deep links in the app); here they switch the tab in place.
    const onLinkClick = (e: MouseEvent<HTMLDivElement>) => {
        const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
        const target = href?.match(/[?&]tab=([a-z]+)/)?.[1];
        const next = TABS.find((t) => t.id === target);
        if (!next) return;
        e.preventDefault();
        setTab(next.id);
        window.scrollTo({ top: 0 });
    };

    return (
        <AppShell activeUrl={ROUTES.insights} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    title="Insights"
                    description={`What the 2026 orders say about what to stock and when to order at ${place}, and what the data cannot say yet.`}
                    actions={
                        <Button color="secondary" size="md" href={ROUTES.reports} iconLeading={BarChartSquare02}>
                            How past orders went: Reports
                        </Button>
                    }
                />

                <SampleDataNote>
                    Cards marked “From your sheets” are built from the catalogue, par levels and 2026 order forms. Cards marked “Sample” use placeholder costs
                    or on-hand numbers. Nothing here comes from Meevo: service and sales counts are not connected.
                </SampleDataNote>

                {thin && (
                    <Callout title={`${place} has ${model.cycles.length === 1 ? "one order form" : "no order forms"} on file`}>
                        {model.cycles[0] ? `The only order cycle is ${formatMonth(model.cycles[0])}. ` : ""}
                        {model.estimated ? "Supply forecasts on this screen are borrowed from Lynnfield's usage and marked low confidence. " : ""}
                        Colour rankings, mix changes and seasonality need more order cycles at this location, and each tab says so where it applies.
                    </Callout>
                )}

                <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as InsightsTab)} className="gap-5 lg:gap-6">
                    <div className="-mx-4 scrollbar-hide overflow-x-auto px-4 md:-mx-8 md:px-8 lg:mx-0 lg:overflow-visible lg:px-0">
                        <Tabs.List
                            aria-label="Insights sections"
                            type={isDesktop ? "underline" : "button-brand"}
                            size="sm"
                            className="w-max min-w-full lg:w-full"
                        >
                            {TABS.map((t) => (
                                <Tabs.Item
                                    key={t.id}
                                    id={t.id}
                                    label={t.label}
                                    className={({ isSelected }) =>
                                        isDesktop
                                            ? "px-1.5"
                                            : cx(
                                                  "min-h-11 shrink-0 rounded-full px-3.5 ring-1 ring-inset",
                                                  isSelected ? "ring-brand" : "bg-primary ring-primary",
                                              )
                                    }
                                />
                            ))}
                        </Tabs.List>
                    </div>

                    <div onClick={onLinkClick}>
                        <Tabs.Panel id="overview">
                            <OverviewTab key={location} model={model} />
                        </Tabs.Panel>
                        <Tabs.Panel id="products">
                            <ProductsTab key={location} model={model} />
                        </Tabs.Panel>
                        <Tabs.Panel id="colours">
                            <ColoursTab key={location} model={model} />
                        </Tabs.Panel>
                        <Tabs.Panel id="seasonality">
                            <SeasonalityTab key={location} model={model} />
                        </Tabs.Panel>
                        <Tabs.Panel id="profitability">
                            <ProfitabilityTab />
                        </Tabs.Panel>
                        <Tabs.Panel id="planning">
                            <PlanningTab key={location} model={model} />
                        </Tabs.Panel>
                    </div>
                </Tabs>
            </PageContent>
        </AppShell>
    );
};
