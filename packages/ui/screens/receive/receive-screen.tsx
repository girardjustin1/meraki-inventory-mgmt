"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, ChevronDown, Lock01, PackageCheck, Truck01, Users01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { TextArea } from "@/components/base/textarea/textarea";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { QuantityStepper } from "@/components/meraki/quantity-stepper";
import { StatCard, StatGrid } from "@/components/meraki/stat-card";
import { OrderStatusBadge, RealDataBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, getItem, getPurchaseOrder, locationName, purchaseOrders, userById, users, vendorById } from "@/data/inventory";
import type { LocationId, PurchaseOrder, PurchaseOrderLine, User } from "@/data/types";
import { daysBetween, formatDate } from "@/engine/dates";
import { FLAG_THRESHOLDS } from "@/engine/flags";
import { can } from "@/engine/permissions";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

export interface ReceiveScreenProps {
    location?: LocationId;
    /** Open straight into one order. Without it the screen lists the open orders. */
    orderId?: string;
    /** The person receiving. Defaults to the front desk for the location. */
    user?: User;
    /** Start with a realistic part-delivery already entered. Used by stories. */
    prefill?: "none" | "partial";
}

type RejectReason = "damaged" | "wrong-item";

interface LineEntry {
    accept: number;
    reject: number;
    reason: RejectReason;
    /** Polish only: the type that actually arrived, when it differs from the order. */
    variant?: string;
    variantOpen?: boolean;
    note?: string;
    noteOpen?: boolean;
}

const EMPTY: LineEntry = { accept: 0, reject: 0, reason: "damaged" };
const VARIANTS = ["Regular", "Gel", "Dip"];
const PAGE = 20;

