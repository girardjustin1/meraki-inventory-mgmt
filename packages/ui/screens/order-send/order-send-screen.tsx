"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle, ChevronDown, ChevronRight, InfoCircle, Lock01, ReverseLeft, Send01, Truck01 } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import type { SentVia } from "@/components/meraki/send-method-panel";
import { SENT_VIA_LABEL, SendMethodPanel } from "@/components/meraki/send-method-panel";
import { SEND_METHOD_ICON, bestSendOption } from "@/components/meraki/send-option-list";
import { ORDER_STATUS, OrderStatusBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, getItem, getPurchaseOrder, locationName, purchaseOrders, vendorById } from "@/data/inventory";
import type { LocationId, PurchaseOrder, PurchaseOrderStatus, User, Vendor } from "@/data/types";
import { formatMonth } from "@/engine/dates";
import type { SendMethod } from "@/engine/order-send";
import { ordersToSend, sendOptions } from "@/engine/order-send";
import { can } from "@/engine/permissions";
import { formatCount } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

/** How and when an order was marked as sent. Held in this screen only. */
export interface SentRecord {
    via: SentVia;
    /** Clock time as shown, for example "2:14 PM". */
    at: string;
}

/** Orders up to LINES_INLINE lines are shown whole. Longer ones show the first LINES_SHOWN until expanded, and never more than LINES_MAX. */
const LINES_INLINE = 8;
const LINES_SHOWN = 6;
const LINES_MAX = 60;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const orderedLines = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0);
const unitCount = (po: PurchaseOrder) => orderedLines(po).reduce((n, l) => n + l.qtyOrdered, 0);
const timeNow = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const isPlaced = (s: PurchaseOrderStatus) => s === "sent" || s === "partially-received" || s === "received";
/** Cannot go out from here: only approved orders are sent. Drafts and orders waiting for an owner are shown but locked. */
const isLocked = (s: PurchaseOrderStatus) => s === "draft" || s === "awaiting-approval" || s === "cancelled";

/** What to offer in "Mark as sent", for orders that went out some other way. */
const MANUAL_VIA: { via: SentVia; label: string; hint: string }[] = [
    { via: "mail-app", label: "By email", hint: "Sent from your own mail app." },
    { via: "website", label: "On the vendor's website", hint: "Placed in a cart or portal by hand." },
    { via: "in-store", label: "In person", hint: "Bought on a store run." },
    { via: "phone", label: "By phone", hint: "Called in to the vendor or a rep." },
    { via: "transfer", label: "Transfer request", hint: "Asked the warehouse directly." },
];
const VIA_FOR_METHOD: Record<SendMethod, SentVia> = {
    email: "mail-app",
    "cart-link": "website",
    "pick-list": "in-store",
    api: "website",
    transfer: "transfer",
};

/** The honest answer to "which vendors can I order from automatically?". From docs/research/03-wholesale-and-product-data.md. */
const VENDOR_ROUTES = [
    {
        vendors: "Amazon Business",
        how: "Ordering API, if Amazon approves access",
        state: "Not connected. Until then: an emailed order, or placed on Amazon by hand.",
    },
    {
        vendors: "Dazzle Dry, FarmHouse Fresh, Starpil",
        how: "Pre-filled cart link",
        state: "Not set up yet. You log in, check the cart and pay. Wholesale pricing through a link is unconfirmed.",
    },
    {
        vendors: "Local nail supply store, OPI distributors, DND, Chisel, Aprés",
        how: "Emailed order or pick list",
        state: "Prepared here, sent by a person.",
    },
    { vendors: "Costco, BJ's", how: "Shopping list", state: "Bought in person. No ordering link." },
];

