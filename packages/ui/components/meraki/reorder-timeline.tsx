"use client";

import { useState } from "react";
import { ChevronRight } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { addDays, addMonths, daysBetween, formatDate, formatMonth, toDate } from "@/engine/dates";
import type { ReorderEvent } from "@/engine/insights";
import { formatCount } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { ConfidenceBadge } from "./status-badges";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Monday of the week a date falls in. */
const weekStart = (iso: string) => addDays(iso, -((toDate(iso).getUTCDay() + 6) % 7));

const byOrderDate = (a: ReorderEvent, b: ReorderEvent) =>
    (a.orderBy ?? "9").localeCompare(b.orderBy ?? "9") || (a.stockoutOn ?? "9").localeCompare(b.stockoutOn ?? "9") || a.name.localeCompare(b.name);

export interface ReorderTimelineProps {
    /** Events from `reorderCalendar`. */
    events: ReorderEvent[];
    /** The date the timeline starts from (yyyy-mm-dd). */
    today: string;
    /** Days shown. Items that can wait longer than this are folded into a line under the timeline. */
    horizonDays?: number;
    /** Desktop only: put a vendor heading above each vendor's rows, so one order can be read at a glance. */
    groupByVendor?: boolean;
    /** Rows shown before "Show all". */
    maxRows?: number;
    /** Counting unit as stored on the item, e.g. "Bottle". Used for the suggested quantity. */
    unitOf?: (itemId: string) => string | undefined;
    /** Link for an item's name. */
    hrefOf?: (itemId: string) => string;
    /** `auto` shows the timeline from the `lg` breakpoint and the agenda below it. */
    layout?: "auto" | "timeline" | "agenda";
    className?: string;
}

interface Tick {
    date: string;
    left: number;
    label: string;
}

const dateLabel = (iso: string, today: string) => formatDate(iso, iso.slice(0, 4) !== today.slice(0, 4));

const ItemName = ({ event, href, className }: { event: ReorderEvent; href?: string; className?: string }) =>
    href ? (
        <a
            href={href}
            className={cx(
                "rounded-xs text-sm font-medium text-primary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2",
                className,
            )}
        >
            {event.name}
        </a>
    ) : (
        <span className={cx("text-sm font-medium text-primary", className)}>{event.name}</span>
    );

const Legend = () => (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-tertiary">
        <li className="flex items-center gap-1.5">
            <span
                aria-hidden="true"
                className="rounded-full bg-utility-yellow-50 px-1.5 py-px text-[10px] font-semibold text-utility-yellow-700 ring-1 ring-utility-yellow-200 ring-inset"
            >
                Now
            </span>
            Order date has arrived
        </li>
        <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rotate-45 bg-fg-brand-primary" />
            Order by
        </li>
        <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-5 rounded-full bg-utility-brand-200" />
            Waiting for delivery
        </li>
        <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-fg-error-secondary" />
            Runs out
        </li>
    </ul>
);

/**
 * When to order, and when the shelf runs empty if nobody does.
 * Desktop: one row per item on a shared time axis, items that must be ordered today pinned to the
 * today line. Phone: the same events as an agenda grouped by the week the order has to go out.
 */
