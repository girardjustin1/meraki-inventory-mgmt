"use client";

import { useMemo, useState } from "react";
import { Check, Download01, Lock01, Plus, Send01, ShoppingCart01, XCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import type { BulkAction } from "@/components/meraki/bulk-action-bar";
import { BulkActionBar } from "@/components/meraki/bulk-action-bar";
import { downloadCsv } from "@/components/meraki/collection-export";
import type { ActiveFilters, ToolbarFilter, ToolbarSort, ToolbarView } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar, passesFilters } from "@/components/meraki/data-table-toolbar";
import type { ListColumn, ListNoticeContent } from "@/components/meraki/list-table";
import {
    BULK_BAR_OVER_HEADER,
    ListCards,
    ListEmpty,
    ListNotice,
    ListTable,
    RowLink,
    SelectModeRow,
    norm,
    plural,
    skipped,
    useListSelection,
} from "@/components/meraki/list-table";
import { receivedLineCount } from "@/components/meraki/order-progress";
import { ORDER_STATUS, OrderStatusBadge } from "@/components/meraki/status-badges";
import { INCOMING_MAX_AGE_DAYS, TODAY, locationName, orderTotal, purchaseOrders, userById, vendorById } from "@/data/inventory";
import type { LocationId, PurchaseOrder, PurchaseOrderStatus, User } from "@/data/types";
import { addDays, daysBetween, formatDate, formatMonth } from "@/engine/dates";
import { can } from "@/engine/permissions";
import { formatCurrency } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

export type OrdersTab = "action" | "open" | "received" | "all";
export type OrdersSort = "newest" | "oldest" | "total" | "expected";

const TAB_STATUSES: Record<OrdersTab, PurchaseOrderStatus[] | null> = {
    action: ["draft", "awaiting-approval", "approved"],
    open: ["sent", "partially-received"],
    received: ["received"],
    all: null,
};
const TAB_LABEL: Record<OrdersTab, string> = { action: "Needs action", open: "Open", received: "Received", all: "All" };
const TABS: OrdersTab[] = ["action", "open", "received", "all"];
const STATUSES: PurchaseOrderStatus[] = ["draft", "awaiting-approval", "approved", "sent", "partially-received", "received", "cancelled"];

const inTab = (po: PurchaseOrder, tab: OrdersTab) => TAB_STATUSES[tab]?.includes(po.status) ?? true;
const notSent = (po: PurchaseOrder) => po.status === "draft" || po.status === "awaiting-approval" || po.status === "approved";
const stillOpen = (po: PurchaseOrder) => po.status === "sent" || po.status === "partially-received";
const KIND_LABEL: Record<PurchaseOrder["kind"], string> = { supply: "Supplies", polish: "Polish" };

const day = (iso: string) => formatDate(iso, iso.slice(0, 4) !== TODAY.slice(0, 4));

/** The day the order went to the vendor. The 2026 backlog records one date per order, so that is used when no send date is. */
const placedOn = (po: PurchaseOrder) => (notSent(po) || po.status === "cancelled" ? undefined : (po.sentAt ?? po.createdAt));

/** When an open order should arrive: the day it was placed plus the vendor's lead time. */
const expectedOn = (po: PurchaseOrder) => {
    const placed = placedOn(po);
    return placed && stillOpen(po) ? addDays(placed, vendorById(po.vendorId).leadTimeDays) : undefined;
};

const receivedOn = (po: PurchaseOrder) =>
    po.status === "received"
        ? (po.closedAt ??
          po.lines
              .map((l) => l.receivedAt)
              .filter((d): d is string => Boolean(d))
              .sort()
              .at(-1))
        : undefined;

const deliveryText = (po: PurchaseOrder): { text: string; late?: boolean; detail?: string } | undefined => {
    const received = receivedOn(po);
    if (received) return { text: `Received ${day(received)}` };
    const expected = expectedOn(po);
    const placed = placedOn(po);
    if (!expected || !placed) return undefined;
    if (expected >= TODAY) return { text: `Expected ${day(expected)}` };
    // The same cut-off the stock screen uses for "unconfirmed": an old order nobody marked received has probably arrived.
    if (daysBetween(placed, TODAY) > INCOMING_MAX_AGE_DAYS) return { text: "Unconfirmed", detail: `Was due ${day(expected)}` };
    return { text: `Overdue since ${day(expected)}`, late: true };
};