const Explainer = () => (
    <details className="group rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-primary outline-focus-ring focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
            Which vendors can be ordered from automatically?
            <ChevronDown className="size-4 shrink-0 text-fg-quaternary transition duration-100 ease-linear group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="flex flex-col gap-3 border-t border-secondary px-4 py-3">
            <p className="text-sm text-secondary">
                None today. Only Amazon Business has an ordering API, and it needs Amazon&apos;s approval. For every vendor the app prepares the order and a
                person sends it.
            </p>
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="border-b border-secondary text-xs text-tertiary">
                        <th scope="col" className="py-2 pr-3 font-semibold">
                            Vendor
                        </th>
                        <th scope="col" className="py-2 font-semibold">
                            What the app can do
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-secondary">
                    {VENDOR_ROUTES.map((r) => (
                        <tr key={r.vendors}>
                            <th scope="row" className="w-2/5 py-2.5 pr-3 align-top font-medium text-primary">
                                {r.vendors}
                            </th>
                            <td className="py-2.5 align-top">
                                <span className="block font-medium text-secondary">{r.how}</span>
                                <span className="block text-xs text-tertiary">{r.state}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-xs text-tertiary">
                Based on vendor research dated Nov 2026. Nothing comes back from a vendor either: stock, prices and delivery dates are in their reply, and
                receiving stays manual.
            </p>
        </div>
    </details>
);

// ------------------------------------------------------------------------------------ screen

interface OrderSendScreenProps {
    location?: LocationId;
    user?: User;
    /** Orders to send. Defaults to everything waiting to go out at the location. */
    orderIds?: string[];
    /** Order to open on. On a phone this opens straight on that order's step. */
    initialOrderId?: string;
    /** Way of sending to open that order on (for stories). Defaults to the best one ready for its vendor. */
    initialMethod?: SendMethod;
    /** Orders to show as approved (for stories: the sample data has no approved order yet). */
    treatAsApproved?: string[];
    /** Orders already marked as sent when the screen opens (for stories). */
    initialSent?: Record<string, SentRecord>;
}

export const OrderSendScreen = ({
    location: initialLocation = "lynnfield",
    user = CURRENT_USER,
    orderIds,
    initialOrderId,
    initialMethod,
    treatAsApproved,
    initialSent,
}: OrderSendScreenProps) => {
    const statusOf = (po: PurchaseOrder): PurchaseOrderStatus => (treatAsApproved?.includes(po.id) ? "approved" : po.status);
    const ordersFor = (loc: LocationId) =>
        orderIds && loc === initialLocation
            ? orderIds.map((id) => getPurchaseOrder(id)).filter((po): po is PurchaseOrder => Boolean(po))
            : ordersToSend(purchaseOrders, loc);
    const firstOpen = (list: PurchaseOrder[]) => list.find((po) => !isLocked(statusOf(po)))?.id;

    const [location, setLocationState] = useState<LocationId>(initialLocation);
    const [selectedId, setSelectedId] = useState<string | undefined>(() => initialOrderId ?? firstOpen(ordersFor(initialLocation)));
    /** Orders whose panel has been opened. Their panels stay mounted so a half-edited email survives switching orders. */
    const [opened, setOpened] = useState<string[]>(() => (selectedId ? [selectedId] : []));
    const [step, setStep] = useState<"list" | "order">(initialOrderId ? "order" : "list");
    const [methods, setMethods] = useState<Record<string, SendMethod>>(() => (initialOrderId && initialMethod ? { [initialOrderId]: initialMethod } : {}));
    const [sent, setSent] = useState<Record<string, SentRecord>>(initialSent ?? {});
    useUrlSync({ order: step === "order" || selectedId !== firstOpen(ordersFor(location)) ? selectedId : undefined });
    const [showAllLines, setShowAllLines] = useState<string[]>([]);
    const [marking, setMarking] = useState<{ id: string; via: SentVia } | null>(null);

    const orders = ordersFor(location);
    // Orders for the same vendor sit together.
    const vendorOrder = [...new Set(orders.map((po) => po.vendorId))];
    const listed = [...orders].sort((a, b) => vendorOrder.indexOf(a.vendorId) - vendorOrder.indexOf(b.vendorId));
    const selected = listed.find((po) => po.id === selectedId && !isLocked(statusOf(po)));
    const canSend = can(user, "orders.create", location);

    const methodOf = (po: PurchaseOrder, vendor: Vendor = vendorById(po.vendorId)) => methods[po.id] ?? bestSendOption(vendor).method;
    const sentCount = listed.filter((po) => sent[po.id]).length;
    const waiting = listed.filter((po) => statusOf(po) === "awaiting-approval" || statusOf(po) === "draft").length;
    const allSent = listed.length > 0 && sentCount === listed.length;
    const lineTotal = listed.reduce((n, po) => n + orderedLines(po).length, 0);
    const cycles = [...new Set(listed.map((po) => po.cycle))].sort((a, b) => b.localeCompare(a));
    const next = selected ? listed.find((po) => po.id !== selected.id && !sent[po.id] && !isLocked(statusOf(po))) : undefined;

    const setLocation = (loc: LocationId) => {
        const first = firstOpen(ordersFor(loc));
        setLocationState(loc);
        setSelectedId(first);
        setOpened((prev) => (first && !prev.includes(first) ? [...prev, first] : prev));
        setStep("list");
    };
    const open = (id: string) => {
        setSelectedId(id);
        setOpened((prev) => (prev.includes(id) ? prev : [...prev, id]));
        setStep("order");
        // On a phone the order replaces the list, so start it from the top.
        if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) window.scrollTo({ top: 0 });
    };
    const markSent = (id: string, via: SentVia) => setSent((prev) => ({ ...prev, [id]: { via, at: timeNow() } }));
    const unmark = (id: string) => setSent((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id)));

    const backLink = (
        <a
            href={ROUTES.orders}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:min-h-0"
        >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Orders
        </a>
    );

    const marked = marking ? listed.find((po) => po.id === marking.id) : undefined;
    const markedVendor = marked ? vendorById(marked.vendorId) : undefined;

    return (
        <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    className={cx(step === "order" && selected && "max-lg:hidden")}
                    eyebrow={backLink}
                    title={
                        <>
                            Send <em>orders</em>
                        </>
                    }
                    description={
                        listed.length
                            ? `${cycles.map(formatMonth).join(" and ")} cycle for ${locationName(location)}. ${plural(listed.length, "order")} to ${plural(vendorOrder.length, "vendor")}, ${plural(lineTotal, "line")}. Each vendor gets its own order, sent one at a time.`
                            : `Orders for ${locationName(location)} that are ready to go to a vendor.`
                    }
                />

                {listed.length === 0 ? (
                    <Card className="py-10 lg:py-14">
                        <EmptyState size="md">
                            <EmptyState.Header pattern="none">
                                <EmptyState.FeaturedIcon icon={Send01} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>Nothing to send</EmptyState.Title>
                                <EmptyState.Description>
                                    No order at {locationName(location)} is waiting to go to a vendor. Build one from the reorder suggestions, and it will show
                                    up here once it is ready.
                                </EmptyState.Description>
                            </EmptyState.Content>
                            <EmptyState.Footer>
                                <Button href={ROUTES.newOrder} color="secondary" size="md">
                                    New order
                                </Button>
                                <Button href={ROUTES.orders} color="tertiary" size="md">
                                    All orders
                                </Button>
                            </EmptyState.Footer>
                        </EmptyState>
                    </Card>
                ) : (
                    <>
                        {/* Progress */}
                        <section
                            aria-label="Progress"
                            className={cx(
                                "flex flex-col gap-3 rounded-xl p-4 shadow-xs ring-1 ring-inset lg:flex-row lg:items-center lg:justify-between lg:px-5",
                                allSent ? "bg-success-primary ring-utility-green-200" : "bg-primary ring-secondary",
                                step === "order" && selected && "max-lg:hidden",
                            )}
                        >
                            {allSent ? (
                                <>
                                    <p role="status" className="flex items-start gap-2 text-sm text-secondary">
                                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                                        <span>
                                            <span className="font-semibold text-primary">All orders sent.</span> Receiving opens when the first delivery
                                            arrives.
                                        </span>
                                    </p>
                                    <Button href={ROUTES.receive} color="secondary" size="md" iconLeading={Truck01} className="shrink-0">
                                        Go to receiving
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                        <p role="status" className="text-sm text-secondary">
                                            <span className="font-semibold text-primary tabular-nums">
                                                {sentCount} of {listed.length} sent
                                            </span>
                                            {waiting > 0 && `. ${waiting} not approved yet: approval happens on the order's own page.`}
                                        </p>
                                        <span
                                            role="progressbar"
                                            aria-valuemin={0}
                                            aria-valuemax={listed.length}
                                            aria-valuenow={sentCount}
                                            aria-label={`${sentCount} of ${listed.length} orders sent`}
                                            className="block h-2 w-full overflow-hidden rounded-full bg-quaternary lg:max-w-md"
                                        >
                                            <span
                                                className="block h-full rounded-full bg-fg-brand-primary transition-[width] duration-200 ease-linear"
                                                style={{ width: `${Math.round((sentCount / listed.length) * 100)}%` }}
                                            />
                                        </span>
                                    </div>
                                </>
                            )}
                        </section>

                        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start lg:gap-6">
                            {/* Orders, grouped by vendor */}
                            <div className={cx("flex min-w-0 flex-col gap-4", step === "order" && selected && "max-lg:hidden")}>
                                <ul aria-label="Orders to send" className="flex flex-col gap-2.5">
                                    {listed.map((po) => {
                                        const vendor = vendorById(po.vendorId);
                                        const status = statusOf(po);
                                        const locked = isLocked(status);
                                        const record = sent[po.id];
                                        const method = methodOf(po, vendor);
                                        const MethodIcon = SEND_METHOD_ICON[method];
                                        const methodLabel = sendOptions(vendor).find((o) => o.method === method)?.label ?? "";
                                        const isSelected = selected?.id === po.id;
                                        const summary = (
                                            <>
                                                <span className="flex items-start justify-between gap-3">
                                                    <span className="flex min-w-0 flex-col gap-0.5">
                                                        <span className="text-md font-semibold text-primary">{vendor.name}</span>
                                                        <span className="text-sm text-tertiary tabular-nums">
                                                            {po.number} · {plural(orderedLines(po).length, "line")}, {plural(unitCount(po), "unit")}
                                                        </span>
                                                    </span>
                                                    <OrderStatusBadge status={status} />
                                                </span>
                                                {!locked && !record && (
                                                    <span className="flex items-center gap-1.5 text-sm text-secondary">
                                                        <MethodIcon className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                        {methodLabel}
                                                    </span>
                                                )}
                                            </>
                                        );

                                        if (locked) {
                                            return (
                                                <li key={po.id} className="flex flex-col gap-2.5 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
                                                    {summary}
                                                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-secondary pt-2.5">
                                                        <span className="flex items-center gap-1.5 text-sm font-medium text-secondary">
                                                            <Lock01 className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                            {status === "cancelled"
                                                                ? "Cancelled"
                                                                : status === "draft"
                                                                  ? "Draft: submit for approval"
                                                                  : "Waiting for approval"}
                                                        </span>
                                                        <Button href={ROUTES.order(po.id)} color="link-color" size="sm" className="max-lg:min-h-11">
                                                            Open order
                                                        </Button>
                                                    </span>
                                                </li>
                                            );
                                        }
                                        return (
                                            <li key={po.id}>
                                                <button
                                                    type="button"
                                                    aria-current={isSelected ? "true" : undefined}
                                                    onClick={() => open(po.id)}
                                                    className={cx(
                                                        "flex w-full cursor-pointer flex-col gap-2.5 rounded-xl bg-primary p-4 text-left shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2",
                                                        isSelected && "lg:bg-brand-primary_alt lg:ring-2 lg:ring-brand lg:hover:bg-brand-primary_alt",
                                                    )}
                                                >
                                                    {summary}
                                                    <span className="flex items-center justify-between gap-3 border-t border-secondary pt-2.5">
                                                        {record ? (
                                                            <span className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                                                                <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
                                                                Sent · {SENT_VIA_LABEL[record.via]}, {record.at}
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm font-medium text-tertiary">Not sent</span>
                                                        )}
                                                        <ChevronRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                    </span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                                <Explainer />
                            </div>

                            {/* The selected order */}
                            <div className={cx("flex min-w-0 flex-col gap-4", (step === "list" || !selected) && "max-lg:hidden")}>
                                {!selected && (
                                    <Card className="flex items-start gap-3">
                                        <Lock01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                        <p className="text-sm text-secondary">
                                            <span className="font-semibold text-primary">Nothing can be sent yet.</span> Every order here is waiting for an
                                            owner&apos;s approval. Open an order to see where it stands.
                                        </p>
                                    </Card>
                                )}
                                {listed
                                    .filter((po) => opened.includes(po.id) && !isLocked(statusOf(po)))
                                    .map((po) => {
                                        const vendor = vendorById(po.vendorId);
                                        const status = statusOf(po);
                                        const record = sent[po.id];
                                        const lines = orderedLines(po);
                                        const expanded = showAllLines.includes(po.id);
                                        const shownLines = lines.slice(0, expanded ? LINES_MAX : lines.length > LINES_INLINE ? LINES_SHOWN : LINES_INLINE);
                                        return (
                                            <div key={po.id} hidden={po.id !== selected?.id} className="flex flex-col gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setStep("list")}
                                                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-md text-sm font-medium text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:hidden"
                                                >
                                                    <ArrowLeft className="size-4" aria-hidden="true" />
                                                    All orders · {sentCount} of {listed.length} sent
                                                </button>

                                                <Card padded={false} className="overflow-hidden">
                                                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4 lg:px-5">
                                                        <div className="flex min-w-0 flex-col gap-1">
                                                            <h2 className="text-lg font-semibold text-primary">{vendor.name}</h2>
                                                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tertiary">
                                                                <a
                                                                    href={ROUTES.order(po.id)}
                                                                    className="inline-flex min-h-11 items-center rounded-sm font-medium text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2 lg:min-h-0"
                                                                >
                                                                    {po.number}
                                                                </a>
                                                                <span className="tabular-nums">
                                                                    {plural(lines.length, "line")}, {plural(unitCount(po), "unit")} for{" "}
                                                                    {locationName(po.locationId)}
                                                                </span>
                                                                <OrderStatusBadge status={status} />
                                                            </p>
                                                        </div>
                                                        {canSend && !record && (
                                                            <Button
                                                                color="secondary"
                                                                size="md"
                                                                iconLeading={Check}
                                                                className="max-lg:hidden"
                                                                onClick={() => setMarking({ id: po.id, via: VIA_FOR_METHOD[methodOf(po, vendor)] })}
                                                            >
                                                                Mark as sent
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {record && (
                                                        <div
                                                            role="status"
                                                            className="flex flex-col gap-3 border-t border-utility-green-200 bg-success-primary p-4 lg:flex-row lg:items-center lg:justify-between lg:px-5"
                                                        >
                                                            <p className="flex items-start gap-2 text-sm text-secondary">
                                                                <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                                                                <span>
                                                                    <span className="font-semibold text-primary">
                                                                        Marked as sent at {record.at}: {SENT_VIA_LABEL[record.via].toLowerCase()}.
                                                                    </span>{" "}
                                                                    {record.via === "resend" || record.via === "transfer" ? "Nothing left the prototype. " : ""}
                                                                    Log the delivery against {po.number} when it arrives.
                                                                </span>
                                                            </p>
                                                            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                                                                <Button
                                                                    color="link-gray"
                                                                    size="sm"
                                                                    iconLeading={ReverseLeft}
                                                                    className="max-lg:min-h-11"
                                                                    onClick={() => unmark(po.id)}
                                                                >
                                                                    Mark as not sent
                                                                </Button>
                                                                {next && (
                                                                    <Button
                                                                        color="primary"
                                                                        size="md"
                                                                        iconTrailing={ArrowRight}
                                                                        className="max-lg:hidden"
                                                                        onClick={() => open(next.id)}
                                                                    >
                                                                        Next: {vendorById(next.vendorId).name}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(status === "draft" || isPlaced(status)) && (
                                                        <p className="flex items-start gap-2 border-t border-secondary bg-secondary px-4 py-3 text-sm text-secondary lg:px-5">
                                                            <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                            {status === "draft"
                                                                ? "Still a draft: it has not been through approval. Check the quantities on the order before it goes out."
                                                                : `Already marked ${ORDER_STATUS[status].label.toLowerCase()} on the order. Sending it again does not change that.`}
                                                        </p>
                                                    )}

                                                    <ul aria-label={`Lines on ${po.number}`} className="divide-y divide-secondary border-t border-secondary">
                                                        {shownLines.map((l) => {
                                                            const item = l.itemId ? getItem(l.itemId) : undefined;
                                                            const detail = [l.colorCode ?? l.sku ?? item?.sku, l.variant].filter(Boolean).join(" · ");
                                                            return (
                                                                <li key={l.id} className="flex items-center gap-3 px-4 py-2 lg:px-5">
                                                                    <ItemThumb item={item ?? { name: l.name, kind: "supply" }} size="sm" />
                                                                    <span className="flex min-w-0 flex-1 flex-col">
                                                                        <span className="truncate text-sm font-medium text-primary">{l.name}</span>
                                                                        {detail && <span className="truncate text-xs text-tertiary">{detail}</span>}
                                                                    </span>
                                                                    <span className="shrink-0 text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
                                                                        {item?.unit ? formatCount(l.qtyOrdered, item.unit) : l.qtyOrdered}
                                                                    </span>
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                    {lines.length > LINES_INLINE && (
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-secondary px-4 py-2 lg:px-5">
                                                            <Button
                                                                color="link-color"
                                                                size="sm"
                                                                className="max-lg:min-h-11"
                                                                onClick={() =>
                                                                    setShowAllLines((prev) => (expanded ? prev.filter((id) => id !== po.id) : [...prev, po.id]))
                                                                }
                                                            >
                                                                {expanded ? "Show fewer lines" : `Show all ${lines.length} lines`}
                                                            </Button>
                                                            {expanded && lines.length > LINES_MAX && (
                                                                <span className="text-sm text-tertiary">
                                                                    {lines.length - LINES_MAX} more are on the order&apos;s own page.
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </Card>

                                                <Card className="flex flex-col gap-4">
                                                    <h2 className="text-md font-semibold text-primary">How this order is sent</h2>
                                                    {canSend ? (
                                                        <SendMethodPanel
                                                            po={po}
                                                            vendor={vendor}
                                                            sender={user}
                                                            asker={user}
                                                            method={methodOf(po, vendor)}
                                                            onMethodChange={(m) => setMethods((prev) => ({ ...prev, [po.id]: m }))}
                                                            onSent={(via) => markSent(po.id, via)}
                                                        />
                                                    ) : (
                                                        <p className="flex items-start gap-2 text-sm text-secondary">
                                                            <Lock01 className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                            Managers and owners send orders. You can see what is waiting and what has gone out.
                                                        </p>
                                                    )}
                                                </Card>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </>
                )}

                <SampleDataNote>
                    Vendor contacts and order email addresses are placeholders (example.com), not real vendor details. November order lines were generated from
                    the reorder suggestions. Nothing leaves the prototype: Resend, cart links and the Amazon Business API are not connected, and
                    &ldquo;sent&rdquo; is kept in this browser tab only.
                </SampleDataNote>

                {/* Phone: the action for the open order, above the tab bar */}
                {step === "order" && selected && canSend && (
                    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex gap-2 rounded-xl bg-primary/95 p-2 shadow-lg ring-1 ring-secondary backdrop-blur lg:hidden">
                        {sent[selected.id] ? (
                            <>
                                <Button color="secondary" size="lg" className="flex-1" onClick={() => setStep("list")}>
                                    All orders
                                </Button>
                                {next && (
                                    <Button color="primary" size="lg" className="flex-1" iconTrailing={ArrowRight} onClick={() => open(next.id)}>
                                        Next order
                                    </Button>
                                )}
                            </>
                        ) : (
                            <Button
                                color="secondary"
                                size="lg"
                                className="flex-1"
                                iconLeading={Check}
                                onClick={() => setMarking({ id: selected.id, via: VIA_FOR_METHOD[methodOf(selected)] })}
                            >
                                Mark as sent
                            </Button>
                        )}
                    </div>
                )}
            </PageContent>

            {marking && marked && markedVendor && (
                <ModalOverlay isOpen isDismissable onOpenChange={(isOpen) => !isOpen && setMarking(null)}>
                    <Modal className="sm:max-w-md">
                        <Dialog aria-label="Mark order as sent">
                            <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-semibold text-primary">Mark {marked.number} as sent</h2>
                                    <p className="text-sm text-tertiary">For an order to {markedVendor.name} that has already gone out. How was it sent?</p>
                                </div>
                                <RadioGroup
                                    aria-label="How the order was sent"
                                    size="md"
                                    value={marking.via}
                                    onChange={(v) => setMarking({ id: marking.id, via: v as SentVia })}
                                    className="gap-1"
                                >
                                    {MANUAL_VIA.filter((o) => o.via !== "transfer" || markedVendor.channel === "internal").map((o) => (
                                        <RadioButton key={o.via} value={o.via} label={o.label} hint={o.hint} className="py-2" />
                                    ))}
                                </RadioGroup>
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <Button color="secondary" size="md" onClick={() => setMarking(null)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        color="primary"
                                        size="md"
                                        iconLeading={Check}
                                        onClick={() => {
                                            markSent(marking.id, marking.via);
                                            setMarking(null);
                                        }}
                                    >
                                        Mark as sent
                                    </Button>
                                </div>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
        </AppShell>
    );
};