export const ReorderTimeline = ({
    events,
    today,
    horizonDays = 90,
    groupByVendor = false,
    maxRows = 12,
    unitOf,
    hrefOf,
    layout = "auto",
    className,
}: ReorderTimelineProps) => {
    const [showAll, setShowAll] = useState(false);
    const [showLater, setShowLater] = useState(false);

    const end = addDays(today, horizonDays);
    const sorted = [...events].sort(byOrderDate);
    const inWindow = sorted.filter((e) => !e.orderBy || e.orderBy <= end);
    const later = sorted.filter((e) => e.orderBy && e.orderBy > end);
    const isNow = (e: ReorderEvent) => !e.orderBy || e.orderBy <= today;
    const qtyText = (e: ReorderEvent) => `Order ${formatCount(e.qty, unitOf?.(e.itemId))}`;

    if (!events.length) {
        return (
            <p className={cx("rounded-lg bg-secondary px-4 py-6 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset", className)}>
                Nothing reaches its reorder point in the next {horizonDays} days.
            </p>
        );
    }

    // ---- shared time axis
    const pos = (iso: string) => Math.max(0, Math.min(100, (daysBetween(today, iso) / horizonDays) * 100));
    const ticks: Tick[] = [];
    for (let m = addMonths(today, 1); m < end; m = addMonths(m, 1)) {
        const left = pos(m);
        if (left > 8 && left < 94) ticks.push({ date: m, left, label: formatMonth(m).slice(0, 3) });
    }

    const visible = showAll ? inWindow : inWindow.slice(0, maxRows);
    const hidden = inWindow.length - visible.length;
    const groups: { vendor?: string; rows: ReorderEvent[] }[] = groupByVendor
        ? [...new Set(visible.map((e) => e.vendorName))].map((vendor) => ({ vendor, rows: visible.filter((e) => e.vendorName === vendor) }))
        : [{ rows: visible }];

    const row = (e: ReorderEvent) => {
        const now = isNow(e);
        const orderLeft = e.orderBy ? pos(e.orderBy) : 0;
        const outBeyond = !e.stockoutOn || e.stockoutOn > end;
        const alreadyOut = Boolean(e.stockoutOn && e.stockoutOn <= today);
        const outLeft = e.stockoutOn ? pos(e.stockoutOn) : 100;
        return (
            <li key={e.itemId} className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_9.5rem] items-center gap-4 py-2">
                <div className="min-w-0">
                    <ItemName event={e} href={hrefOf?.(e.itemId)} className="line-clamp-1" />
                    <p className="truncate text-xs text-tertiary">{groupByVendor ? qtyText(e) : `${e.vendorName} · ${qtyText(e)}`}</p>
                </div>

                <div className="relative h-9" aria-hidden="true">
                    {ticks.map((t) => (
                        <span key={t.date} className="absolute inset-y-0 border-l border-secondary" style={{ left: `${t.left}%` }} />
                    ))}
                    {/* Stock on the shelf until the order date, then the wait for delivery. */}
                    <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-utility-neutral-300" style={{ left: 0, width: `${orderLeft}%` }} />
                    <span
                        className={cx("absolute top-1/2 h-2 -translate-y-1/2 bg-utility-brand-200", outBeyond ? "rounded-l-full" : "rounded-full")}
                        style={{ left: `${orderLeft}%`, width: `${Math.max(0, outLeft - orderLeft)}%` }}
                    />
                    {now ? (
                        <span className="absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-utility-yellow-50 px-1.5 py-px text-[10px] font-semibold text-utility-yellow-700 ring-1 ring-utility-yellow-200 ring-inset">
                            Now
                        </span>
                    ) : (
                        <span
                            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-fg-brand-primary"
                            style={{ left: `${orderLeft}%` }}
                        />
                    )}
                    {alreadyOut ? null : outBeyond ? (
                        <ChevronRight className="absolute top-1/2 -right-1 size-4 -translate-y-1/2 text-fg-quaternary" />
                    ) : (
                        <span
                            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-error-secondary ring-2 ring-bg-primary"
                            style={{ left: `${outLeft}%` }}
                        />
                    )}
                    <span className="absolute inset-y-0 left-0 border-l-2 border-fg-brand-primary" />
                </div>

                <div className="min-w-0 text-right">
                    <p className={cx("text-sm font-semibold whitespace-nowrap", now ? "text-warning-primary" : "text-primary")}>
                        {now ? "Order now" : `Order by ${dateLabel(e.orderBy as string, today)}`}
                    </p>
                    <p className="text-xs whitespace-nowrap text-tertiary">
                        {!e.stockoutOn ? "No run-out date" : e.stockoutOn <= today ? "Already out" : `Runs out ${dateLabel(e.stockoutOn, today)}`}
                    </p>
                </div>
            </li>
        );
    };

    const timeline = (
        <div className="flex flex-col gap-2">
            <Legend />
            <div className="grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_9.5rem] items-end gap-4 border-b border-secondary pb-1.5 text-xs font-semibold text-quaternary">
                <span>Item</span>
                <div className="relative h-4" aria-hidden="true">
                    <span className="absolute left-0 text-brand-secondary">Today, {formatDate(today)}</span>
                    {ticks.map((t) => (
                        <span key={t.date} className="absolute -translate-x-1/2" style={{ left: `${t.left}%` }}>
                            {t.label}
                        </span>
                    ))}
                    <span className="absolute right-0">{formatDate(end)}</span>
                </div>
                <span className="text-right">Next step</span>
            </div>
            {groups.map((g) => (
                <section key={g.vendor ?? "all"} aria-label={g.vendor}>
                    {g.vendor && (
                        <h4 className="flex items-baseline justify-between gap-3 pt-2 text-xs font-semibold text-secondary">
                            {g.vendor}
                            <span className="font-medium text-tertiary">
                                {plural(g.rows.length, "item")}
                                {g.rows.some(isNow) ? `, ${g.rows.filter(isNow).length} to order now` : ""}
                            </span>
                        </h4>
                    )}
                    <ul className="flex flex-col divide-y divide-border-secondary">{g.rows.map(row)}</ul>
                </section>
            ))}
        </div>
    );

    // ---- agenda (phones)
    const buckets = new Map<string, { label: string; rows: ReorderEvent[]; now?: boolean }>();
    for (const e of visible) {
        const now = isNow(e);
        const key = now ? "now" : weekStart(e.orderBy as string);
        const bucket = buckets.get(key) ?? { label: now ? "Order now" : `Week of ${dateLabel(key < today ? today : key, today)}`, rows: [], now };
        bucket.rows.push(e);
        buckets.set(key, bucket);
    }

    const agenda = (
        <div className="flex flex-col gap-4">
            {[...buckets.entries()].map(([key, bucket]) => (
                <section key={key} aria-label={bucket.label} className="flex flex-col gap-1.5">
                    <h4 className="flex items-baseline justify-between gap-3 text-sm font-semibold">
                        <span className={bucket.now ? "text-warning-primary" : "text-secondary"}>{bucket.label}</span>
                        <span className="text-xs font-medium text-tertiary">{plural(bucket.rows.length, "item")}</span>
                    </h4>
                    <ul className="flex flex-col divide-y divide-border-secondary rounded-lg bg-primary ring-1 ring-secondary ring-inset">
                        {bucket.rows.map((e) => (
                            <li key={e.itemId} className="flex flex-col gap-1.5 px-3 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <ItemName event={e} href={hrefOf?.(e.itemId)} className="flex min-h-6 items-center" />
                                    <span
                                        className={cx("shrink-0 text-sm font-semibold whitespace-nowrap", bucket.now ? "text-warning-primary" : "text-primary")}
                                    >
                                        {bucket.now ? "Now" : `By ${dateLabel(e.orderBy as string, today)}`}
                                    </span>
                                </div>
                                <p className="text-xs text-tertiary">
                                    {e.vendorName} · {qtyText(e)} ·{" "}
                                    {!e.stockoutOn ? "no run-out date" : e.stockoutOn <= today ? "already out" : `runs out ${dateLabel(e.stockoutOn, today)}`}
                                </p>
                                <div>
                                    <ConfidenceBadge confidence={e.confidence} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );

    return (
        <div className={cx("flex min-w-0 flex-col gap-3", className)}>
            {layout !== "agenda" && <div className={cx(layout === "auto" && "hidden lg:block")}>{timeline}</div>}
            {layout !== "timeline" && <div className={cx(layout === "auto" && "lg:hidden")}>{agenda}</div>}

            {hidden > 0 && (
                <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={() => setShowAll(true)}>
                    Show {plural(hidden, "more item")}
                </Button>
            )}

            {later.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary ring-inset">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <p className="text-sm text-tertiary">
                            {plural(later.length, "more item reaches", "more items reach")} the reorder point in this window, but{" "}
                            {later.length === 1 ? "has" : "have"} enough on the shelf to wait until after {formatDate(end, true)}.
                        </p>
                        <Button color="link-color" size="sm" aria-expanded={showLater} onClick={() => setShowLater((v) => !v)}>
                            {showLater ? "Hide them" : "List them"}
                        </Button>
                    </div>
                    {showLater && (
                        <ul className="flex flex-col divide-y divide-border-secondary">
                            {later.map((e) => (
                                <li key={e.itemId} className="flex items-baseline justify-between gap-3 py-1.5">
                                    <ItemName event={e} href={hrefOf?.(e.itemId)} className="min-w-0" />
                                    <span className="shrink-0 text-xs whitespace-nowrap text-tertiary">Order by {formatDate(e.orderBy as string, true)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};
