"use client";

import { useState } from "react";
import { Check, ChevronRight, Plus } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { OrderProgress, receivedLineCount } from "@/components/meraki/order-progress";
import { OrderStatusBadge, SampleBadge } from "@/components/meraki/status-badges";
import { TODAY, locationName, orderTotal, purchaseOrders, vendorById } from "@/data/inventory";
import type { LocationId, PurchaseOrder, PurchaseOrderStatus } from "@/data/types";
import { formatDate, formatMonth } from "@/engine/dates";
import { formatCurrency } from "@/engine/stock";
import { cx } from "@/utils/cx";

export type OrdersTab = "action" | "open" | "received" | "all";

const TAB_STATUSES: Record<OrdersTab, PurchaseOrderStatus[] | null> = {
    action: ["draft", "awaiting-approval", "approved"],
    open: ["sent", "partially-received"],
    received: ["received"],
    all: null,
};
const TAB_LABEL: Record<OrdersTab, string> = { action: "Needs action", open: "Open", received: "Received", all: "All" };
const TABS: OrdersTab[] = ["action", "open", "received", "all"];

const inTab = (po: PurchaseOrder, tab: OrdersTab) => TAB_STATUSES[tab]?.includes(po.status) ?? true;
const notSent = (po: PurchaseOrder) => po.status === "draft" || po.status === "awaiting-approval" || po.status === "approved";
const KIND_LABEL: Record<PurchaseOrder["kind"], string> = { supply: "Supplies", polish: "Polish" };

const placed = (po: PurchaseOrder) => {
    if (notSent(po)) return "Not placed";
    const day = po.sentAt ?? po.createdAt;
    return formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));
};

/** Lines with a quantity but no unit cost: free-text requests and rows not matched to the catalogue. */
const unpricedLines = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0 && l.unitCost === undefined).length;

const ImportedBadge = () => (
    <Badge type="modern" color="gray" size="sm">
        Imported
    </Badge>
);

const Total = ({ po, align = "right" }: { po: PurchaseOrder; align?: "left" | "right" }) => {
    const total = orderTotal(po);
    const unpriced = unpricedLines(po);
    return (
        <span className={cx("flex flex-col", align === "right" ? "items-end" : "items-start")}>
            <span className="font-medium text-primary tabular-nums">{total > 0 ? formatCurrency(total) : "No costs yet"}</span>
            {unpriced > 0 && total > 0 && (
                <span className="text-xs text-tertiary">
                    {unpriced} line{unpriced === 1 ? "" : "s"} unpriced
                </span>
            )}
        </span>
    );
};

// ------------------------------------------------------------------------------------ monthly cycle

const CYCLE_STEPS = [
    { title: "Count", when: "By the 25th", body: "Managers count stock and tick what needs ordering." },
    { title: "Order", when: "First week of the month", body: "One order per vendor, approved by the owner." },
    { title: "Receive", when: "As deliveries arrive", body: "Each delivery is checked against its order." },
    { title: "Backlog", when: "After receiving", body: "What arrived, and when, is logged on the order." },
] as const;

/** Where this month's cycle stands, worked out from the orders themselves. */
const cycleStep = (orders: PurchaseOrder[]): { step: number; note: string } => {
    const month = TODAY.slice(0, 7);
    const day = Number(TODAY.slice(8, 10));
    const current = orders.filter((po) => po.cycle === month);
    const waiting = current.filter(notSent);
    const open = current.filter((po) => po.status === "sent" || po.status === "partially-received");
    const name = formatMonth(month);
    if (waiting.length) {
        const approval = waiting.filter((po) => po.status === "awaiting-approval").length;
        const drafts = waiting.filter((po) => po.status === "draft").length;
        const parts = [approval ? `${approval} awaiting approval` : "", drafts ? `${drafts} still in draft` : ""].filter(Boolean).join(", ");
        return { step: 1, note: `${name}: ${parts}.${day > 7 ? " The first week has passed, so these are running late." : ""}` };
    }
    if (open.length) return { step: 2, note: `${name}: ${open.length} order${open.length === 1 ? "" : "s"} placed and waiting on deliveries.` };
    if (current.length) return { step: 3, note: `${name}: everything ordered has been received and logged.` };
    if (day >= 20) return { step: 0, note: `Counts for ${formatMonth(nextMonth(month))} are due by the 25th.` };
    return { step: 1, note: `No ${name} order has been started yet.` };
};

