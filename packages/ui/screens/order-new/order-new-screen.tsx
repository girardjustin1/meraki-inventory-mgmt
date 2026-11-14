"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, FilterLines, Minus, Plus, SearchLg } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { OrderStatusBadge, SampleBadge } from "@/components/meraki/status-badges";
import { TODAY, getForecast, getStock, items, locationName, purchaseOrders, reorderSuggestions, vendorById } from "@/data/inventory";
import type { Forecast, Item, LocationId, OrderChannel, PurchaseOrder, StockLevel, Vendor, VendorId } from "@/data/types";
import { formatMonth } from "@/engine/dates";
import { FLAG_THRESHOLDS } from "@/engine/flags";
import { median } from "@/engine/forecast";
import { formatCurrency, formatQty } from "@/engine/stock";
import { cx } from "@/utils/cx";

const URGENT_DAYS = 14;
const LOC_CODE: Record<LocationId, string> = { lynnfield: "LYN", newburyport: "NBP" };
const CHANNEL_NEXT: Record<OrderChannel, string> = {
    "email-po": "Emailed to the vendor as a PDF once approved.",
    portal: "Placed on the vendor portal once approved.",
    "in-store": "Becomes a pick list for the store run once approved.",
    api: "Placed on Amazon once approved (API ordering is planned).",
    internal: "Sent to the warehouse as a transfer request once approved.",
};

/** One row of the builder: a suggestion from the reorder engine, or an item the user added. */
interface BuilderLine {
    item: Item;
    vendor: Vendor;
    level?: StockLevel;
    forecast?: Forecast;
    suggested: number;
    reasons: string[];
    /** An order that is not sent yet and already holds this item. */
    pending?: PurchaseOrder;
    added?: boolean;
}

const reasonsFor = (level: StockLevel, forecast: Forecast | undefined, location: LocationId) => {
    const out: string[] = [];
    if (level.fillLevel === "half" || level.fillLevel === "quarter" || level.fillLevel === "empty") out.push("Half full or less");
    if (!level.fillLevel && forecast && forecast.confidence !== "none" && level.onHand <= forecast.reorderPoint) out.push("Below reorder point");
    // The "Order?" tick is real on the Lynnfield sheet; Newburyport's ticks are generated.
    if (level.reorderRequested) out.push(location === "lynnfield" ? "Requested on the sheet" : "Requested (sample)");
    if (!out.length) out.push("Below par");
    return out;
};

/** Median of what has been ordered before, from orders that were actually placed. Mirrors the flag engine's order-spike rule. */
const usualOrders = (() => {
    const past = new Map<string, number[]>();
    for (const po of purchaseOrders) {
        if (po.status === "draft" || po.status === "awaiting-approval" || po.status === "cancelled") continue;
        for (const l of po.lines) if (l.itemId && l.qtyOrdered > 0) past.set(l.itemId, [...(past.get(l.itemId) ?? []), l.qtyOrdered]);
    }
    return past;
})();

const spikeFor = (itemId: string, qty: number) => {
    const past = usualOrders.get(itemId) ?? [];
    const usual = median(past);
    if (usual <= 0 || qty < usual * FLAG_THRESHOLDS.orderSpikeMultiple) return null;
    const multiple = Math.round((qty / usual) * 10) / 10;
    // The engine only raises a flag with two earlier orders to compare and a meaningful jump in units.
    const wouldFlag = past.length >= 2 && qty - usual >= FLAG_THRESHOLDS.orderSpikeMinExtraUnits;
    return { usual, multiple, wouldFlag };
};