/** Lines with a quantity but no unit cost: free-text requests and rows not matched to the catalogue. */
const unpricedLines = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0 && l.unitCost === undefined).length;

const itemCount = (po: PurchaseOrder) => receivedLineCount(po).total;

const Dash = ({ label }: { label: string }) => (
    <span className="text-quaternary">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{label}</span>
    </span>
);

const Total = ({ po }: { po: PurchaseOrder }) => {
    const total = orderTotal(po);
    const unpriced = unpricedLines(po);
    if (total <= 0) return <Dash label="No costs yet" />;
    return (
        <span className="font-medium text-primary tabular-nums">
            {formatCurrency(total)}
            {unpriced > 0 && (
                <span className="text-tertiary" title={`${plural(unpriced, "line")} with no cost yet`}>
                    *<span className="sr-only"> {plural(unpriced, "line")} with no cost yet</span>
                </span>
            )}
        </span>
    );
};

const nextMonth = (month: string) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};

/** Where this month's cycle stands, worked out from the orders themselves. One line under the title. */
const cycleNote = (orders: PurchaseOrder[]) => {
    const month = TODAY.slice(0, 7);
    const dayOfMonth = Number(TODAY.slice(8, 10));
    const current = orders.filter((po) => po.cycle === month && po.status !== "cancelled");
    const waiting = current.filter(notSent);
    const open = current.filter(stillOpen);
    const name = formatMonth(month);
    if (waiting.length) {
        const of = (status: PurchaseOrderStatus) => waiting.filter((po) => po.status === status).length;
        const parts = [
            of("awaiting-approval") ? `${of("awaiting-approval")} awaiting approval` : "",
            of("draft") ? `${of("draft")} in draft` : "",
            of("approved") ? `${of("approved")} ready to send` : "",
        ].filter(Boolean);
        return `${name} cycle: ${parts.join(", ")}.${dayOfMonth > 7 ? " Running late: orders usually go out in the first week." : ""}`;
    }
    if (open.length) return `${name} cycle: ${plural(open.length, "order")} placed and waiting on deliveries.`;
    if (current.length) return `${name} cycle: everything ordered has been received.`;
    if (dayOfMonth >= 20) return `Counts for the ${formatMonth(nextMonth(month))} order are due by the 25th.`;
    return `No ${name} order has been started yet.`;
};

const SORTS: (ToolbarSort & { id: OrdersSort })[] = [
    { id: "newest", label: "Newest first" },
    { id: "oldest", label: "Oldest first" },
    { id: "total", label: "Total, highest first" },
    { id: "expected", label: "Expected date, soonest first" },
];

const FILTER_READ: Record<string, (po: PurchaseOrder) => string> = {
    vendor: (po) => po.vendorId,
    status: (po) => po.status,
    by: (po) => po.createdBy,
};

/** A change made on this screen. The prototype has no backend, so it lasts until the page is left. */
type Changes = Record<string, { status: PurchaseOrderStatus; approvedBy?: string }>;

// ------------------------------------------------------------------------------------ screen

interface OrdersScreenProps {
    location?: LocationId;
    /** Who is looking. Defaults to the person using the app; stories pass a sample person. */
    user?: User;
    /** View to open on (deep link `?tab=`). Defaults to "Needs action" when anything is waiting, otherwise "Open". */
    tab?: OrdersTab;
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Filters to start with (deep link `?vendor=`, `?status=`, `?by=`, comma-separated). */
    initialFilters?: ActiveFilters;
    /** Sort to start with (deep link `?sort=`). */
    initialSort?: OrdersSort;
    /** Order ids selected on first render, which brings up the bulk bar. */
    initialSelected?: string[];
}