const isOpen = (po: PurchaseOrder) => po.status === "sent" || po.status === "partially-received";
const realLines = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0);
const outstanding = (l: PurchaseOrderLine) => Math.max(0, l.qtyOrdered - l.qtyReceived);
const frontDesk = (location: LocationId) => users.find((u) => u.role === "front-desk" && u.locations.includes(location)) ?? CURRENT_USER;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Open order lines older than max(21 days, twice the vendor's lead time) count as overdue. Same rule as the flag engine. */
const overdueAfter = (po: PurchaseOrder) => Math.max(FLAG_THRESHOLDS.overdueReceiptDays, 2 * vendorById(po.vendorId).leadTimeDays);
const ageDays = (po: PurchaseOrder) => daysBetween(po.createdAt, TODAY);

const Notice = ({ tone, icon: Icon, title, children }: { tone: "info" | "warning"; icon: typeof Lock01; title: string; children: ReactNode }) => (
    <div
        className={cx(
            "flex items-start gap-3 rounded-xl p-4 ring-1 ring-inset",
            tone === "warning" ? "bg-warning-primary ring-utility-yellow-200" : "bg-secondary ring-secondary",
        )}
    >
        <Icon className={cx("mt-0.5 size-5 shrink-0", tone === "warning" ? "text-fg-warning-primary" : "text-fg-quaternary")} aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-sm font-semibold text-primary">{title}</p>
            <p className="text-sm text-secondary">{children}</p>
        </div>
    </div>
);

// ------------------------------------------------------------------------------------ order list

const OrderList = ({ location, user, onOpen }: { location: LocationId; user: User; onOpen: (id: string) => void }) => {
    const open = purchaseOrders.filter((po) => po.locationId === location && isOpen(po));
    const linesToCome = open.reduce((n, po) => n + realLines(po).filter((l) => outstanding(l) > 0).length, 0);
    const overdue = open.filter((po) => ageDays(po) > overdueAfter(po));

    return (
        <>
            <PageHeader
                title={
                    <>
                        Receive a <em>delivery</em>
                    </>
                }
                description={`${locationName(location)}. Pick the order the box belongs to, then check each line against what arrived.`}
            />

            <StatGrid columns={3}>
                <StatCard label="Open orders" value={open.length} hint="Sent or partly received" icon={Truck01} />
                <StatCard label="Lines still to come" value={linesToCome} hint="Across all open orders" icon={PackageCheck} />
                <StatCard
                    label="Overdue"
                    value={overdue.length}
                    tone={overdue.length ? "warning" : "good"}
                    hint={overdue.length ? "Older than expected" : "Nothing late"}
                    icon={AlertTriangle}
                    className="max-lg:col-span-2"
                />
            </StatGrid>

            {open.length === 0 ? (
                <p className="rounded-xl bg-primary px-4 py-10 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">
                    No deliveries are expected at {locationName(location)}.
                </p>
            ) : (
                <ul className="flex flex-col gap-3" aria-label="Open orders">
                    {open.map((po) => {
                        const lines = realLines(po);
                        const got = lines.filter((l) => outstanding(l) === 0).length;
                        const late = ageDays(po) > overdueAfter(po);
                        const own = po.createdBy === user.id;
                        return (
                            <li
                                key={po.id}
                                className="flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset lg:flex-row lg:items-center lg:gap-6 lg:p-5"
                            >
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-md font-semibold text-primary">{vendorById(po.vendorId).name}</h2>
                                        <OrderStatusBadge status={po.status} />
                                        {late && (
                                            <Badge type="pill-color" color="error" size="sm">
                                                Overdue
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-tertiary">
                                        {po.number} · {po.kind === "polish" ? "Polish" : "Supplies"} · Placed {formatDate(po.createdAt, true)}
                                    </p>
                                    <p className="text-sm text-tertiary">
                                        <span className={cx("font-medium", late ? "text-error-primary" : "text-secondary")}>
                                            {plural(ageDays(po), "day")} old
                                        </span>
                                        {late ? `, expected within ${overdueAfter(po)} days` : ""}
                                    </p>
                                </div>
                                <div className="flex flex-col gap-1.5 lg:w-56">
                                    <ProgressBarBase value={got} max={Math.max(lines.length, 1)} />
                                    <p className="text-sm text-tertiary">
                                        <span className="font-semibold text-secondary tabular-nums">
                                            {got} of {lines.length}
                                        </span>{" "}
                                        lines received
                                    </p>
                                </div>
                                <div className="flex flex-col gap-1 lg:w-40 lg:items-end">
                                    <Button
                                        size="lg"
                                        color="secondary"
                                        iconLeading={own ? Lock01 : undefined}
                                        iconTrailing={own ? undefined : ArrowRight}
                                        onClick={() => onOpen(po.id)}
                                        className="w-full lg:w-auto"
                                    >
                                        {own ? "View" : "Receive"}
                                    </Button>
                                    {own && <p className="text-xs text-tertiary">You placed this order</p>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <SampleDataNote>
                Orders, quantities and received dates come from Meraki&apos;s 2026 order sheets. Staff names are sample values, and the &quot;placed by&quot;
                person is assumed.
            </SampleDataNote>
        </>
    );
};

// ------------------------------------------------------------------------------------ one line

interface LineCardProps {
    line: PurchaseOrderLine;
    entry: LineEntry;
    polish: boolean;
    disabled: boolean;
    onChange: (patch: Partial<LineEntry>) => void;
}

const LineCard = ({ line, entry, polish, disabled, onChange }: LineCardProps) => {
    const item = line.itemId ? getItem(line.itemId) : undefined;
    const out = outstanding(line);
    const total = line.qtyReceived + entry.accept;
    const scale = Math.max(line.qtyOrdered, total + entry.reject, 1);
    const over = total > line.qtyOrdered;
    const complete = total === line.qtyOrdered;
    const touched = entry.accept > 0 || entry.reject > 0;
    const variantChanged = Boolean(entry.variant && line.variant && entry.variant !== line.variant);

    return (
        <li
            className={cx(
                "flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-inset",
                over ? "ring-2 ring-utility-yellow-200" : "ring-secondary",
            )}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <ItemThumb item={item ?? { name: line.name, kind: "supply" }} size="lg" />
                        <div className="min-w-0 flex-1">
                            <p className="text-md font-semibold text-primary">{line.name}</p>
                            <p className="text-sm text-tertiary">
                                {[
                                    line.colorCode,
                                    line.variant ? `Ordered as ${line.variant}` : undefined,
                                    line.itemId ? undefined : "Not matched to a catalogue item",
                                ]
                                    .filter(Boolean)
                                    .join(" · ") ||
                                    (item?.category ?? "Supply")}
                            </p>
                        </div>
                        {touched &&
                            (over ? (
                                <Badge type="pill-color" color="warning" size="sm">
                                    Over
                                </Badge>
                            ) : complete ? (
                                <Badge type="pill-color" color="success" size="sm">
                                    Complete
                                </Badge>
                            ) : (
                                <Badge type="pill-color" color="gray" size="sm">
                                    Short
                                </Badge>
                            ))}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div
                            role="img"
                            aria-label={`${total} of ${line.qtyOrdered} received${entry.reject ? `, ${entry.reject} rejected` : ""}`}
                            className="flex h-2 w-full overflow-hidden rounded-md bg-quaternary"
                        >
                            <span className="bg-fg-success-secondary" style={{ width: `${(line.qtyReceived / scale) * 100}%` }} />
                            <span className={over ? "bg-fg-warning-secondary" : "bg-fg-brand-primary"} style={{ width: `${(entry.accept / scale) * 100}%` }} />
                            <span className="bg-fg-error-secondary" style={{ width: `${(entry.reject / scale) * 100}%` }} />
                        </div>
                        <p className="text-sm text-tertiary">
                            <span className="font-semibold text-secondary tabular-nums">
                                {total} of {line.qtyOrdered}
                            </span>{" "}
                            received
                            {line.qtyReceived > 0 ? ` (${line.qtyReceived} earlier${line.receivedAt ? `, ${formatDate(line.receivedAt)}` : ""})` : ""}
                            {entry.reject > 0 ? `, ${entry.reject} rejected` : ""}
                            {!touched && out > 0 ? ` · ${out} to come` : ""}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:w-80 lg:shrink-0">
                    <div className="flex flex-col gap-1">
                        <div className="flex min-h-11 items-center justify-between gap-2">
                            <span className="text-sm font-medium text-secondary">Accept</span>
                            <Button
                                size="sm"
                                color="secondary"
                                className="min-h-9"
                                isDisabled={disabled || entry.accept === Math.max(0, out - entry.reject)}
                                onClick={() => onChange({ accept: Math.max(0, out - entry.reject) })}
                                aria-label={`Accept all ${out} of ${line.name}`}
                            >
                                All
                            </Button>
                        </div>
                        <QuantityStepper
                            size="md"
                            label={`Accepted quantity of ${line.name}`}
                            value={entry.accept}
                            onChange={(accept) => onChange({ accept })}
                            isDisabled={disabled}
                            className="flex w-full"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <div className="flex min-h-11 items-center justify-between gap-2">
                            <span className="text-sm font-medium text-secondary">Reject</span>
                            <span className="text-xs text-tertiary max-sm:hidden">Damaged or wrong</span>
                        </div>
                        <QuantityStepper
                            size="md"
                            label={`Rejected quantity of ${line.name}`}
                            value={entry.reject}
                            onChange={(reject) => onChange({ reject })}
                            max={line.qtyOrdered}
                            isDisabled={disabled}
                            className="flex w-full"
                        />
                    </div>
                </div>
            </div>

            {entry.reject > 0 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Why ${line.name} was rejected`}>
                    <span className="text-sm text-tertiary">Rejected because</span>
                    {(["damaged", "wrong-item"] as const).map((r) => (
                        <button
                            key={r}
                            type="button"
                            aria-pressed={entry.reason === r}
                            disabled={disabled}
                            onClick={() => onChange({ reason: r })}
                            className={cx(
                                "min-h-11 rounded-full px-4 text-sm font-semibold ring-1 outline-focus-ring ring-inset focus-visible:outline-2 lg:min-h-9",
                                entry.reason === r
                                    ? "bg-error-primary text-error-primary ring-error_subtle"
                                    : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                            )}
                        >
                            {r === "damaged" ? "Damaged" : "Wrong item"}
                        </button>
                    ))}
                </div>
            )}

            {over && (
                <p className="flex items-start gap-2 text-sm font-medium text-warning-primary">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {total - line.qtyOrdered} more than ordered. It can be saved, and a flag is raised so a manager can check the invoice.
                </p>
            )}

            {polish && line.variantReceived && <p className="text-sm text-tertiary">Earlier delivery arrived as {line.variantReceived}.</p>}

            {entry.variantOpen && (
                <div className="flex flex-col gap-2 rounded-lg bg-secondary p-3">
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Type of ${line.name} that arrived`}>
                        <span className="text-sm font-medium text-secondary">Type that arrived</span>
                        {VARIANTS.map((v) => (
                            <button
                                key={v}
                                type="button"
                                aria-pressed={entry.variant === v}
                                disabled={disabled}
                                onClick={() => onChange({ variant: entry.variant === v ? undefined : v })}
                                className={cx(
                                    "min-h-11 rounded-full px-4 text-sm font-semibold ring-1 outline-focus-ring ring-inset focus-visible:outline-2 lg:min-h-9",
                                    entry.variant === v
                                        ? "bg-brand-solid text-white ring-transparent"
                                        : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                                )}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                    {variantChanged && (
                        <p className="text-sm text-warning-primary">
                            Ordered as {line.variant}, arrived as {entry.variant}. Saved as a type mismatch so the order form can be corrected.
                        </p>
                    )}
                </div>
            )}

            {entry.noteOpen && (
                <TextArea
                    aria-label={`Note for ${line.name}`}
                    placeholder="Anything the person who ordered should know"
                    rows={2}
                    value={entry.note ?? ""}
                    onChange={(note) => onChange({ note })}
                    isDisabled={disabled}
                />
            )}

            <div className="-mb-2 flex flex-wrap items-center gap-1 lg:mb-0">
                {polish && (
                    <Button
                        size="md"
                        color="tertiary"
                        className="min-h-11 lg:min-h-0"
                        isDisabled={disabled}
                        onClick={() => onChange({ variantOpen: !entry.variantOpen })}
                    >
                        {entry.variantOpen ? "Hide type" : entry.variant ? `Arrived as ${entry.variant}` : "Different type arrived"}
                    </Button>
                )}
                <Button
                    size="md"
                    color="tertiary"
                    className="min-h-11 lg:min-h-0"
                    isDisabled={disabled}
                    onClick={() => onChange({ noteOpen: !entry.noteOpen })}
                >
                    {entry.noteOpen ? "Hide note" : entry.note ? "Edit note" : "Add note"}
                </Button>
            </div>
        </li>
    );
};

// ------------------------------------------------------------------------------------ one order

/** A believable part-delivery for stories: mostly complete, one line short with a damaged unit, one over, one wrong type. */
const prefillEntries = (lines: PurchaseOrderLine[]): Record<string, LineEntry> => {
    const pool = lines.slice(0, 6);
    const shortLine = pool.find((l) => outstanding(l) >= 2) ?? pool[1];
    const rest = pool.filter((l) => l !== shortLine);
    const overLine = rest[1];
    const variantLine = rest.find((l) => l !== overLine && l.variant && VARIANTS.includes(l.variant));
    const out: Record<string, LineEntry> = {};
    for (const l of pool) {
        const left = outstanding(l);
        if (l === shortLine)
            out[l.id] = { ...EMPTY, accept: Math.max(0, left - 1), reject: 1, reason: "damaged", note: "One arrived with a cracked cap.", noteOpen: true };
        else if (l === overLine) out[l.id] = { ...EMPTY, accept: left + 1 };
        else if (l === variantLine) out[l.id] = { ...EMPTY, accept: left, variant: l.variant === "Gel" ? "Regular" : "Gel", variantOpen: true };
        else out[l.id] = { ...EMPTY, accept: left };
    }
    return out;
};

const ReceiveOrder = ({ po, user, prefill, onBack }: { po: PurchaseOrder; user: User; prefill: boolean; onBack: () => void }) => {
    const vendor = vendorById(po.vendorId);
    const creator = userById(po.createdBy);
    const blocked = po.createdBy === user.id;
    const polish = po.kind === "polish";

    const receivable = po.lines.filter((l) => l.qtyOrdered > 0 && outstanding(l) > 0);
    const done = po.lines.filter((l) => l.qtyOrdered > 0 && outstanding(l) === 0);
    const requests = po.lines.filter((l) => l.qtyOrdered === 0);

    const [entries, setEntries] = useState<Record<string, LineEntry>>(() => (prefill && !blocked ? prefillEntries(receivable) : {}));
    const [visible, setVisible] = useState(PAGE);
    const [saved, setSaved] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const [showRequests, setShowRequests] = useState(false);

    const entryOf = (id: string) => entries[id] ?? EMPTY;
    const patch = (id: string, change: Partial<LineEntry>) => setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...change } }));
    const receiveAll = () =>
        setEntries((all) =>
            Object.fromEntries(receivable.map((l) => [l.id, { ...(all[l.id] ?? EMPTY), accept: Math.max(0, outstanding(l) - (all[l.id]?.reject ?? 0)) }])),
        );

    const stats = receivable.map((l) => {
        const e = entryOf(l.id);
        const total = l.qtyReceived + e.accept;
        return {
            line: l,
            entry: e,
            touched: e.accept > 0 || e.reject > 0,
            complete: total === l.qtyOrdered,
            over: total > l.qtyOrdered,
            short: (e.accept > 0 || e.reject > 0) && total < l.qtyOrdered,
        };
    });
    const complete = stats.filter((s) => s.touched && s.complete).length;
    const short = stats.filter((s) => s.short).length;
    const over = stats.filter((s) => s.over).length;
    const untouched = stats.filter((s) => !s.touched).length;
    const unitsAccepted = stats.reduce((n, s) => n + s.entry.accept, 0);
    const unitsRejected = stats.reduce((n, s) => n + s.entry.reject, 0);
    const mismatched = stats.filter((s) => s.entry.variant && s.line.variant && s.entry.variant !== s.line.variant).length;
    const flags = over + mismatched;
    const stillOpen = stats.filter((s) => !s.complete && !s.over).length;
    const allReceived = complete === receivable.length && receivable.length > 0;
    const others = users.filter((u) => u.id !== po.createdBy && u.role !== "owner" && can(u, "orders.receive", po.locationId)).slice(0, 2);

    const back = (
        <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-1.5 rounded outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2 lg:min-h-0"
        >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Deliveries
        </button>
    );

    if (saved) {
        return (
            <PageContent>
                <PageHeader
                    eyebrow={back}
                    title={
                        <>
                            Receipt <em>saved</em>
                        </>
                    }
                    description={`${po.number} · ${vendor.name}`}
                />
                <section className="flex flex-col gap-5 rounded-2xl bg-primary p-5 shadow-xs ring-1 ring-secondary ring-inset lg:p-8">
                    <div className="flex items-start gap-4">
                        <FeaturedIcon icon={CheckCircle} color="success" theme="light" size="lg" />
                        <div className="flex min-w-0 flex-col gap-1">
                            <h2 className="text-xl font-semibold text-primary">
                                {allReceived && short === 0 ? "Everything on this order is in" : "Saved. The order stays open"}
                            </h2>
                            <p className="text-md text-tertiary">
                                Received by {user.name} on {formatDate(TODAY, true)}.{" "}
                                {allReceived
                                    ? `${po.number} is now marked Received.`
                                    : `${po.number} is Partially received, with ${plural(stillOpen, "line")} still to come.`}
                            </p>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                            { label: "Units added to stock", value: unitsAccepted, tone: "text-primary" },
                            { label: "Lines complete", value: complete, tone: "text-primary" },
                            { label: "Lines short", value: short, tone: short ? "text-warning-primary" : "text-primary" },
                            { label: "Units rejected", value: unitsRejected, tone: unitsRejected ? "text-error-primary" : "text-primary" },
                        ].map((s) => (
                            <div key={s.label} className="rounded-xl bg-secondary p-3">
                                <dt className="text-xs font-medium text-tertiary">{s.label}</dt>
                                <dd className={cx("text-display-xs font-semibold tabular-nums", s.tone)}>{s.value}</dd>
                            </div>
                        ))}
                    </dl>
                    <ul className="flex flex-col gap-2 text-sm text-secondary">
                        {flags > 0 && (
                            <li className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                                {plural(flags, "flag")} raised for a manager:{" "}
                                {[
                                    over ? `${plural(over, "line")} with more accepted than ordered` : "",
                                    mismatched ? `${plural(mismatched, "line")} that arrived as a different type` : "",
                                ]
                                    .filter(Boolean)
                                    .join(", ")}
                                .
                            </li>
                        )}
                        {unitsRejected > 0 && (
                            <li className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                                {creator?.name ?? "The person who ordered"} gets a follow-up for the {plural(unitsRejected, "rejected unit")}.
                            </li>
                        )}
                        <li className="flex items-start gap-2">
                            <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                            Put each item away on its shelf now. Stock that is received but not shelved is where things go missing.
                        </li>
                    </ul>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Button size="xl" color="primary" onClick={onBack}>
                            Back to deliveries
                        </Button>
                        <Button size="xl" color="secondary" href={ROUTES.order(po.id)}>
                            View order
                        </Button>
                        <Button size="xl" color="tertiary" onClick={() => setSaved(false)}>
                            Undo and edit
                        </Button>
                    </div>
                </section>
            </PageContent>
        );
    }

    const canSave = !blocked && (unitsAccepted > 0 || unitsRejected > 0);

    return (
        <>
            <PageContent>
                <PageHeader
                    eyebrow={back}
                    title={
                        <>
                            Receive <em>delivery</em>
                        </>
                    }
                    description={
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {po.number} · {vendor.name} · Placed {formatDate(po.createdAt, true)}
                            <OrderStatusBadge status={po.status} />
                            {po.imported && <RealDataBadge />}
                        </span>
                    }
                    actions={
                        <>
                            <Button size="lg" color="secondary" isDisabled={blocked || receivable.length === 0} onClick={receiveAll} className="max-lg:w-full">
                                Receive all
                            </Button>
                            <Button size="lg" color="primary" isDisabled={!canSave} onClick={() => setSaved(true)} className="max-lg:hidden">
                                Save receipt
                            </Button>
                        </>
                    }
                />

                {blocked ? (
                    <Notice tone="warning" icon={Lock01} title="You placed this order, so you cannot receive it">
                        A delivery is checked in by someone other than the person who ordered it.{" "}
                        {others.length > 0 ? `Ask ${others.map((u) => u.name).join(" or ")} to receive it.` : "Ask another team member to receive it."}
                    </Notice>
                ) : (
                    <Notice tone="info" icon={Users01} title={`Ordered by ${creator?.name ?? "a manager"}, received by ${user.name}`}>
                        The person who places an order cannot receive it, so two people see every delivery. Enter what is in the box, not what the order says.
                    </Notice>
                )}

                {receivable.length === 0 ? (
                    <p className="rounded-xl bg-primary px-4 py-10 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">
                        Every line with a quantity has been received.
                    </p>
                ) : (
                    <section className="flex flex-col gap-3" aria-label="Lines to receive">
                        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
                            To receive
                            <Badge type="modern" color="gray" size="sm">
                                {receivable.length}
                            </Badge>
                        </h2>
                        <ul className="flex flex-col gap-3">
                            {receivable.slice(0, visible).map((line) => (
                                <LineCard
                                    key={line.id}
                                    line={line}
                                    entry={entryOf(line.id)}
                                    polish={polish}
                                    disabled={blocked}
                                    onChange={(change) => patch(line.id, change)}
                                />
                            ))}
                        </ul>
                        {receivable.length > visible && (
                            <Button size="lg" color="secondary" className="self-center" onClick={() => setVisible((v) => v + PAGE)}>
                                Show {Math.min(PAGE, receivable.length - visible)} more of {receivable.length}
                            </Button>
                        )}
                    </section>
                )}

                {done.length > 0 && (
                    <section className="rounded-xl bg-primary ring-1 ring-secondary ring-inset" aria-label="Already received">
                        <button
                            type="button"
                            aria-expanded={showDone}
                            onClick={() => setShowDone((s) => !s)}
                            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-sm font-semibold text-secondary outline-focus-ring focus-visible:outline-2"
                        >
                            Already received ({done.length})
                            <ChevronDown
                                className={cx("size-5 text-fg-quaternary transition duration-100 ease-linear", showDone && "rotate-180")}
                                aria-hidden="true"
                            />
                        </button>
                        {showDone && (
                            <ul className="divide-y divide-secondary border-t border-secondary">
                                {done.slice(0, 80).map((l) => (
                                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                        <span className="min-w-0 truncate text-primary">{l.name}</span>
                                        <span className="shrink-0 text-tertiary tabular-nums">
                                            {l.qtyReceived} of {l.qtyOrdered}
                                            {l.receivedAt ? ` · ${formatDate(l.receivedAt)}` : ""}
                                        </span>
                                    </li>
                                ))}
                                {done.length > 80 && <li className="px-4 py-2.5 text-sm text-tertiary">and {done.length - 80} more</li>}
                            </ul>
                        )}
                    </section>
                )}

                {requests.length > 0 && (
                    <section className="rounded-xl bg-primary ring-1 ring-secondary ring-inset" aria-label="Requests without a quantity">
                        <button
                            type="button"
                            aria-expanded={showRequests}
                            onClick={() => setShowRequests((s) => !s)}
                            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left text-sm font-semibold text-secondary outline-focus-ring focus-visible:outline-2"
                        >
                            Requests written on the form without a quantity ({requests.length})
                            <ChevronDown
                                className={cx("size-5 shrink-0 text-fg-quaternary transition duration-100 ease-linear", showRequests && "rotate-180")}
                                aria-hidden="true"
                            />
                        </button>
                        {showRequests && (
                            <ul className="divide-y divide-secondary border-t border-secondary">
                                {requests.slice(0, 80).map((l) => (
                                    <li key={l.id} className="px-4 py-2.5 text-sm text-primary">
                                        {l.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}

                <SampleDataNote>
                    Order lines, quantities and earlier receipts come from Meraki&apos;s 2026 order sheets. Staff names are sample values, and the &quot;ordered
                    by&quot; person is assumed.
                </SampleDataNote>
            </PageContent>

            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-secondary bg-primary/95 backdrop-blur after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-primary lg:bottom-0 lg:after:hidden">
                <div className="mx-auto flex w-full max-w-container flex-col gap-2 px-4 py-3 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-secondary tabular-nums" role="status">
                            <span>
                                <span className="font-semibold text-success-primary">{complete}</span> complete
                            </span>
                            <span>
                                <span className={cx("font-semibold", short ? "text-primary" : "text-tertiary")}>{short}</span> short
                            </span>
                            <span>
                                <span className={cx("font-semibold", over ? "text-warning-primary" : "text-tertiary")}>{over}</span> over
                            </span>
                            <span className="text-tertiary">{untouched} not started</span>
                        </p>
                        {over > 0 && (
                            <p className="flex items-start gap-1.5 text-sm font-medium text-warning-primary">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                {plural(over, "line has", "lines have")} more accepted than ordered. Saving raises a flag for a manager to check.
                            </p>
                        )}
                    </div>
                    <Button size="xl" color="primary" isDisabled={!canSave} onClick={() => setSaved(true)} className="w-full lg:w-auto lg:shrink-0">
                        {blocked
                            ? "Someone else has to receive this"
                            : untouched === receivable.length
                              ? "Save receipt"
                              : `Save receipt: ${plural(unitsAccepted, "unit")} in`}
                    </Button>
                </div>
            </div>
        </>
    );
};

/**
 * Receiving a delivery.
 * Front desk picks the open order, then enters an accepted and a rejected quantity per line.
 * A short delivery keeps the order open; the person who placed the order cannot receive it.
 */
export const ReceiveScreen = ({ location: initialLocation = "lynnfield", orderId: initialOrderId, user: userProp, prefill = "none" }: ReceiveScreenProps) => {
    const initialOrder = initialOrderId ? getPurchaseOrder(initialOrderId) : undefined;
    const [location, setLocation] = useState<LocationId>(initialOrder?.locationId ?? initialLocation);
    const [orderId, setOrderId] = useState<string | undefined>(initialOrder?.id);
    useUrlSync({ order: orderId });
    const user = userProp ?? frontDesk(location);
    const po = orderId ? getPurchaseOrder(orderId) : undefined;

    const changeLocation = (next: LocationId) => {
        setLocation(next);
        setOrderId(undefined);
    };

    return (
        <AppShell activeUrl={ROUTES.receive} location={location} onLocationChange={changeLocation} user={user}>
            {po ? (
                <ReceiveOrder
                    key={po.id}
                    po={po}
                    user={user}
                    prefill={prefill === "partial" && po.id === initialOrder?.id}
                    onBack={() => setOrderId(undefined)}
                />
            ) : (
                <PageContent>
                    <OrderList location={location} user={user} onOpen={setOrderId} />
                </PageContent>
            )}
        </AppShell>
    );
};