const QtyStepper = ({ value, onChange, label, isDisabled }: { value: number; onChange: (v: number) => void; label: string; isDisabled?: boolean }) => {
    const btn =
        "flex size-11 cursor-pointer items-center justify-center text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:size-9";
    return (
        <div
            role="group"
            aria-label={label}
            className={cx(
                "inline-flex items-center overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-primary ring-inset",
                isDisabled && "opacity-50",
            )}
        >
            <button type="button" aria-label="One fewer" disabled={isDisabled || value <= 1} onClick={() => onChange(Math.max(1, value - 1))} className={btn}>
                <Minus className="size-4" aria-hidden="true" />
            </button>
            <input
                aria-label={label}
                inputMode="numeric"
                disabled={isDisabled}
                value={value}
                onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    onChange(Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1);
                }}
                className="h-11 w-11 border-x border-secondary bg-primary text-center text-sm font-semibold text-primary tabular-nums outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2 lg:h-9"
            />
            <button type="button" aria-label="One more" disabled={isDisabled} onClick={() => onChange(Math.min(999, value + 1))} className={btn}>
                <Plus className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
};

const Chip = ({ isSelected, onPress, children }: { isSelected: boolean; onPress: () => void; children: ReactNode }) => (
    <button
        type="button"
        aria-pressed={isSelected}
        onClick={onPress}
        className={cx(
            "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9 lg:px-3",
            isSelected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
        )}
    >
        {children}
    </button>
);

const SpikeNote = ({ itemId, qty }: { itemId: string; qty: number }) => {
    const spike = spikeFor(itemId, qty);
    if (!spike) return null;
    return spike.wouldFlag ? (
        <p role="status" className="flex items-start gap-1.5 text-xs font-medium text-warning-primary">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>
                This is {spike.multiple}× the usual order of {spike.usual}. An order this size is flagged for a second look, so add a reason if it is intended.
            </span>
        </p>
    ) : (
        <p role="status" className="text-xs text-tertiary">
            This is {spike.multiple}× the usual order of {spike.usual}.
        </p>
    );
};

const cover = (f?: Forecast) =>
    f?.daysOfCover === undefined ? "–" : f.daysOfCover === 0 ? "None left" : `~${f.daysOfCover} day${f.daysOfCover === 1 ? "" : "s"}`;

// ------------------------------------------------------------------------------------ screen

interface OrderNewScreenProps {
    location?: LocationId;
    /** Open on the success state (for stories). */
    created?: boolean;
    /** Starting quantities by item id, overriding the suggested ones (for stories). */
    quantities?: Record<string, number>;
}