/** Every purchase order at one location: what needs action, what is on its way and what has arrived. */
export const OrdersScreen = ({ location: initialLocation = "lynnfield", user: userProp, ...initial }: OrdersScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [changes, setChanges] = useState<Changes>({});
    const [notice, setNotice] = useState<ListNoticeContent | null>(null);

    const orders = useMemo(
        () => purchaseOrders.filter((po) => po.locationId === location).map((po) => (changes[po.id] ? { ...po, ...changes[po.id] } : po)),
        [location, changes],
    );
    const canSee = can(user, "orders.view", location);
    const canManage = can(user, "orders.create", location);
    const readyToSend = orders.filter((po) => po.status === "approved" || po.status === "draft").length;

    return (
        <AppShell
            activeUrl={ROUTES.orders}
            location={location}
            onLocationChange={(next) => {
                setLocation(next);
                setNotice(null);
            }}
            user={userProp}
        >
            <PageContent className="gap-4 lg:gap-5">
                <div className="flex flex-col gap-2.5">
                    <PageHeader
                        title={
                            <>
                                Purchase <em>orders</em>
                            </>
                        }
                        description={canSee ? cycleNote(orders) : undefined}
                        actions={
                            canManage && (
                                // One row that does not wrap, so a long description cannot stack the two buttons.
                                <div className="flex shrink-0 items-center gap-3 max-lg:w-full">
                                    <Button href={ROUTES.sendOrders} color="secondary" size="md" iconLeading={Send01} className="max-lg:min-h-11 max-lg:flex-1">
                                        Send orders
                                        {readyToSend > 0 && (
                                            <span
                                                aria-label={`${readyToSend} ready to send`}
                                                className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular-nums ring-1 ring-secondary ring-inset"
                                            >
                                                {readyToSend}
                                            </span>
                                        )}
                                    </Button>
                                    <Button href={ROUTES.newOrder} color="primary" size="md" iconLeading={Plus} className="max-lg:min-h-11 max-lg:flex-1">
                                        New order
                                    </Button>
                                </div>
                            )
                        }
                    />
                    {canSee && (
                        <SampleDataNote>
                            Order lines, quantities and received dates for 2026 come from Meraki&apos;s backlog spreadsheet. Unit costs and totals are sample
                            values; the spreadsheets hold no prices. Expected dates use assumed vendor lead times. The November orders were generated from the
                            reorder suggestions.
                        </SampleDataNote>
                    )}
                </div>

                {canSee ? (
                    // Keyed by location so the view, filters and selection start fresh when the salon changes.
                    <OrdersList
                        key={location}
                        location={location}
                        user={user}
                        orders={orders}
                        changes={changes}
                        onChanges={setChanges}
                        notify={setNotice}
                        {...initial}
                    />
                ) : (
                    <ListEmpty
                        icon={Lock01}
                        title="Orders are not part of your access"
                        action={
                            <Button href={ROUTES.stock} color="secondary" size="md" className="max-lg:min-h-11">
                                Go to stock
                            </Button>
                        }
                    >
                        Your role does not include purchase orders at {locationName(location)}. An admin can change that on the Team page.
                    </ListEmpty>
                )}

                <ListNotice notice={notice} onDismiss={() => setNotice(null)} />
            </PageContent>
        </AppShell>
    );
};

interface OrdersListProps extends Omit<OrdersScreenProps, "location" | "user"> {
    location: LocationId;
    user: User;
    /** Orders at this location, with this session's changes applied. */
    orders: PurchaseOrder[];
    changes: Changes;
    onChanges: (next: Changes) => void;
    notify: (notice: ListNoticeContent | null) => void;
}