const nextMonth = (month: string) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

const CycleStrip = ({ orders }: { orders: PurchaseOrder[] }) => {
    const { step, note } = cycleStep(orders);
    return (
        <Card padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3.5 lg:px-5">
                <h2 className="text-sm font-semibold text-primary">The monthly cycle Meraki follows today</h2>
                <p className="text-sm text-tertiary">{note}</p>
            </div>
            <ol className="mt-3.5 grid grid-cols-2 gap-px bg-border-secondary pt-px lg:grid-cols-4">
                {CYCLE_STEPS.map((s, i) => {
                    const state = i < step ? "done" : i === step ? "current" : "next";
                    return (
                        <li
                            key={s.title}
                            aria-current={state === "current" ? "step" : undefined}
                            className={cx("flex gap-3 p-3.5 lg:px-5", state === "current" ? "bg-brand-primary_alt" : "bg-primary")}
                        >
                            <span
                                aria-hidden="true"
                                className={cx(
                                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                    state === "current"
                                        ? "bg-brand-400 text-ink"
                                        : state === "done"
                                          ? "bg-success-secondary text-fg-success-primary"
                                          : "bg-secondary text-quaternary ring-1 ring-secondary ring-inset",
                                )}
                            >
                                {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                            </span>
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <p className={cx("text-sm font-semibold", state === "current" ? "text-brand-secondary" : "text-primary")}>
                                    {s.title}
                                    {state === "current" && <span className="font-medium"> · now</span>}
                                </p>
                                <p className="text-xs font-medium text-tertiary">{s.when}</p>
                                <p className="hidden text-xs text-tertiary sm:block">{s.body}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </Card>
    );
};

// ------------------------------------------------------------------------------------ screen

interface OrdersScreenProps {
    location?: LocationId;
    /** Tab to open on. Defaults to "Needs action" when anything is waiting, otherwise "Open". */
    tab?: OrdersTab;
}

export const OrdersScreen = ({ location: initialLocation = "lynnfield", tab: initialTab }: OrdersScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const here = purchaseOrders.filter((po) => po.locationId === location);
    const count = (t: OrdersTab) => here.filter((po) => inTab(po, t)).length;
    const [tab, setTab] = useState<OrdersTab>(
        initialTab ?? (purchaseOrders.some((po) => po.locationId === initialLocation && inTab(po, "action")) ? "action" : "open"),
    );

    const rows = here.filter((po) => inTab(po, tab));
    const cycles = [...new Set(rows.map((po) => po.cycle))].sort((a, b) => b.localeCompare(a));
    const th = "px-4 py-3 text-xs font-semibold whitespace-nowrap text-tertiary first:pl-5 last:pr-5";
    const td = "px-4 py-3.5 align-middle first:pl-5 last:pr-5";

    return (
        <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation}>
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Purchase <em>orders</em>
                        </>
                    }
                    description={`One order per vendor, per month, for ${locationName(location)}. 2026 orders were imported from the backlog spreadsheet.`}
                    actions={
                        <Button href={ROUTES.newOrder} color="primary" size="md" iconLeading={Plus} className="max-lg:hidden">
                            New order
                        </Button>
                    }
                />

                <CycleStrip orders={here} />

                <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as OrdersTab)} className="gap-4">
                    <Tabs.List type="underline" size="md" aria-label="Order status" className="overflow-x-auto">
                        {TABS.map((t) => (
                            <Tabs.Item key={t} id={t}>
                                {TAB_LABEL[t]}
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular-nums ring-1 ring-secondary ring-inset">
                                    {count(t)}
                                </span>
                            </Tabs.Item>
                        ))}
                    </Tabs.List>

                    <Tabs.Panel id={tab} className="flex flex-col gap-4">
                        {rows.length === 0 ? (
                            <Card className="py-10 lg:py-14">
                                <EmptyState size="md">
                                    <EmptyState.Header pattern="none">
                                        <EmptyState.FeaturedIcon icon={Check} color="gray" theme="modern" />
                                    </EmptyState.Header>
                                    <EmptyState.Content>
                                        <EmptyState.Title>
                                            {tab === "action" ? "Nothing needs action" : `No ${TAB_LABEL[tab].toLowerCase()} orders`}
                                        </EmptyState.Title>
                                        <EmptyState.Description>
                                            {tab === "action"
                                                ? `No drafts or approvals are waiting at ${locationName(location)}. Start the next order from the reorder suggestions.`
                                                : `There are no orders in this state at ${locationName(location)}.`}
                                        </EmptyState.Description>
                                    </EmptyState.Content>
                                    <EmptyState.Footer>
                                        <Button href={ROUTES.newOrder} color="secondary" size="md" iconLeading={Plus}>
                                            New order
                                        </Button>
                                    </EmptyState.Footer>
                                </EmptyState>
                            </Card>
                        ) : (
                            <>
                                {/* Desktop: one table, grouped by monthly cycle. */}
                                <div className="hidden overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset lg:block">
                                    <table className="w-full text-left text-sm">
                                        <thead className="border-b border-secondary">
                                            <tr>
                                                <th scope="col" className={th}>
                                                    Order
                                                </th>
                                                <th scope="col" className={th}>
                                                    Vendor
                                                </th>
                                                <th scope="col" className={th}>
                                                    Kind
                                                </th>
                                                <th scope="col" className={th}>
                                                    Placed
                                                </th>
                                                <th scope="col" className={cx(th, "text-right")}>
                                                    Lines
                                                </th>
                                                <th scope="col" className={th}>
                                                    Received
                                                </th>
                                                <th scope="col" className={cx(th, "text-right")}>
                                                    <span className="inline-flex items-center gap-1.5">
                                                        Total <SampleBadge label="Sample costs" />
                                                    </span>
                                                </th>
                                                <th scope="col" className={th}>
                                                    Status
                                                </th>
                                                <th scope="col" className={th}>
                                                    <span className="sr-only">Open</span>
                                                </th>
                                            </tr>
                                        </thead>
                                        {cycles.map((cycle) => {
                                            const group = rows.filter((po) => po.cycle === cycle);
                                            const total = group.reduce((sum, po) => sum + orderTotal(po), 0);
                                            return (
                                                <tbody key={cycle} className="divide-y divide-secondary border-b border-secondary last:border-b-0">
                                                    <tr className="bg-secondary">
                                                        <th scope="colgroup" colSpan={9} className="px-5 py-2 text-left text-xs font-semibold text-secondary">
                                                            <span className="flex items-center justify-between gap-3">
                                                                <span>
                                                                    {formatMonth(cycle)} cycle
                                                                    <span className="font-medium text-tertiary">
                                                                        {" "}
                                                                        · {group.length} order{group.length === 1 ? "" : "s"}
                                                                    </span>
                                                                </span>
                                                                <span className="font-medium text-tertiary tabular-nums">
                                                                    {total > 0 ? `${formatCurrency(total)} at sample costs` : ""}
                                                                </span>
                                                            </span>
                                                        </th>
                                                    </tr>
                                                    {group.map((po) => {
                                                        const progress = receivedLineCount(po);
                                                        return (
                                                            <tr key={po.id} className="transition duration-100 ease-linear hover:bg-primary_hover">
                                                                <td className={td}>
                                                                    <span className="flex items-center gap-2">
                                                                        <a
                                                                            href={ROUTES.order(po.id)}
                                                                            className="rounded-sm font-semibold whitespace-nowrap text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                                                                        >
                                                                            {po.number}
                                                                        </a>
                                                                        {po.imported && <ImportedBadge />}
                                                                    </span>
                                                                </td>
                                                                <td className={cx(td, "whitespace-nowrap text-secondary")}>{vendorById(po.vendorId).name}</td>
                                                                <td className={cx(td, "text-tertiary")}>{KIND_LABEL[po.kind]}</td>
                                                                <td className={cx(td, "whitespace-nowrap", notSent(po) ? "text-quaternary" : "text-tertiary")}>
                                                                    {placed(po)}
                                                                </td>
                                                                <td className={cx(td, "text-right text-secondary tabular-nums")}>{progress.total}</td>
                                                                <td className={td}>
                                                                    <OrderProgress {...progress} notSent={notSent(po)} />
                                                                </td>
                                                                <td className={cx(td, "text-right")}>
                                                                    <Total po={po} />
                                                                </td>
                                                                <td className={td}>
                                                                    <OrderStatusBadge status={po.status} />
                                                                </td>
                                                                <td className={cx(td, "w-10 text-right")}>
                                                                    <a
                                                                        href={ROUTES.order(po.id)}
                                                                        aria-label={`Open ${po.number}`}
                                                                        className="inline-flex size-8 items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:bg-secondary hover:text-fg-quaternary_hover focus-visible:outline-2"
                                                                    >
                                                                        <ChevronRight className="size-4" aria-hidden="true" />
                                                                    </a>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            );
                                        })}
                                    </table>
                                </div>

                                {/* Phone: cards, same grouping. */}
                                <div className="flex flex-col gap-5 lg:hidden">
                                    {cycles.map((cycle) => (
                                        <section key={cycle} className="flex flex-col gap-2.5">
                                            <h2 className="text-xs font-semibold text-tertiary">{formatMonth(cycle)} cycle</h2>
                                            <ul className="flex flex-col gap-2.5">
                                                {rows
                                                    .filter((po) => po.cycle === cycle)
                                                    .map((po) => {
                                                        const progress = receivedLineCount(po);
                                                        return (
                                                            <li key={po.id}>
                                                                <a
                                                                    href={ROUTES.order(po.id)}
                                                                    className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2"
                                                                >
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="flex min-w-0 flex-col gap-0.5">
                                                                            <span className="flex flex-wrap items-center gap-2">
                                                                                <span className="text-md font-semibold text-primary">{po.number}</span>
                                                                                {po.imported && <ImportedBadge />}
                                                                            </span>
                                                                            <span className="text-sm text-tertiary">
                                                                                {vendorById(po.vendorId).name} · {KIND_LABEL[po.kind]}
                                                                            </span>
                                                                        </div>
                                                                        <OrderStatusBadge status={po.status} />
                                                                    </div>
                                                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <dt className="text-xs text-tertiary">Placed</dt>
                                                                            <dd className={notSent(po) ? "text-quaternary" : "text-secondary"}>{placed(po)}</dd>
                                                                        </div>
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <dt className="flex items-center gap-1.5 text-xs text-tertiary">
                                                                                Total <SampleBadge />
                                                                            </dt>
                                                                            <dd>
                                                                                <Total po={po} align="left" />
                                                                            </dd>
                                                                        </div>
                                                                        <div className="col-span-2 flex items-center justify-between gap-3 border-t border-secondary pt-2.5">
                                                                            <dt className="text-xs text-tertiary">
                                                                                {progress.total} line{progress.total === 1 ? "" : "s"}
                                                                                {notSent(po) ? "" : ", received"}
                                                                            </dt>
                                                                            <dd>
                                                                                <OrderProgress {...progress} notSent={notSent(po)} />
                                                                            </dd>
                                                                        </div>
                                                                    </dl>
                                                                </a>
                                                            </li>
                                                        );
                                                    })}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            </>
                        )}
                    </Tabs.Panel>
                </Tabs>

                <SampleDataNote>
                    Order lines, quantities and received dates for 2026 come from Meraki&apos;s backlog spreadsheet. Unit costs and totals are sample values;
                    the spreadsheets hold no prices. The November orders were generated from the reorder suggestions.
                </SampleDataNote>

                <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 lg:hidden">
                    <Button href={ROUTES.newOrder} color="primary" size="lg" iconLeading={Plus} className="w-full shadow-lg">
                        New order
                    </Button>
                </div>
            </PageContent>
        </AppShell>
    );
};
