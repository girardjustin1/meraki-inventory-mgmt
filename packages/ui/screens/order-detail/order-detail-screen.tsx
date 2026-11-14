"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle, Minus, Plus, Send01, Trash01, Truck01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { FlagCard } from "@/components/meraki/flag-card";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { NoteThread } from "@/components/meraki/note-thread";
import { OrderProgress } from "@/components/meraki/order-progress";
import { SENT_VIA_LABEL, SendMethodPanel } from "@/components/meraki/send-method-panel";
import { SendOptionList, bestSendOption } from "@/components/meraki/send-option-list";
import { OrderStatusBadge, SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, flags, getItem, locationName, purchaseOrders, userById, users, vendorById } from "@/data/inventory";
import type { LocationId, OrderChannel, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, User } from "@/data/types";
import { formatDate, formatMonth } from "@/engine/dates";
import type { SendMethod } from "@/engine/order-send";
import { ordersToSend } from "@/engine/order-send";
import { can, isAdmin } from "@/engine/permissions";
import { formatCurrency } from "@/engine/stock";
import { cx } from "@/utils/cx";

const LINE_PAGE = 50;
const KIND_LABEL: Record<PurchaseOrder["kind"], string> = { supply: "Supplies", polish: "Polish" };
const day = (iso: string) => formatDate(iso.slice(0, 10), iso.slice(0, 4) !== TODAY.slice(0, 4));

const CHANNEL_LABEL: Record<OrderChannel, string> = {
    "email-po": "Emailed purchase order",
    portal: "Vendor portal",
    "in-store": "Bought in person",
    api: "Amazon Business API",
    internal: "Internal transfer",
};

const isSentStatus = (s: PurchaseOrderStatus) => s === "sent" || s === "partially-received" || s === "received";

const QtyStepper = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => {
    const btn =
        "flex size-11 cursor-pointer items-center justify-center text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:size-9";
    return (
        <div
            role="group"
            aria-label={label}
            className="inline-flex items-center overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-primary ring-inset"
        >
            <button type="button" aria-label="One fewer" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} className={btn}>
                <Minus className="size-4" aria-hidden="true" />
            </button>
            <input
                aria-label={label}
                inputMode="numeric"
                value={value}
                onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, ""));
                    onChange(Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1);
                }}
                className="h-11 w-11 border-x border-secondary bg-primary text-center text-sm font-semibold text-primary tabular-nums outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2 lg:h-9"
            />
            <button type="button" aria-label="One more" onClick={() => onChange(Math.min(999, value + 1))} className={btn}>
                <Plus className="size-4" aria-hidden="true" />
            </button>
        </div>
    );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-xs font-medium text-tertiary">{label}</dt>
        <dd className="text-sm font-medium text-primary">{children}</dd>
    </div>
);

/** Received cell: quantity against ordered, with anything unusual said in plain words. */
const Received = ({ line, sent }: { line: PurchaseOrderLine; sent: boolean }) => {
    if (!sent || line.qtyOrdered === 0) return <span className="text-quaternary">–</span>;
    if (line.qtyReceived === 0) return <span className="whitespace-nowrap text-tertiary">Not received</span>;
    const diff = line.qtyReceived - line.qtyOrdered;
    const wrongType = line.variantReceived && line.variant && line.variantReceived.toLowerCase() !== line.variant.toLowerCase();
    return (
        <span className="flex flex-col gap-0.5 whitespace-nowrap">
            <span className={cx("font-medium whitespace-nowrap tabular-nums", diff === 0 ? "text-primary" : "text-warning-primary")}>
                {line.qtyReceived} of {line.qtyOrdered}
                {diff !== 0 && `, ${diff < 0 ? `${-diff} short` : `${diff} extra`}`}
            </span>
            {wrongType && <span className="text-xs text-warning-primary">Arrived as {line.variantReceived}</span>}
            {line.receivedAt && <span className="text-xs text-tertiary">{day(line.receivedAt)}</span>}
        </span>
    );
};