const OrdersList = ({
    location,
    user,
    orders,
    changes,
    onChanges,
    notify,
    tab: initialTab,
    initialQuery = "",
    initialFilters = {},
    initialSort = "newest",
    initialSelected,
}: OrdersListProps) => {
    const isDesktop = useBreakpoint("lg");
    const seesCosts = can(user, "costs.view", location);
    const canApprove = can(user, "orders.approve", location);
    const canManage = can(user, "orders.create", location);
    const place = locationName(location);

    const [tab, setTab] = useState<OrdersTab>(initialTab ?? (orders.some((po) => inTab(po, "action")) ? "action" : "open"));
    const [query, setQuery] = useState(initialQuery);
    const [filters, setFilters] = useState<ActiveFilters>(initialFilters);
    const [sort, setSort] = useState<OrdersSort>(initialSort === "total" && !seesCosts ? "newest" : initialSort);
    const [selectMode, setSelectMode] = useState((initialSelected?.length ?? 0) > 0);

    // null (not undefined) removes a parameter: useUrlSync serialises its input, which drops undefined keys before it can clear them.
    useUrlSync({
        tab,
        q: query,
        vendor: filters.vendor?.join(",") ?? null,
        status: filters.status?.join(",") ?? null,
        by: filters.by?.join(",") ?? null,
        sort: sort === "newest" ? null : sort,
    });

    const views: ToolbarView[] = TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: orders.filter((po) => inTab(po, t)).length }));

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const tally = (read: (po: PurchaseOrder) => string) => {
            const counts = new Map<string, number>();
            for (const po of orders) counts.set(read(po), (counts.get(read(po)) ?? 0) + 1);
            return counts;
        };
        const byVendor = tally((po) => po.vendorId);
        const byStatus = tally((po) => po.status);
        const byPerson = tally((po) => po.createdBy);
        return [
            {
                id: "vendor",
                label: "Vendor",
                options: [...byVendor].map(([id, count]) => ({ id, label: vendorById(id).name, count })).sort((a, b) => a.label.localeCompare(b.label)),
            },
            {
                id: "status",
                label: "Status",
                options: STATUSES.filter((s) => byStatus.has(s)).map((s) => ({ id: s, label: ORDER_STATUS[s].label, count: byStatus.get(s) })),
            },
            {
                id: "by",
                label: "Created by",
                options: [...byPerson]
                    .map(([id, count]) => ({ id, label: userById(id)?.name ?? "Someone", count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            },
        ];
    }, [orders]);

    const filtered = useMemo(() => {
        const q = norm(query);
        const out = orders.filter(
            (po) =>
                inTab(po, tab) &&
                passesFilters(po, filters, FILTER_READ) &&
                // Each field on its own, so a search cannot match across the end of one field and the start of the next.
                (!q ||
                    [
                        po.number,
                        vendorById(po.vendorId).name,
                        KIND_LABEL[po.kind],
                        userById(po.createdBy)?.name ?? "",
                        formatMonth(po.cycle),
                        ...po.lines.map((l) => l.name),
                    ].some((f) => norm(f).includes(q))),
        );
        const newest = (a: PurchaseOrder, b: PurchaseOrder) => b.createdAt.localeCompare(a.createdAt) || a.number.localeCompare(b.number);
        const compare: Record<OrdersSort, (a: PurchaseOrder, b: PurchaseOrder) => number> = {
            newest,
            oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || a.number.localeCompare(b.number),
            total: (a, b) => orderTotal(b) - orderTotal(a) || newest(a, b),
            // Orders with nothing expected (not sent yet, or already in) go last.
            expected: (a, b) => (expectedOn(a) ?? "9999").localeCompare(expectedOn(b) ?? "9999") || newest(a, b),
        };
        return out.sort(compare[sort]);
    }, [orders, tab, filters, query, sort]);

    const selection = useListSelection(
        filtered.map((po) => po.id),
        initialSelected,
    );
    const selectedOrders = filtered.filter((po) => selection.has(po.id));
    const narrowed = query.trim() !== "" || Object.keys(filters).length > 0;

    // Changing what is listed drops the selection, so actions never hit rows that are out of sight.
    const relist = () => selection.clear();
    const clearAll = () => {
        setQuery("");
        setFilters({});
        relist();
    };

    // ---------------------------------------------------------------- bulk actions

    const apply = (next: Changes, text: string, changed: number) => {
        const before = changes;
        if (changed) onChanges(next);
        notify({
            text: changed ? `${text} Nothing is saved in the prototype.` : text,
            onUndo: changed
                ? () => {
                      onChanges(before);
                      notify(null);
                  }
                : undefined,
        });
    };

    // The same rule as the order page: people who may approve, an order waiting for approval, and never their own.
    const approve = () => {
        const waiting = selectedOrders.filter((po) => po.status === "awaiting-approval");
        const mine = waiting.filter((po) => po.createdBy === user.id);
        const targets = waiting.filter((po) => po.createdBy !== user.id);
        const next = { ...changes };
        for (const po of targets) next[po.id] = { status: "approved", approvedBy: user.id };
        apply(
            next,
            `${targets.length ? `${targets.length} approved.` : "Nothing approved."}${skipped(mine.length, mine.length === 1 ? "you created it" : "you created them")}${skipped(selectedOrders.length - waiting.length, "not waiting for approval")}`,
            targets.length,
        );
    };

    const cancelDrafts = () => {
        const targets = selectedOrders.filter((po) => po.status === "draft");
        const next = { ...changes };
        for (const po of targets) next[po.id] = { status: "cancelled" };
        apply(
            next,
            `${targets.length ? `${plural(targets.length, "draft")} cancelled.` : "Nothing cancelled."}${skipped(selectedOrders.length - targets.length, "only drafts can be cancelled")}`,
            targets.length,
        );
        if (targets.length) selection.clear();
    };

    // The bulk bar takes actions, not links, so this points at the send screen from the confirmation.
    const send = () => {
        const ready = selectedOrders.filter((po) => po.status === "approved");
        const rest = selectedOrders.length - ready.length;
        if (!ready.length) {
            notify({ text: `Nothing to send yet.${skipped(rest, "an order goes to its vendor once it is approved")}` });
            return;
        }
        const only = ready.length === 1 ? ready[0] : undefined;
        notify({
            text: `${plural(ready.length, "order")} ready to send.${skipped(rest, "not approved yet")}`,
            href: only
                ? `${ROUTES.sendOrders}?order=${encodeURIComponent(only.id)}`
                : `${ROUTES.sendOrders}?orders=${ready.map((po) => encodeURIComponent(po.id)).join(",")}`,
            linkLabel: only ? `Send ${only.number}` : "Open send orders",
        });
    };

    const exportCsv = () => {
        const name = `orders-${location}-${TODAY}.csv`;
        const header = [
            "Order",
            "Vendor",
            "Kind",
            "Status",
            "Items",
            ...(seesCosts ? ["Total"] : []),
            "Created",
            "Placed",
            "Expected",
            "Received",
            "Created by",
        ];
        const rows = selectedOrders.map((po) => [
            po.number,
            vendorById(po.vendorId).name,
            KIND_LABEL[po.kind],
            ORDER_STATUS[po.status].label,
            itemCount(po),
            ...(seesCosts ? [orderTotal(po).toFixed(2)] : []),
            po.createdAt,
            placedOn(po),
            expectedOn(po),
            receivedOn(po),
            userById(po.createdBy)?.name,
        ]);
        if (downloadCsv(name, header, rows)) notify({ text: `${plural(rows.length, "order")} exported to ${name}.` });
    };

    const actions: BulkAction[] = [
        ...(canApprove ? [{ id: "approve", label: "Approve", icon: Check, onAction: approve }] : []),
        ...(canManage ? [{ id: "send", label: "Send to vendor", icon: Send01, onAction: send }] : []),
        { id: "export", label: "Export CSV", icon: Download01, onAction: exportCsv },
        ...(canManage ? [{ id: "cancel", label: "Cancel drafts", icon: XCircle, onAction: cancelDrafts }] : []),
    ];

    // ---------------------------------------------------------------- columns

    const columns: ListColumn<PurchaseOrder>[] = [
        { id: "order", label: "Order", primary: true, cell: (po) => <RowLink href={ROUTES.order(po.id)}>{po.number}</RowLink> },
        { id: "vendor", label: "Vendor", cell: (po) => vendorById(po.vendorId).name },
        { id: "status", label: "Status", cell: (po) => <OrderStatusBadge status={po.status} /> },
        { id: "items", label: "Items", align: "right", tooltip: "Lines on the order with a quantity.", cell: itemCount },
        ...(seesCosts
            ? [
                  {
                      id: "total",
                      label: "Total",
                      align: "right" as const,
                      tooltip:
                          "Quantity ordered times unit cost. Unit costs are sample values until invoice costs are loaded. An asterisk means some lines have no cost yet.",
                      cell: (po: PurchaseOrder) => <Total po={po} />,
                  },
              ]
            : []),
        {
            id: "placed",
            label: "Placed",
            tooltip: "The day the order went to the vendor. An order that has not gone out shows the day it was created.",
            cell: (po) => {
                const placed = placedOn(po);
                return placed ? day(placed) : <span className="text-tertiary">Created {day(po.createdAt)}</span>;
            },
        },
        {
            id: "delivery",
            label: "Delivery",
            tooltip: `The day it arrived, or the day it is expected: the day it was placed plus the vendor's usual lead time. Unconfirmed: placed more than ${INCOMING_MAX_AGE_DAYS} days ago and never marked received, so it has probably arrived.`,
            cell: (po) => {
                const delivery = deliveryText(po);
                return delivery ? (
                    <span className={cx(delivery.late && "font-medium text-primary")} title={delivery.detail}>
                        {delivery.text}
                    </span>
                ) : (
                    <Dash label="Not sent" />
                );
            },
        },
        { id: "by", label: "Created by", wideOnly: true, cell: (po) => userById(po.createdBy)?.name ?? <Dash label="Not recorded" /> },
    ];

    const card = (po: PurchaseOrder) => {
        const delivery = deliveryText(po);
        return (
            <span className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-primary">{po.number}</span>
                    {seesCosts && (
                        <span className="shrink-0 text-sm">
                            <Total po={po} />
                        </span>
                    )}
                </span>
                <span className="flex items-center gap-2">
                    <OrderStatusBadge status={po.status} />
                    <span className="min-w-0 truncate text-xs text-tertiary">
                        {vendorById(po.vendorId).name} · {plural(itemCount(po), "item")}
                        {delivery ? ` · ${delivery.text}` : ""}
                    </span>
                </span>
            </span>
        );
    };

    // The view picker already carries each view's count, so the result line only appears once search or filters narrow it.
    const inView = orders.filter((po) => inTab(po, tab)).length;
    const summaryText = narrowed ? `${filtered.length} of ${plural(inView, "order")}` : undefined;
    const bulkBar = (className?: string) => (
        <BulkActionBar
            count={selection.count}
            noun="order"
            totalMatching={filtered.length}
            onSelectAll={selection.selectAll}
            onClear={() => {
                selection.clear();
                setSelectMode(false);
            }}
            onToggleAll={isDesktop ? selection.toggleAll : undefined}
            actions={actions}
            className={className}
        />
    );

    return (
        <div className={cx("flex flex-col gap-3", !isDesktop && selection.count > 0 && "pb-28")}>
            <DataTableToolbar
                label={`orders at ${place}`}
                views={views}
                view={tab}
                onViewChange={(id) => {
                    setTab(id as OrdersTab);
                    relist();
                }}
                query={query}
                onQueryChange={(value) => {
                    setQuery(value);
                    relist();
                }}
                searchPlaceholder="Search by order number, vendor or item"
                compactSearchPlaceholder="Search"
                filters={filterDefs}
                activeFilters={filters}
                onFiltersChange={(next) => {
                    setFilters(next);
                    relist();
                }}
                sorts={SORTS.filter((s) => s.id !== "total" || seesCosts)}
                sort={sort}
                onSortChange={(id) => setSort(id as OrdersSort)}
                summary={isDesktop ? summaryText : undefined}
            />

            {!isDesktop && filtered.length > 0 && (
                <SelectModeRow
                    summary={summaryText ?? plural(inView, "order")}
                    selectMode={selectMode}
                    onToggle={() => {
                        if (selectMode) selection.clear();
                        setSelectMode(!selectMode);
                    }}
                />
            )}

            {filtered.length === 0 ? (
                narrowed ? (
                    <ListEmpty
                        title="No orders match"
                        action={
                            <Button color="secondary" size="md" className="max-lg:min-h-11" onClick={clearAll}>
                                Clear search and filters
                            </Button>
                        }
                    >
                        Nothing in {TAB_LABEL[tab]} at {place} fits this search and these filters.
                    </ListEmpty>
                ) : (
                    <ListEmpty
                        icon={tab === "action" ? Check : ShoppingCart01}
                        title={tab === "action" ? "Nothing needs action" : tab === "all" ? "No orders yet" : `No ${TAB_LABEL[tab].toLowerCase()} orders`}
                        action={
                            tab !== "all" && orders.length > 0 ? (
                                <Button color="secondary" size="md" className="max-lg:min-h-11" onClick={() => setTab("all")}>
                                    Show all {plural(orders.length, "order")}
                                </Button>
                            ) : undefined
                        }
                    >
                        {tab === "action"
                            ? `No drafts or approvals are waiting at ${place}.`
                            : tab === "all"
                              ? `No order has been recorded for ${place}.`
                              : `There are no orders in this state at ${place}.`}
                    </ListEmpty>
                )
            ) : isDesktop ? (
                <ListTable
                    label={`Orders at ${place}`}
                    noun="orders"
                    rows={filtered}
                    rowId={(po) => po.id}
                    rowName={(po) => po.number}
                    columns={columns}
                    selection={selection}
                    bulkBar={bulkBar(BULK_BAR_OVER_HEADER)}
                />
            ) : (
                <ListCards
                    label={`Orders at ${place}`}
                    rows={filtered}
                    rowId={(po) => po.id}
                    href={(po) => ROUTES.order(po.id)}
                    selection={selection}
                    selectMode={selectMode}
                    onSelectMode={setSelectMode}
                    card={card}
                />
            )}

            {!isDesktop && bulkBar()}
        </div>
    );
};