export const OrderNewScreen = ({ location: initialLocation = "lynnfield", created: initialCreated = false, quantities }: OrderNewScreenProps) => {
    const [location, setLocationState] = useState<LocationId>(initialLocation);
    const [edits, setEdits] = useState<Record<string, { checked?: boolean; qty?: number }>>(() =>
        Object.fromEntries(Object.entries(quantities ?? {}).map(([id, qty]) => [id, { checked: true, qty }])),
    );
    const [addedIds, setAddedIds] = useState<string[]>([]);
    const [vendorFilter, setVendorFilter] = useState<VendorId | "all">("all");
    const [urgentOnly, setUrgentOnly] = useState(false);
    const [query, setQuery] = useState("");
    const [created, setCreated] = useState(initialCreated);
    /** Vendors whose "already on an order" lines are expanded. */
    const [showPending, setShowPending] = useState<VendorId[]>([]);

    const setLocation = (loc: LocationId) => {
        setLocationState(loc);
        setEdits({});
        setAddedIds([]);
        setVendorFilter("all");
        setCreated(false);
        setShowPending([]);
    };

    // ---- lines -----------------------------------------------------------------------------
    const pendingByItem = new Map<string, PurchaseOrder>();
    for (const po of purchaseOrders) {
        if (po.locationId !== location || !(po.status === "draft" || po.status === "awaiting-approval" || po.status === "approved")) continue;
        for (const l of po.lines) if (l.itemId) pendingByItem.set(l.itemId, po);
    }

    const suggested: BuilderLine[] = reorderSuggestions(location).map((r) => ({
        item: r.item,
        vendor: r.vendor,
        level: r.level,
        forecast: r.forecast,
        suggested: r.qty,
        reasons: reasonsFor(r.level, r.forecast, location),
        pending: pendingByItem.get(r.item.id),
    }));
    const suggestedIds = new Set(suggested.map((l) => l.item.id));
    const added: BuilderLine[] = addedIds
        .map((id) => items.find((i) => i.id === id))
        .filter((i): i is Item => Boolean(i) && !suggestedIds.has((i as Item).id))
        .map((item) => ({
            item,
            vendor: vendorById(item.vendorId),
            level: getStock(item.id, location),
            forecast: getForecast(item.id, location),
            suggested: 1,
            reasons: ["Added by you"],
            pending: pendingByItem.get(item.id),
            added: true,
        }));
    const all = [...added, ...suggested];

    const isChecked = (l: BuilderLine) => edits[l.item.id]?.checked ?? !l.pending;
    const qtyOf = (l: BuilderLine) => edits[l.item.id]?.qty ?? l.suggested;
    const patch = (id: string, p: { checked?: boolean; qty?: number }) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
    const lineTotal = (l: BuilderLine) => qtyOf(l) * (l.item.unitCost ?? 0);
    const isUrgent = (l: BuilderLine) => l.forecast?.daysOfCover !== undefined && l.forecast.daysOfCover < URGENT_DAYS;

    const vendorIds = [...new Set(all.map((l) => l.vendor.id))];
    const visible = all.filter((l) => (vendorFilter === "all" || l.vendor.id === vendorFilter) && (!urgentOnly || isUrgent(l)));
    const visibleVendors = vendorIds.filter((id) => visible.some((l) => l.vendor.id === id));

    const selected = all.filter(isChecked);
    const selectedVendors = vendorIds.filter((id) => selected.some((l) => l.vendor.id === id));
    const grandTotal = selected.reduce((sum, l) => sum + lineTotal(l), 0);
    const flagged = selected.filter((l) => spikeFor(l.item.id, qtyOf(l))?.wouldFlag).length;

    const cycle = TODAY.slice(0, 7);
    const existing = purchaseOrders.filter((po) => po.locationId === location && po.cycle === cycle && po.kind === "supply").length;
    const drafts = selectedVendors.map((id, i) => {
        const lines = selected.filter((l) => l.vendor.id === id);
        return {
            vendor: vendorById(id),
            number: `PO-${LOC_CODE[location]}-${cycle.slice(2, 4)}${cycle.slice(5, 7)}-S${existing + i + 1}`,
            lines: lines.length,
            units: lines.reduce((n, l) => n + qtyOf(l), 0),
            total: lines.reduce((sum, l) => sum + lineTotal(l), 0),
        };
    });

    // ---- add-item search -----------------------------------------------------------------
    const q = query.trim().toLowerCase();
    const inList = new Set(all.map((l) => l.item.id));
    const matches =
        q.length >= 2
            ? items
                  .filter((i) => !inList.has(i.id) && !i.discontinued && [i.name, i.brand, i.colorCode, i.sku].some((v) => v?.toLowerCase().includes(q)))
                  .slice(0, 6)
            : [];

    const createLabel = `Create ${drafts.length} draft order${drafts.length === 1 ? "" : "s"}`;
    const header = (
        <PageHeader
            eyebrow={
                <a
                    href={ROUTES.orders}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:min-h-0"
                >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Orders
                </a>
            }
            title={
                <>
                    New <em>order</em>
                </>
            }
            description={`What ${locationName(location)} needs for the ${formatMonth(cycle)} cycle, grouped by vendor. Untick or change anything, then create one draft per vendor.`}
        />
    );

    // ---- success -----------------------------------------------------------------------------
    if (created) {
        return (
            <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation}>
                <PageContent>
                    {header}
                    <Card className="flex flex-col gap-5 lg:p-8">
                        <div className="flex items-start gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-secondary text-fg-success-primary">
                                <CheckCircle className="size-5" aria-hidden="true" />
                            </span>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">
                                    {drafts.length} draft order{drafts.length === 1 ? "" : "s"} created
                                </h2>
                                <p className="text-sm text-tertiary">
                                    Nothing has been sent. Each draft can still be edited, then goes to the owner for approval before it is placed with the
                                    vendor.
                                </p>
                            </div>
                        </div>
                        <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                            {drafts.map((d) => (
                                <li key={d.vendor.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                    <div className="flex min-w-0 flex-col gap-1">
                                        <span className="flex flex-wrap items-center gap-2">
                                            <span className="text-md font-semibold text-primary">{d.number}</span>
                                            <OrderStatusBadge status="draft" />
                                        </span>
                                        <span className="text-sm text-secondary">
                                            {d.vendor.name} · {d.lines} line{d.lines === 1 ? "" : "s"}, {d.units} unit{d.units === 1 ? "" : "s"}
                                        </span>
                                        <span className="text-xs text-tertiary">{CHANNEL_NEXT[d.vendor.channel]}</span>
                                    </div>
                                    <span className="flex shrink-0 items-center gap-2 text-md font-semibold text-primary tabular-nums">
                                        {formatCurrency(d.total, true)} <SampleBadge />
                                    </span>
                                </li>
                            ))}
                        </ul>
                        {flagged > 0 && (
                            <p className="flex items-start gap-2 rounded-lg bg-warning-primary px-3 py-2.5 text-sm text-secondary">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                                {flagged} line{flagged === 1 ? " is" : "s are"} well above the usual order size. The owner will see that when approving.
                            </p>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <Button href={ROUTES.orders} color="primary" size="md">
                                Go to orders
                            </Button>
                            <Button
                                color="secondary"
                                size="md"
                                onClick={() => {
                                    setCreated(false);
                                    setEdits({});
                                    setAddedIds([]);
                                }}
                            >
                                Build another order
                            </Button>
                        </div>
                    </Card>
                    <SampleDataNote>Drafts are held in this browser tab only. Totals use sample unit costs.</SampleDataNote>
                </PageContent>
            </AppShell>
        );
    }

    // ---- builder -----------------------------------------------------------------------------
    const th = "px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-tertiary first:pl-4 last:pr-5";
    const td = "px-3 py-3 align-top first:pl-4 last:pr-5";

    const reasonBadges = (l: BuilderLine) => (
        <span className="flex flex-wrap gap-1">
            {l.reasons.map((r) => (
                <Badge
                    key={r}
                    type="color"
                    size="sm"
                    color={r === "Below reorder point" || r === "Half full or less" ? "warning" : r === "Added by you" ? "brand" : "gray"}
                >
                    {r}
                </Badge>
            ))}
        </span>
    );
    const pendingNote = (l: BuilderLine) =>
        l.pending && (
            <p className="text-xs text-tertiary">
                Already on{" "}
                <a
                    href={ROUTES.order(l.pending.id)}
                    className="rounded-sm font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                >
                    {l.pending.number}
                </a>{" "}
                ({l.pending.status === "draft" ? "draft" : l.pending.status === "approved" ? "approved, not sent" : "awaiting approval"}). Tick it only if more
                is needed.
            </p>
        );

    return (
        <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation}>
            <PageContent>
                {header}

                <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-6">
                    <div className="flex min-w-0 flex-col gap-4">
                        {/* Add an item that was not suggested */}
                        <Card className="flex flex-col gap-3">
                            <Input
                                aria-label="Add an item that is not on the list"
                                icon={SearchLg}
                                size="md"
                                placeholder="Add an item: search supplies, polish by name or colour code"
                                value={query}
                                onChange={setQuery}
                            />
                            {q.length >= 2 &&
                                (matches.length ? (
                                    <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                                        {matches.map((i) => (
                                            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                                                <ItemThumb item={i} size="sm" />
                                                <span className="flex min-w-0 flex-1 flex-col">
                                                    <span className="truncate text-sm font-medium text-primary">{i.name}</span>
                                                    <span className="truncate text-xs text-tertiary">
                                                        {[i.colorCode, i.category, vendorById(i.vendorId).name].filter(Boolean).join(" · ")}
                                                    </span>
                                                </span>
                                                <Button
                                                    color="secondary"
                                                    size="sm"
                                                    className="max-lg:min-h-11"
                                                    iconLeading={Plus}
                                                    onClick={() => {
                                                        setAddedIds((prev) => [i.id, ...prev]);
                                                        setQuery("");
                                                    }}
                                                >
                                                    Add
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-tertiary">
                                        Nothing in the catalogue matches &ldquo;{query.trim()}&rdquo;, or it is already on the list.
                                    </p>
                                ))}
                        </Card>

                        {/* Filters */}
                        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
                            <FilterLines className="hidden size-4 shrink-0 text-fg-quaternary lg:block" aria-hidden="true" />
                            <Chip isSelected={vendorFilter === "all"} onPress={() => setVendorFilter("all")}>
                                All vendors
                            </Chip>
                            {vendorIds.map((id) => (
                                <Chip key={id} isSelected={vendorFilter === id} onPress={() => setVendorFilter(vendorFilter === id ? "all" : id)}>
                                    {vendorById(id).name}
                                    <span className="text-xs text-tertiary tabular-nums">{all.filter((l) => l.vendor.id === id).length}</span>
                                </Chip>
                            ))}
                            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-secondary" />
                            <Chip isSelected={urgentOnly} onPress={() => setUrgentOnly((v) => !v)}>
                                Only urgent (under {URGENT_DAYS} days of cover)
                            </Chip>
                        </div>

                        {visible.length === 0 ? (
                            <Card className="py-10">
                                <EmptyState size="md">
                                    <EmptyState.Header pattern="none">
                                        <EmptyState.FeaturedIcon icon={CheckCircle} color="success" theme="light" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>{urgentOnly ? "Nothing urgent" : "Nothing to reorder"}</EmptyState.Title>
                                        <EmptyState.Description>
                                            {urgentOnly
                                                ? `No item here has under ${URGENT_DAYS} days of cover.`
                                                : "No item is below its reorder point. Search above to add something anyway."}
                                        </EmptyState.Description>
                                    </EmptyState.Content>
                                    {(urgentOnly || vendorFilter !== "all") && (
                                        <EmptyState.Footer>
                                            <Button
                                                color="secondary"
                                                size="md"
                                                onClick={() => {
                                                    setUrgentOnly(false);
                                                    setVendorFilter("all");
                                                }}
                                            >
                                                Clear filters
                                            </Button>
                                        </EmptyState.Footer>
                                    )}
                                </EmptyState>
                            </Card>
                        ) : (
                            visibleVendors.map((id) => {
                                const vendor = vendorById(id);
                                const vendorRows = visible.filter((l) => l.vendor.id === id);
                                // Lines already sitting on a draft or an order awaiting approval are tucked away so nothing is ordered twice by accident.
                                const pendingRows = vendorRows.filter((l) => l.pending && !isChecked(l));
                                const expanded = showPending.includes(id) || urgentOnly;
                                const rows = expanded ? vendorRows : vendorRows.filter((l) => !pendingRows.includes(l));
                                const pendingOrders = [...new Set(pendingRows.map((l) => l.pending as PurchaseOrder))];
                                const checkedRows = rows.filter(isChecked);
                                const subtotal = checkedRows.reduce((sum, l) => sum + lineTotal(l), 0);
                                return (
                                    <Card key={id} padded={false} className="overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-4 lg:px-5">
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <h2 className="text-md font-semibold text-primary">{vendor.name}</h2>
                                                <p className="text-sm text-tertiary">
                                                    {checkedRows.length} of {vendorRows.length} selected · about {vendor.leadTimeDays} days to arrive
                                                    {vendor.leadTimeIsEstimate ? " (estimate)" : ""}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-semibold text-primary tabular-nums">{formatCurrency(subtotal, true)}</span>
                                                <Checkbox
                                                    aria-label={`Select all ${vendor.name} lines`}
                                                    label={<span className="lg:sr-only">All</span>}
                                                    isSelected={checkedRows.length === rows.length}
                                                    isIndeterminate={checkedRows.length > 0 && checkedRows.length < rows.length}
                                                    onChange={(on) =>
                                                        setEdits((prev) => ({
                                                            ...prev,
                                                            ...Object.fromEntries(rows.map((l) => [l.item.id, { ...prev[l.item.id], checked: on }])),
                                                        }))
                                                    }
                                                    className="lg:hidden"
                                                />
                                            </div>
                                        </div>

                                        {/* Desktop table */}
                                        <table
                                            className={cx(
                                                "hidden w-full table-fixed border-t border-secondary text-left text-sm",
                                                rows.length > 0 && "lg:table",
                                            )}
                                        >
                                            <colgroup>
                                                <col className="w-11" />
                                                <col />
                                                <col className="w-24" />
                                                <col className="w-14" />
                                                <col className="w-24" />
                                                <col className="w-34" />
                                                <col className="w-28" />
                                            </colgroup>
                                            <thead className="border-b border-secondary bg-secondary">
                                                <tr>
                                                    <th scope="col" className={th}>
                                                        <Checkbox
                                                            aria-label={`Select all ${vendor.name} lines`}
                                                            isSelected={checkedRows.length === rows.length}
                                                            isIndeterminate={checkedRows.length > 0 && checkedRows.length < rows.length}
                                                            onChange={(on) =>
                                                                setEdits((prev) => ({
                                                                    ...prev,
                                                                    ...Object.fromEntries(rows.map((l) => [l.item.id, { ...prev[l.item.id], checked: on }])),
                                                                }))
                                                            }
                                                        />
                                                    </th>
                                                    <th scope="col" className={th}>
                                                        Item and why it is suggested
                                                    </th>
                                                    <th scope="col" className={th}>
                                                        On hand
                                                    </th>
                                                    <th scope="col" className={cx(th, "text-right")}>
                                                        Par
                                                    </th>
                                                    <th scope="col" className={th}>
                                                        Cover
                                                    </th>
                                                    <th scope="col" className={cx(th, "text-center")}>
                                                        Order
                                                    </th>
                                                    <th scope="col" className={cx(th, "text-right")}>
                                                        Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {rows.map((l) => {
                                                    const on = isChecked(l);
                                                    return (
                                                        <tr key={l.item.id} className={cx(!on && "bg-secondary")}>
                                                            <td className={cx(td, "pt-4")}>
                                                                <Checkbox
                                                                    aria-label={`Order ${l.item.name}`}
                                                                    isSelected={on}
                                                                    onChange={(v) => patch(l.item.id, { checked: v })}
                                                                />
                                                            </td>
                                                            <td className={td}>
                                                                <div className="flex gap-3">
                                                                    <ItemThumb item={l.item} size="md" className={cx(!on && "opacity-60")} />
                                                                    <div className="flex min-w-0 flex-col gap-1.5">
                                                                        <a
                                                                            href={ROUTES.item(l.item.id)}
                                                                            className={cx(
                                                                                "rounded-sm font-semibold outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2",
                                                                                on ? "text-primary" : "text-tertiary",
                                                                            )}
                                                                        >
                                                                            {l.item.name}
                                                                        </a>
                                                                        {reasonBadges(l)}
                                                                        {pendingNote(l)}
                                                                        {on && <SpikeNote itemId={l.item.id} qty={qtyOf(l)} />}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className={cx(td, "pt-4 text-secondary")}>
                                                                {l.level ? formatQty(l.level, l.item.unit) : "Not stocked"}
                                                            </td>
                                                            <td className={cx(td, "pt-4 text-right text-tertiary tabular-nums")}>{l.level?.par ?? "–"}</td>
                                                            <td
                                                                className={cx(
                                                                    td,
                                                                    "pt-4 tabular-nums",
                                                                    isUrgent(l) ? "font-medium text-error-primary" : "text-tertiary",
                                                                )}
                                                            >
                                                                {cover(l.forecast)}
                                                            </td>
                                                            <td className={cx(td, "text-center")}>
                                                                <QtyStepper
                                                                    value={qtyOf(l)}
                                                                    onChange={(v) => patch(l.item.id, { qty: v })}
                                                                    label={`Quantity of ${l.item.name}`}
                                                                    isDisabled={!on}
                                                                />
                                                            </td>
                                                            <td className={cx(td, "pt-3.5 text-right")}>
                                                                <span
                                                                    className={cx("block font-semibold tabular-nums", on ? "text-primary" : "text-quaternary")}
                                                                >
                                                                    {formatCurrency(lineTotal(l), true)}
                                                                </span>
                                                                <span className="block text-xs text-tertiary tabular-nums">
                                                                    {formatCurrency(l.item.unitCost ?? 0, true)} each
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {/* Phone rows */}
                                        <ul className={cx("divide-y divide-secondary border-t border-secondary lg:hidden", rows.length === 0 && "hidden")}>
                                            {rows.map((l) => {
                                                const on = isChecked(l);
                                                return (
                                                    <li key={l.item.id} className={cx("flex flex-col gap-3 p-4", !on && "bg-secondary")}>
                                                        <div className="flex items-start gap-3">
                                                            <div className="-m-2.5 flex size-11 shrink-0 items-center justify-center">
                                                                <Checkbox
                                                                    aria-label={`Order ${l.item.name}`}
                                                                    size="md"
                                                                    isSelected={on}
                                                                    onChange={(v) => patch(l.item.id, { checked: v })}
                                                                />
                                                            </div>
                                                            <ItemThumb item={l.item} size="md" className={cx(!on && "opacity-60")} />
                                                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                                <a
                                                                    href={ROUTES.item(l.item.id)}
                                                                    className={cx(
                                                                        "text-sm font-semibold outline-focus-ring focus-visible:outline-2",
                                                                        on ? "text-primary" : "text-tertiary",
                                                                    )}
                                                                >
                                                                    {l.item.name}
                                                                </a>
                                                                {reasonBadges(l)}
                                                            </div>
                                                        </div>
                                                        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
                                                            <div className="flex flex-col">
                                                                <dt className="text-xs text-tertiary">On hand</dt>
                                                                <dd className="font-medium text-secondary">
                                                                    {l.level ? formatQty(l.level, l.item.unit) : "Not stocked"}
                                                                </dd>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <dt className="text-xs text-tertiary">Par</dt>
                                                                <dd className="font-medium text-secondary tabular-nums">{l.level?.par ?? "–"}</dd>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <dt className="text-xs text-tertiary">Cover</dt>
                                                                <dd
                                                                    className={cx(
                                                                        "font-medium tabular-nums",
                                                                        isUrgent(l) ? "text-error-primary" : "text-secondary",
                                                                    )}
                                                                >
                                                                    {cover(l.forecast)}
                                                                </dd>
                                                            </div>
                                                        </dl>
                                                        {pendingNote(l)}
                                                        <div className="flex items-center justify-between gap-3">
                                                            <QtyStepper
                                                                value={qtyOf(l)}
                                                                onChange={(v) => patch(l.item.id, { qty: v })}
                                                                label={`Quantity of ${l.item.name}`}
                                                                isDisabled={!on}
                                                            />
                                                            <span className="text-right">
                                                                <span
                                                                    className={cx(
                                                                        "block text-sm font-semibold tabular-nums",
                                                                        on ? "text-primary" : "text-quaternary",
                                                                    )}
                                                                >
                                                                    {formatCurrency(lineTotal(l), true)}
                                                                </span>
                                                                <span className="block text-xs text-tertiary tabular-nums">
                                                                    {formatCurrency(l.item.unitCost ?? 0, true)} each, sample
                                                                </span>
                                                            </span>
                                                        </div>
                                                        {on && <SpikeNote itemId={l.item.id} qty={qtyOf(l)} />}
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        {pendingRows.length > 0 && !urgentOnly && (
                                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-secondary bg-secondary px-4 py-3 lg:px-5">
                                                <p className="text-sm text-tertiary">
                                                    <span className="font-medium text-secondary">
                                                        {pendingRows.length} more suggested item{pendingRows.length === 1 ? " is" : "s are"} already on{" "}
                                                        {pendingOrders.map((po, n) => (
                                                            <span key={po.id}>
                                                                {n > 0 && ", "}
                                                                <a
                                                                    href={ROUTES.order(po.id)}
                                                                    className="rounded-sm text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                                                >
                                                                    {po.number}
                                                                </a>
                                                            </span>
                                                        ))}
                                                    </span>{" "}
                                                    (
                                                    {pendingOrders[0]?.status === "draft"
                                                        ? "draft"
                                                        : pendingOrders[0]?.status === "approved"
                                                          ? "approved, not sent"
                                                          : "awaiting approval"}
                                                    ), so {pendingRows.length === 1 ? "it is" : "they are"} left off this order.
                                                </p>
                                                <Button
                                                    color="link-color"
                                                    size="sm"
                                                    className="max-lg:min-h-11"
                                                    onClick={() => setShowPending((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))}
                                                >
                                                    {expanded ? "Hide them" : "Show them"}
                                                </Button>
                                            </div>
                                        )}
                                    </Card>
                                );
                            })
                        )}

                        <SampleDataNote>
                            Items, par levels, vendors and the &ldquo;usual order&rdquo; come from Meraki&apos;s sheets and 2026 orders. On-hand quantities,
                            days of cover and unit costs are sample values
                            {location === "newburyport" ? ", and Newburyport's usage is estimated from Lynnfield's" : ""}. Days of cover is an estimate.
                        </SampleDataNote>
                    </div>

                    {/* Desktop summary */}
                    <aside className="hidden xl:sticky xl:top-6 xl:block">
                        <Card className="flex flex-col gap-4">
                            <div className="flex flex-col gap-0.5">
                                <h2 className="text-md font-semibold text-primary">
                                    {selected.length} line{selected.length === 1 ? "" : "s"} across {selectedVendors.length} vendor
                                    {selectedVendors.length === 1 ? "" : "s"}
                                </h2>
                                <p className="text-sm text-tertiary">One draft order per vendor.</p>
                            </div>
                            {drafts.length > 0 ? (
                                <ul className="flex flex-col gap-2 text-sm">
                                    {drafts.map((d) => (
                                        <li key={d.vendor.id} className="flex items-baseline justify-between gap-3">
                                            <span className="min-w-0 truncate text-secondary">
                                                {d.vendor.name} <span className="text-tertiary">· {d.lines}</span>
                                            </span>
                                            <span className="font-medium text-primary tabular-nums">{formatCurrency(d.total, true)}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-tertiary">Tick at least one line to create an order.</p>
                            )}
                            <div className="flex items-baseline justify-between gap-3 border-t border-secondary pt-3">
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-secondary">
                                    Estimated total <SampleBadge />
                                </span>
                                <span className="text-lg font-semibold text-primary tabular-nums">{formatCurrency(grandTotal, true)}</span>
                            </div>
                            {flagged > 0 && (
                                <p className="flex items-start gap-1.5 text-xs font-medium text-warning-primary">
                                    <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                                    {flagged} line{flagged === 1 ? " is" : "s are"} well above the usual order size.
                                </p>
                            )}
                            <Button color="primary" size="lg" isDisabled={drafts.length === 0} onClick={() => setCreated(true)}>
                                {createLabel}
                            </Button>
                            <p className="text-xs text-tertiary">Drafts go to the owner for approval. Nothing is sent to a vendor yet.</p>
                        </Card>
                    </aside>
                </div>

                {/* Phone and tablet summary */}
                <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col gap-2 rounded-xl bg-primary/95 p-3 shadow-lg ring-1 ring-secondary backdrop-blur lg:bottom-4 xl:hidden">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-semibold text-primary">
                            {selected.length} line{selected.length === 1 ? "" : "s"} across {selectedVendors.length} vendor
                            {selectedVendors.length === 1 ? "" : "s"}
                        </span>
                        <span className="flex items-center gap-1.5 font-semibold text-primary tabular-nums">
                            {formatCurrency(grandTotal, true)} <SampleBadge />
                        </span>
                    </div>
                    <Button color="primary" size="lg" className="w-full" isDisabled={drafts.length === 0} onClick={() => setCreated(true)}>
                        {createLabel}
                    </Button>
                </div>
            </PageContent>
        </AppShell>
    );
};