const LineItem = ({ line }: { line: PurchaseOrderLine }) => {
    const item = line.itemId ? getItem(line.itemId) : undefined;
    const sub = [line.colorCode ?? line.sku ?? item?.sku, line.variant].filter(Boolean).join(" · ");
    return (
        <span className="flex min-w-0 items-center gap-3">
            <ItemThumb item={item ?? { name: line.name, kind: "supply" }} size="md" />
            <span className="flex min-w-0 flex-col gap-0.5">
                {item ? (
                    <a
                        href={ROUTES.item(item.id)}
                        className="rounded-sm text-sm font-semibold text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        {line.name}
                    </a>
                ) : (
                    <span className="text-sm font-semibold text-primary">{line.name}</span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary">
                    {sub && <span>{sub}</span>}
                    {!item && (
                        <Badge type="modern" color="gray" size="sm">
                            Not in catalogue
                        </Badge>
                    )}
                    {line.discontinued && (
                        <Badge type="color" color="warning" size="sm">
                            Discontinued
                        </Badge>
                    )}
                </span>
            </span>
        </span>
    );
};

// ------------------------------------------------------------------------------------ screen

/** Default: the order waiting for the owner's approval. */
const defaultOrder = () => purchaseOrders.find((po) => po.status === "awaiting-approval") ?? (purchaseOrders[0] as PurchaseOrder);

interface OrderDetailScreenProps {
    orderId?: string;
    user?: User;
    /** Status to open on, in place of the order's own (for stories: the sample data has no approved order yet). */
    status?: PurchaseOrderStatus;
    /** Way of sending to open on (for stories). Defaults to the best one ready for the vendor. */
    sendMethod?: SendMethod;
}

export const OrderDetailScreen = ({ orderId, user = CURRENT_USER, status: initialStatus, sendMethod }: OrderDetailScreenProps) => {
    const po = purchaseOrders.find((p) => p.id === orderId) ?? defaultOrder();
    // A story that opens an unapproved order as approved needs an approver and a date to show.
    const assumedApproval = initialStatus === "approved" && po.status !== "approved" && !po.approvedBy;
    const [location, setLocation] = useState<LocationId>(po.locationId);
    const [status, setStatus] = useState<PurchaseOrderStatus>(initialStatus ?? po.status);
    const [lines, setLines] = useState<PurchaseOrderLine[]>(po.lines);
    const [approvedBy, setApprovedBy] = useState(assumedApproval ? users.find((u) => isAdmin(u))?.id : po.approvedBy);
    const [stamps, setStamps] = useState<{ approved?: string; sent?: string }>(assumedApproval ? { approved: TODAY } : {});
    const [sentBack, setSentBack] = useState<{ note: string; by: string } | null>(null);
    const [sendBackOpen, setSendBackOpen] = useState(false);
    const [note, setNote] = useState("");
    const [noteTried, setNoteTried] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [limit, setLimit] = useState(LINE_PAGE);

    const vendor = vendorById(po.vendorId);
    const [method, setMethod] = useState<SendMethod>(sendMethod ?? bestSendOption(vendor).method);
    const creator = userById(po.createdBy);
    const approver = userById(approvedBy);
    const sent = isSentStatus(status);
    const editable = status === "draft";
    const ordered = lines.filter((l) => l.qtyOrdered > 0);
    const receivedLines = ordered.filter((l) => l.qtyReceived > 0);
    const unitsOrdered = ordered.reduce((n, l) => n + l.qtyOrdered, 0);
    const unitsReceived = ordered.reduce((n, l) => n + l.qtyReceived, 0);
    const total = lines.reduce((sum, l) => sum + l.qtyOrdered * (l.unitCost ?? 0), 0);
    const unpriced = ordered.filter((l) => l.unitCost === undefined).length;
    const lastReceipt = receivedLines
        .map((l) => l.receivedAt ?? "")
        .sort()
        .pop();
    const linkedFlags = flags.filter((f) => f.purchaseOrderId === po.id);
    const shownLines = lines.slice(0, limit);
    const showNotes = !editable && lines.some((l) => l.note);

    const isCreator = user.id === po.createdBy;
    const canApprove = can(user, "orders.approve", po.locationId) && !isCreator;
    const canManage = can(user, "orders.create", po.locationId);

    const setQty = (id: string, qty: number) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qtyOrdered: qty } : l)));
    const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));
    const markSent = (text: string) => {
        setStatus("sent");
        setStamps((s) => ({ ...s, sent: TODAY }));
        setMessage(text);
    };
    /** Other orders at this location that have not gone to their vendor yet. */
    const alsoWaiting = ordersToSend(purchaseOrders, po.locationId).filter((o) => o.id !== po.id).length;
    const sendOrdersLink = alsoWaiting > 0 && (
        <Button href={ROUTES.sendOrders} color="link-color" size="sm" iconTrailing={ArrowRight} className="self-start max-lg:min-h-11">
            Send orders: {alsoWaiting} more waiting
        </Button>
    );

    // ---- approval bar ----------------------------------------------------------------------
    let barText: ReactNode;
    let barTone: "neutral" | "warning" | "good" = "neutral";
    let barButtons: ((size: "sm" | "lg") => ReactNode) | null = null;

    if (status === "draft") {
        barText = sentBack ? (
            <>
                <span className="font-semibold">Sent back by {userById(sentBack.by)?.name ?? "the owner"}.</span> &ldquo;{sentBack.note}&rdquo;
            </>
        ) : (
            <>
                <span className="font-semibold">Draft.</span> Adjust the quantities or remove lines, then submit it for the owner&apos;s approval.
            </>
        );
        if (sentBack) barTone = "warning";
        if (canManage)
            barButtons = (size) => (
                <Button
                    color="primary"
                    size={size}
                    className="max-lg:flex-1"
                    isDisabled={ordered.length === 0}
                    onClick={() => {
                        setStatus("awaiting-approval");
                        setSentBack(null);
                        setMessage("Submitted for approval. The owner has been notified.");
                    }}
                >
                    Submit for approval
                </Button>
            );
    } else if (status === "awaiting-approval") {
        barTone = "warning";
        if (canApprove) {
            barText = (
                <>
                    <span className="font-semibold">Needs your approval.</span> {creator?.name ?? "A manager"} submitted {ordered.length} lines for{" "}
                    {vendor.name} on {day(po.createdAt)}.
                </>
            );
            barButtons = (size) => (
                <>
                    <Button color="secondary" size={size} className="max-lg:flex-1" onClick={() => setSendBackOpen(true)}>
                        Send back
                    </Button>
                    <Button
                        color="primary"
                        size={size}
                        className="max-lg:flex-1"
                        iconLeading={Check}
                        onClick={() => {
                            setStatus("approved");
                            setApprovedBy(user.id);
                            setStamps((s) => ({ ...s, approved: TODAY }));
                            setMessage("Approved. The order is ready to send.");
                        }}
                    >
                        Approve
                    </Button>
                </>
            );
        } else if (isCreator) {
            barText = (
                <>
                    <span className="font-semibold">Waiting for owner approval.</span> You created this order, so it needs a second person to approve it before
                    it can be sent.
                </>
            );
        } else {
            barText = (
                <>
                    <span className="font-semibold">Waiting for owner approval.</span>{" "}
                    {can(user, "orders.approve")
                        ? "Orders are approved by someone other than the person who created them."
                        : "Only an admin can approve orders."}
                </>
            );
        }
    } else if (status === "approved") {
        barTone = "good";
        barText = (
            <>
                <span className="font-semibold">Approved{approver ? ` by ${approver.name}` : ""}.</span> Ready to send: see &ldquo;How this order is sent&rdquo;
                below.
            </>
        );
        if (canManage)
            barButtons = (size) => (
                <Button color="primary" size={size} className="max-lg:flex-1" iconLeading={Send01} onClick={() => markSent("Marked as sent.")}>
                    Mark as sent
                </Button>
            );
    } else if (status === "received") {
        barTone = "good";
        barText = (
            <>
                <span className="font-semibold">Fully received{po.closedAt ? ` on ${day(po.closedAt)}` : ""}.</span> Every line with a quantity has a receipt
                logged.
            </>
        );
    } else {
        barText = (
            <>
                <span className="font-semibold">
                    {status === "sent" ? "Placed, nothing received yet." : `Partly received: ${receivedLines.length} of ${ordered.length} lines.`}
                </span>{" "}
                Log deliveries against this order as they arrive.
            </>
        );
        barButtons = (size) => (
            <Button href={ROUTES.receive} color="secondary" size={size} className="max-lg:flex-1" iconLeading={Truck01}>
                Receive a delivery
            </Button>
        );
    }

    // ---- timeline ----------------------------------------------------------------------------
    const approvedDone = status === "approved" || sent;
    const steps: { title: string; state: "done" | "current" | "next"; who?: User; detail: string }[] = [
        {
            title: "Created",
            state: "done",
            who: creator,
            detail: po.imported ? `Order form dated ${day(po.createdAt)}` : day(po.createdAt),
        },
        {
            title: "Approved",
            state: approvedDone ? "done" : status === "awaiting-approval" ? "current" : "next",
            who: approvedDone ? approver : undefined,
            detail: approvedDone
                ? stamps.approved
                    ? day(stamps.approved)
                    : "Date not recorded"
                : status === "awaiting-approval"
                  ? "Waiting for the owner"
                  : "After the draft is submitted",
        },
        {
            title: "Sent",
            state: sent ? "done" : status === "approved" ? "current" : "next",
            detail: sent ? (po.sentAt ? day(po.sentAt) : stamps.sent ? day(stamps.sent) : "Date not recorded") : CHANNEL_LABEL[vendor.channel],
        },
        {
            title: "Received",
            state: status === "received" ? "done" : status === "sent" || status === "partially-received" ? "current" : "next",
            detail:
                status === "received"
                    ? po.closedAt
                        ? day(po.closedAt)
                        : "All lines received"
                    : status === "partially-received"
                      ? `${receivedLines.length} of ${ordered.length} lines so far${lastReceipt ? `, last on ${day(lastReceipt)}` : ""}`
                      : status === "sent"
                        ? `Usually about ${vendor.leadTimeDays} days${vendor.leadTimeIsEstimate ? " (estimate)" : ""}`
                        : "After it is sent",
        },
    ];

    const th = "px-4 py-3 text-xs font-semibold whitespace-nowrap text-tertiary first:pl-5 last:pr-5";
    const td = "px-4 py-3 align-middle first:pl-5 last:pr-5";
    const barBg =
        barTone === "warning"
            ? "bg-warning-primary ring-utility-yellow-200"
            : barTone === "good"
              ? "bg-success-primary ring-utility-green-200"
              : "bg-primary ring-secondary";

    return (
        <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
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
                    title={po.number}
                    description={
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                            <span>
                                {vendor.name} <ArrowRight className="inline size-4 align-[-3px] text-fg-quaternary" aria-label="to" />{" "}
                                {locationName(po.locationId)}
                            </span>
                            <OrderStatusBadge status={status} size="md" />
                            {po.imported && (
                                <Badge type="modern" color="gray" size="md">
                                    Imported from the 2026 backlog
                                </Badge>
                            )}
                        </span>
                    }
                />

                <section
                    aria-label="Order status"
                    className={cx(
                        "flex flex-col gap-3 rounded-xl p-4 shadow-xs ring-1 ring-inset lg:flex-row lg:items-center lg:justify-between lg:px-5",
                        barBg,
                    )}
                >
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="text-sm text-secondary">{barText}</p>
                        {message && (
                            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                                <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
                                {message}
                            </p>
                        )}
                    </div>
                    {barButtons && <div className="hidden shrink-0 items-center gap-2 lg:flex">{barButtons("sm")}</div>}
                </section>

                <Card>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                        <Fact label="Vendor">{vendor.name}</Fact>
                        <Fact label="Location">{locationName(po.locationId)}</Fact>
                        <Fact label="Cycle">
                            {formatMonth(po.cycle)} · {KIND_LABEL[po.kind]}
                        </Fact>
                        <Fact label={po.imported ? "Order form dated" : "Created"}>{day(po.createdAt)}</Fact>
                        <Fact label="Created by">
                            <span className="flex items-center gap-2">
                                <Avatar size="xs" initials={initials(creator?.name ?? "?")} />
                                <span className="truncate">{creator?.name ?? "Not recorded"}</span>
                            </span>
                        </Fact>
                    </dl>
                </Card>

                <div className="grid gap-4 lg:grid-cols-3 lg:items-start lg:gap-6">
                    <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
                        {/* Sending: the working panel, once the order is approved */}
                        {status === "approved" && canManage && (
                            <Card className="flex flex-col gap-4">
                                <CardHeader title="How this order is sent" description="The app prepares the order. A person sends it." />
                                <SendMethodPanel
                                    po={{ ...po, lines }}
                                    vendor={vendor}
                                    sender={user}
                                    asker={user}
                                    method={method}
                                    onMethodChange={setMethod}
                                    onSent={(via) =>
                                        markSent(
                                            via === "resend"
                                                ? "Marked as sent by email. Nothing was emailed from the prototype: Resend is not connected."
                                                : `Marked as sent: ${SENT_VIA_LABEL[via].toLowerCase()}.`,
                                        )
                                    }
                                />
                                {sendOrdersLink}
                            </Card>
                        )}

                        {/* Lines */}
                        <Card padded={false} className="overflow-hidden">
                            <div className="p-4 lg:px-5">
                                <CardHeader
                                    title={`${lines.length} line${lines.length === 1 ? "" : "s"}`}
                                    description={
                                        editable
                                            ? "Quantities can be changed until the order is submitted."
                                            : sent
                                              ? "What was ordered and what was logged at receiving."
                                              : status === "approved"
                                                ? "Approved as shown. Quantities are locked."
                                                : "Locked while it waits for approval."
                                    }
                                />
                            </div>

                            {lines.length === 0 ? (
                                <p className="border-t border-secondary px-4 py-8 text-center text-sm text-tertiary lg:px-5">
                                    Every line has been removed. Add items from the reorder suggestions.
                                </p>
                            ) : (
                                <>
                                    <div className="hidden overflow-x-auto border-t border-secondary lg:block">
                                        <table className="w-full text-left text-sm">
                                            <thead className="border-b border-secondary bg-secondary">
                                                <tr>
                                                    <th scope="col" className={th}>
                                                        Item
                                                    </th>
                                                    <th scope="col" className={cx(th, editable ? "text-center" : "text-right")}>
                                                        Ordered
                                                    </th>
                                                    {sent && (
                                                        <th scope="col" className={th}>
                                                            Received
                                                        </th>
                                                    )}
                                                    <th scope="col" className={cx(th, "text-right")}>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            Unit cost <SampleBadge />
                                                        </span>
                                                    </th>
                                                    <th scope="col" className={cx(th, "text-right")}>
                                                        Line total
                                                    </th>
                                                    {(editable || showNotes) && (
                                                        <th scope="col" className={th}>
                                                            {editable ? <span className="sr-only">Remove</span> : "Note"}
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {shownLines.map((l) => (
                                                    <tr key={l.id}>
                                                        <td className={cx(td, "max-w-xs")}>
                                                            <LineItem line={l} />
                                                        </td>
                                                        <td className={cx(td, editable ? "text-center" : "text-right font-medium text-primary tabular-nums")}>
                                                            {editable ? (
                                                                <QtyStepper
                                                                    value={l.qtyOrdered}
                                                                    onChange={(v) => setQty(l.id, v)}
                                                                    label={`Quantity of ${l.name}`}
                                                                />
                                                            ) : l.qtyOrdered > 0 ? (
                                                                l.qtyOrdered
                                                            ) : (
                                                                <span className="font-normal whitespace-nowrap text-quaternary">None given</span>
                                                            )}
                                                        </td>
                                                        {sent && (
                                                            <td className={td}>
                                                                <Received line={l} sent={sent} />
                                                            </td>
                                                        )}
                                                        <td className={cx(td, "text-right text-tertiary tabular-nums")}>
                                                            {l.unitCost !== undefined ? formatCurrency(l.unitCost, true) : "–"}
                                                        </td>
                                                        <td className={cx(td, "text-right font-medium text-primary tabular-nums")}>
                                                            {l.unitCost !== undefined && l.qtyOrdered > 0
                                                                ? formatCurrency(l.qtyOrdered * l.unitCost, true)
                                                                : "–"}
                                                        </td>
                                                        {(editable || showNotes) && (
                                                            <td className={cx(td, editable ? "w-12 text-right" : "max-w-48 text-xs text-tertiary")}>
                                                                {editable ? (
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Remove ${l.name}`}
                                                                        onClick={() => removeLine(l.id)}
                                                                        className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-error-primary hover:text-fg-error-primary focus-visible:outline-2"
                                                                    >
                                                                        <Trash01 className="size-4" aria-hidden="true" />
                                                                    </button>
                                                                ) : (
                                                                    l.note
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <ul className="divide-y divide-secondary border-t border-secondary lg:hidden">
                                        {shownLines.map((l) => (
                                            <li key={l.id} className="flex flex-col gap-3 p-4">
                                                <div className="flex items-start justify-between gap-2">
                                                    <LineItem line={l} />
                                                    {editable && (
                                                        <button
                                                            type="button"
                                                            aria-label={`Remove ${l.name}`}
                                                            onClick={() => removeLine(l.id)}
                                                            className="-mt-1.5 -mr-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:bg-error-primary hover:text-fg-error-primary focus-visible:outline-2"
                                                        >
                                                            <Trash01 className="size-5" aria-hidden="true" />
                                                        </button>
                                                    )}
                                                </div>
                                                {editable ? (
                                                    <div className="flex items-center justify-between gap-3">
                                                        <QtyStepper value={l.qtyOrdered} onChange={(v) => setQty(l.id, v)} label={`Quantity of ${l.name}`} />
                                                        <span className="text-right text-sm">
                                                            <span className="font-semibold text-primary tabular-nums">
                                                                {l.unitCost !== undefined ? formatCurrency(l.qtyOrdered * l.unitCost, true) : "No cost"}
                                                            </span>
                                                            {l.unitCost !== undefined && (
                                                                <span className="block text-xs text-tertiary">
                                                                    {formatCurrency(l.unitCost, true)} each, sample
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <dl className={cx("grid gap-3 text-sm", sent ? "grid-cols-3" : "grid-cols-2")}>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Ordered</dt>
                                                            <dd className="font-medium text-primary tabular-nums">
                                                                {l.qtyOrdered > 0 ? l.qtyOrdered : <span className="font-normal text-quaternary">None</span>}
                                                            </dd>
                                                        </div>
                                                        {sent && (
                                                            <div className="flex flex-col gap-0.5">
                                                                <dt className="text-xs text-tertiary">Received</dt>
                                                                <dd>
                                                                    <Received line={l} sent={sent} />
                                                                </dd>
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col gap-0.5 text-right">
                                                            <dt className="text-xs text-tertiary">Total (sample)</dt>
                                                            <dd className="font-medium text-primary tabular-nums">
                                                                {l.unitCost !== undefined && l.qtyOrdered > 0
                                                                    ? formatCurrency(l.qtyOrdered * l.unitCost, true)
                                                                    : "–"}
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                )}
                                                {l.note && !editable && <p className="text-xs text-tertiary">Note: {l.note}</p>}
                                            </li>
                                        ))}
                                    </ul>

                                    {lines.length > shownLines.length && (
                                        <div className="border-t border-secondary p-3 text-center">
                                            <Button color="secondary" size="md" onClick={() => setLimit((n) => n + LINE_PAGE)}>
                                                Show {Math.min(LINE_PAGE, lines.length - shownLines.length)} more of {lines.length} lines
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </Card>

                        {/* Linked flags */}
                        {linkedFlags.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-md font-semibold text-primary">
                                        {linkedFlags.length} flag{linkedFlags.length === 1 ? "" : "s"} on this order
                                    </h2>
                                    <Button href={ROUTES.flags} color="link-color" size="sm">
                                        Open the review queue
                                    </Button>
                                </div>
                                <ul className="flex flex-col gap-3">
                                    {linkedFlags.slice(0, 4).map((f) => (
                                        <li key={f.id}>
                                            <FlagCard flag={f} href={ROUTES.flag(f.id)} showLocation={false} />
                                        </li>
                                    ))}
                                </ul>
                                {linkedFlags.length > 4 && <p className="text-sm text-tertiary">{linkedFlags.length - 4} more in the review queue.</p>}
                            </section>
                        )}

                        <Card className="flex flex-col gap-4">
                            <CardHeader title="Notes" description="Type @ to bring someone in. They are notified and get a link to this order." />
                            <NoteThread
                                key={po.id}
                                subject={{ type: "order", id: po.id }}
                                subjectTitle={po.number}
                                href={ROUTES.order(po.id)}
                                user={user}
                                location={po.locationId}
                            />
                        </Card>
                    </div>

                    {/* Side column */}
                    <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
                        <Card className="flex flex-col gap-4">
                            <CardHeader title="Totals" actions={<SampleBadge label="Sample costs" />} />
                            <dl className="flex flex-col gap-2.5 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-tertiary">Lines</dt>
                                    <dd className="font-medium text-primary tabular-nums">{ordered.length}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-tertiary">Units ordered</dt>
                                    <dd className="font-medium text-primary tabular-nums">{unitsOrdered}</dd>
                                </div>
                                {sent && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-tertiary">Units received</dt>
                                        <dd className="font-medium text-primary tabular-nums">{unitsReceived}</dd>
                                    </div>
                                )}
                                <div className="flex items-baseline justify-between gap-3 border-t border-secondary pt-2.5">
                                    <dt className="font-semibold text-secondary">Estimated total</dt>
                                    <dd className="text-lg font-semibold text-primary tabular-nums">
                                        {total > 0 ? formatCurrency(total, true) : "No costs yet"}
                                    </dd>
                                </div>
                            </dl>
                            {unpriced > 0 && (
                                <p className="text-xs text-tertiary">
                                    {unpriced} line{unpriced === 1 ? " has" : "s have"} no cost because {unpriced === 1 ? "it is" : "they are"} not matched to a
                                    catalogue item, so the total is incomplete.
                                </p>
                            )}
                            {sent && <OrderProgress size="md" received={receivedLines.length} total={ordered.length} />}
                        </Card>

                        <Card className="flex flex-col gap-4">
                            <CardHeader title={vendor.name} description="Vendor" />
                            <dl className="flex flex-col gap-2.5 text-sm">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-tertiary">Order channel</dt>
                                    <dd className="text-right font-medium text-primary">{CHANNEL_LABEL[vendor.channel]}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-tertiary">Lead time</dt>
                                    <dd className="flex items-center gap-1.5 font-medium text-primary">
                                        About {vendor.leadTimeDays} days
                                        {vendor.leadTimeIsEstimate && (
                                            <Badge type="color" color="gray" size="sm">
                                                Estimate
                                            </Badge>
                                        )}
                                    </dd>
                                </div>
                                {vendor.contact && (
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-tertiary">Contact</dt>
                                        <dd className="text-right font-medium text-primary">{vendor.contact}</dd>
                                    </div>
                                )}
                            </dl>
                            {vendor.note && <p className="text-sm text-tertiary">{vendor.note}</p>}
                        </Card>

                        {!(status === "approved" && canManage) && (
                            <Card className="flex flex-col gap-4">
                                <CardHeader title="How this order is sent" />
                                <SendOptionList vendor={vendor} value={method} isDisabled />
                                <p className="text-sm text-tertiary">
                                    {sent
                                        ? "This order has already been placed."
                                        : status === "approved"
                                          ? "Managers and owners send orders."
                                          : "Available once the order is approved."}
                                </p>
                                {sendOrdersLink}
                            </Card>
                        )}

                        <Card className="flex flex-col gap-4">
                            <CardHeader title="Status" />
                            <ol className="flex flex-col">
                                {steps.map((s, i) => (
                                    <li key={s.title} aria-current={s.state === "current" ? "step" : undefined} className="relative flex gap-3 pb-5 last:pb-0">
                                        {i < steps.length - 1 && (
                                            <span
                                                aria-hidden="true"
                                                className={cx(
                                                    "absolute top-6 bottom-0 left-[11px] w-0.5",
                                                    s.state === "done" ? "bg-fg-success-secondary" : "bg-border-secondary",
                                                )}
                                            />
                                        )}
                                        <span
                                            aria-hidden="true"
                                            className={cx(
                                                "relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                                s.state === "done"
                                                    ? "bg-success-secondary text-fg-success-primary"
                                                    : s.state === "current"
                                                      ? "bg-brand-400 text-ink"
                                                      : "bg-secondary text-quaternary ring-1 ring-secondary ring-inset",
                                            )}
                                        >
                                            {s.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                                        </span>
                                        <div className="flex min-w-0 flex-col gap-0.5">
                                            <p className={cx("text-sm font-semibold", s.state === "next" ? "text-tertiary" : "text-primary")}>{s.title}</p>
                                            <p className="text-sm text-tertiary">
                                                {s.who ? `${s.who.name} · ` : ""}
                                                {s.detail}
                                            </p>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </Card>
                    </div>
                </div>

                <SampleDataNote>
                    {po.imported
                        ? "Lines, quantities and received dates come from Meraki's 2026 backlog spreadsheet. Unit costs, totals and staff names are sample values, and the spreadsheet does not record when an order was approved or sent."
                        : "This order was generated from the reorder suggestions to show the approval flow. Unit costs, totals and staff names are sample values."}
                </SampleDataNote>

                {barButtons && (
                    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex gap-2 rounded-xl bg-primary/95 p-2 shadow-lg ring-1 ring-secondary backdrop-blur lg:hidden">
                        {barButtons("lg")}
                    </div>
                )}
            </PageContent>

            {sendBackOpen && (
                <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && setSendBackOpen(false)}>
                    <Modal className="sm:max-w-md">
                        <Dialog aria-label="Send order back">
                            <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-semibold text-primary">Send {po.number} back</h2>
                                    <p className="text-sm text-tertiary">The order returns to draft and {creator?.name ?? "its creator"} sees your note.</p>
                                </div>
                                <TextArea
                                    label="What needs to change"
                                    isRequired
                                    rows={3}
                                    value={note}
                                    onChange={setNote}
                                    isInvalid={noteTried && note.trim().length < 3}
                                    hint={
                                        noteTried && note.trim().length < 3
                                            ? "A note is required."
                                            : "For example: halve the paper towels, we still have a case in the closet."
                                    }
                                />
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <Button color="secondary" size="md" onClick={() => setSendBackOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button
                                        color="primary"
                                        size="md"
                                        onClick={() => {
                                            setNoteTried(true);
                                            if (note.trim().length < 3) return;
                                            setStatus("draft");
                                            setSentBack({ note: note.trim(), by: user.id });
                                            setMessage("Sent back to draft with your note.");
                                            setSendBackOpen(false);
                                        }}
                                    >
                                        Send back
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
