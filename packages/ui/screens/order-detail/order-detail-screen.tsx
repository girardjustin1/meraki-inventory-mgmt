"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
    ArrowLeft,
    ArrowRight,
    Building07,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClockRewind,
    Copy01,
    Download01,
    InfoCircle,
    MarkerPin01,
    Printer,
    SearchLg,
    Send01,
    SlashCircle01,
    Truck01,
    XClose,
} from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, Card, PageContent, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { FlagCard } from "@/components/meraki/flag-card";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { nowIso } from "@/components/meraki/note-body";
import { OrderTimeline } from "@/components/meraki/order-timeline";
import type { TimelineEvent } from "@/components/meraki/order-timeline";
import { ProductPicker, resolveSelection, selectionKey } from "@/components/meraki/product-picker";
import type { PickerSelection } from "@/components/meraki/product-picker";
import { QuantityStepper } from "@/components/meraki/quantity-stepper";
import { SaveBar } from "@/components/meraki/save-bar";
import { SENT_VIA_LABEL, SendMethodPanel } from "@/components/meraki/send-method-panel";
import { bestSendOption } from "@/components/meraki/send-option-list";
import { OrderStatusBadge, SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, flags, getItem, getStock, locationName, purchaseOrders, userById, users, vendorById } from "@/data/inventory";
import { ORDER_CHANNEL_LABEL } from "@/data/labels";
import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, User, VariantId } from "@/data/types";
import { addDays, formatDate, formatMonth } from "@/engine/dates";
import type { SendMethod } from "@/engine/order-send";
import { ordersToSend } from "@/engine/order-send";
import { can, isAdmin } from "@/engine/permissions";
import { formatCurrency } from "@/engine/stock";
import { cx } from "@/utils/cx";

const LINE_PAGE = 50;
const KIND_LABEL: Record<PurchaseOrder["kind"], string> = { supply: "supplies", polish: "polish" };
const day = (iso: string) => formatDate(iso.slice(0, 10), iso.slice(0, 4) !== TODAY.slice(0, 4));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const isSentStatus = (s: PurchaseOrderStatus) => s === "sent" || s === "partially-received" || s === "received";

/** A draft quantity, typed where it is shown. An empty or zero field keeps the last quantity until a number is typed. */
const QtyInput = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => {
    const [text, setText] = useState<string | null>(null);
    return (
        <input
            aria-label={label}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            enterKeyHint="done"
            data-qty
            value={text ?? String(value)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
                const raw = e.currentTarget.value.replace(/\D/g, "").slice(0, 3);
                setText(raw);
                const n = Number(raw);
                if (raw && n > 0) onChange(n);
            }}
            onBlur={() => setText(null)}
            onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-9 w-16 rounded-lg bg-primary px-2.5 text-right text-sm font-medium text-primary tabular-nums shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset focus:ring-2 focus:ring-brand"
        />
    );
};

/** What is unusual about a receipt, in plain words: fewer or more than ordered, or another finish than ordered. */
const receiptNotes = (line: PurchaseOrderLine) => {
    const diff = line.qtyReceived - line.qtyOrdered;
    const wrongType = line.variantReceived && line.variant && line.variantReceived.toLowerCase() !== line.variant.toLowerCase();
    return [diff !== 0 && (diff < 0 ? `${-diff} short` : `${diff} extra`), wrongType && `arrived as ${line.variantReceived}`].filter(Boolean).join(", ");
};

/** Received: quantity against ordered and the date on one line; anything unusual on a second line, only when there is something. */
const Received = ({ line, lead }: { line: PurchaseOrderLine; lead?: string }) => {
    if (line.qtyOrdered === 0) return <span className="text-quaternary">–</span>;
    if (line.qtyReceived === 0) return <span className="whitespace-nowrap text-tertiary">Not received</span>;
    const unusual = receiptNotes(line);
    return (
        <span className="inline-flex flex-col gap-0.5">
            <span className="whitespace-nowrap">
                {lead}
                <span className="font-medium text-primary tabular-nums">
                    {line.qtyReceived} of {line.qtyOrdered}
                </span>
                {line.receivedAt && <span className="text-tertiary"> · {day(line.receivedAt)}</span>}
            </span>
            {unusual && <span className="text-xs font-medium text-warning-primary">{unusual.charAt(0).toUpperCase() + unusual.slice(1)}</span>}
        </span>
    );
};

const chip = "inline-flex shrink-0 items-center rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-tertiary ring-1 ring-secondary ring-inset";

const LineItem = ({ line, showNote }: { line: PurchaseOrderLine; showNote?: boolean }) => {
    const item = line.itemId ? getItem(line.itemId) : undefined;
    const code = line.colorCode ?? line.sku ?? item?.colorCode ?? item?.sku;
    const hasChips = Boolean(code || line.variant || !item || line.discontinued || (showNote && line.note));
    return (
        <span className="flex min-w-0 items-center gap-3">
            <ItemThumb item={item ?? { name: line.name, kind: "supply" }} size="md" />
            <span className="flex min-w-0 flex-col gap-1">
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
                {hasChips && (
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-tertiary">
                        {code && <span className={chip}>{code}</span>}
                        {line.variant && <span className={chip}>{line.variant}</span>}
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
                        {showNote && line.note && <span className="min-w-0">{line.note}</span>}
                    </span>
                )}
            </span>
        </span>
    );
};

/** Previous or next order in the list. With nowhere to go it stays in place, disabled, so the pair does not jump about. */
const StepLink = ({ to, direction }: { to?: PurchaseOrder; direction: "previous" | "next" }) => {
    const shared = {
        color: "secondary" as const,
        size: "md" as const,
        iconLeading: direction === "previous" ? ChevronLeft : ChevronRight,
        className: direction === "previous" ? "rounded-r-none" : "-ml-px rounded-l-none",
    };
    return to ? (
        <Button {...shared} href={ROUTES.order(to.id)} aria-label={`${direction === "previous" ? "Previous" : "Next"} order, ${to.number}`} />
    ) : (
        <Button {...shared} isDisabled aria-label={`No ${direction} order`} />
    );
};

/** One labelled value in the right rail. */
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-baseline justify-between gap-4">
        <dt className="shrink-0 text-tertiary">{label}</dt>
        <dd className="min-w-0 text-right font-medium text-primary">{children}</dd>
    </div>
);

const RailSection = ({ title, marker, children }: { title: string; marker?: ReactNode; children: ReactNode }) => (
    <section className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-primary">{title}</h2>
            {marker}
        </div>
        {children}
    </section>
);

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
    /** Edits to a draft that are not saved yet, to open on (for stories): quantities by line id, and line ids removed. */
    pending?: { quantities?: Record<string, number>; removed?: string[] };
    /** Open with the "More actions" menu showing (for stories). */
    moreOpen?: boolean;
    /** Open with the product picker showing (for stories). */
    pickerOpen?: boolean;
}

export const OrderDetailScreen = ({ orderId, ...rest }: OrderDetailScreenProps) => {
    const po = purchaseOrders.find((p) => p.id === orderId) ?? defaultOrder();
    // Keyed by order: stepping to the next order starts from that order's own lines and status.
    return <OrderDetail key={po.id} po={po} {...rest} />;
};

const OrderDetail = ({
    po,
    user = CURRENT_USER,
    status: initialStatus,
    sendMethod,
    pending,
    moreOpen = false,
    pickerOpen: initialPickerOpen = false,
}: Omit<OrderDetailScreenProps, "orderId"> & { po: PurchaseOrder }) => {
    // A story that opens an unapproved order as approved needs an approver and a date to show.
    const assumedApproval = initialStatus === "approved" && po.status !== "approved" && !po.approvedBy;
    const [location, setLocation] = useState(po.locationId);
    const [status, setStatus] = useState<PurchaseOrderStatus>(initialStatus ?? po.status);
    /** The lines as last saved, and the working copy a draft is edited in. */
    const [savedLines, setSavedLines] = useState<PurchaseOrderLine[]>(po.lines);
    const [lines, setLines] = useState<PurchaseOrderLine[]>(() =>
        po.lines.filter((l) => !pending?.removed?.includes(l.id)).map((l) => ({ ...l, qtyOrdered: pending?.quantities?.[l.id] ?? l.qtyOrdered })),
    );
    const [approvedBy, setApprovedBy] = useState(assumedApproval ? users.find((u) => isAdmin(u))?.id : po.approvedBy);
    const [sentOn, setSentOn] = useState(po.sentAt);
    const [sentBack, setSentBack] = useState<{ note: string; by: string } | null>(null);
    const [sendBackOpen, setSendBackOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(initialPickerOpen);
    const [note, setNote] = useState("");
    const [noteTried, setNoteTried] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [limit, setLimit] = useState(LINE_PAGE);
    /** What happened on this page since it opened, added to the order's recorded history. */
    const [happened, setHappened] = useState<TimelineEvent[]>([]);

    const vendor = vendorById(po.vendorId);
    const [method, setMethod] = useState<SendMethod>(sendMethod ?? bestSendOption(vendor).method);
    const creator = userById(po.createdBy);
    const approver = userById(approvedBy);
    const place = locationName(po.locationId);
    const sent = isSentStatus(status);

    const isCreator = user.id === po.createdBy;
    const canApprove = can(user, "orders.approve", po.locationId) && !isCreator;
    const canManage = can(user, "orders.create", po.locationId);
    const canReceive = can(user, "orders.receive", po.locationId);
    const editable = status === "draft" && canManage;

    const ordered = lines.filter((l) => l.qtyOrdered > 0);
    const unitsOrdered = ordered.reduce((n, l) => n + l.qtyOrdered, 0);
    const unitsReceived = ordered.reduce((n, l) => n + l.qtyReceived, 0);
    const total = lines.reduce((sum, l) => sum + l.qtyOrdered * (l.unitCost ?? 0), 0);
    const unpriced = ordered.filter((l) => l.unitCost === undefined).length;
    const linkedFlags = flags.filter((f) => f.purchaseOrderId === po.id);
    const shownLines = lines.slice(0, limit);

    // ---- unsaved edits -----------------------------------------------------------------------
    const savedById = new Map(savedLines.map((l) => [l.id, l]));
    const changedQty = lines.filter((l) => savedById.has(l.id) && savedById.get(l.id)?.qtyOrdered !== l.qtyOrdered).length;
    const addedCount = lines.filter((l) => !savedById.has(l.id)).length;
    const removedCount = savedLines.filter((l) => !lines.some((x) => x.id === l.id)).length;
    const changeCount = changedQty + addedCount + removedCount;
    const dirty = changeCount > 0;

    const log = (event: Omit<TimelineEvent, "id" | "at">) => setHappened((prev) => [...prev, { ...event, id: `now-${prev.length + 1}`, at: nowIso() }]);
    const setQty = (id: string, qty: number) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qtyOrdered: qty } : l)));
    const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

    const addPicks = (picks: PickerSelection[]) => {
        const stamp = Date.now();
        setLines((prev) => [
            ...prev,
            ...picks.flatMap((pick, i): PurchaseOrderLine[] => {
                const resolved = resolveSelection(pick, po.locationId);
                // An order goes to one vendor. The picker is locked to it; this covers a finish that resolves to another vendor's item.
                if (!resolved || resolved.item.vendorId !== po.vendorId) return [];
                const { item, variantLabel } = resolved;
                return [
                    {
                        id: `new-${stamp}-${i}`,
                        itemId: item.id,
                        name: item.name,
                        sku: item.sku,
                        colorCode: item.colorCode,
                        variant: variantLabel,
                        qtyOrdered: 1,
                        qtyReceived: 0,
                        unitCost: item.unitCost,
                    },
                ];
            }),
        ]);
        setLimit((n) => Math.max(n, lines.length + picks.length));
    };

    const save = () => {
        const parts = [
            changedQty > 0 && `${plural(changedQty, "quantity", "quantities")} changed`,
            addedCount > 0 && `${plural(addedCount, "line")} added`,
            removedCount > 0 && `${plural(removedCount, "line")} removed`,
        ].filter(Boolean);
        setSavedLines(lines);
        setMessage(null);
        log({ text: `${user.name} edited the draft.`, detail: `${parts.join(", ")}.` });
    };

    /** Already on the order, so the picker shows them as added. A colour stocked in several finishes is ruled out one finish at a time. */
    const onOrder = lines.flatMap((l) => {
        if (!l.itemId) return [];
        const finishes = getStock(l.itemId, po.locationId)?.variants ?? [];
        return finishes.length > 1 && l.variant ? [selectionKey({ itemId: l.itemId, variant: l.variant.toLowerCase() as VariantId })] : [l.itemId];
    });

    const markSent = (text: string, how: string) => {
        setStatus("sent");
        setSentOn(TODAY);
        setMessage(text);
        log({ text: `${user.name} marked it as sent to ${vendor.name}.`, detail: how });
    };

    const exportCsv = () => {
        const cell = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const rows = [
            ["Item", "SKU or colour code", "Finish", "Ordered", "Received", "Unit cost (sample)"],
            ...lines.map((l) => [l.name, l.colorCode ?? l.sku ?? "", l.variant ?? "", l.qtyOrdered, l.qtyReceived, l.unitCost ?? ""]),
        ];
        const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${po.number}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        setMessage(`Exported ${plural(lines.length, "line")} as ${po.number}.csv.`);
    };

    /** Other orders at this location that have not gone to their vendor yet. */
    const alsoWaiting = ordersToSend(purchaseOrders, po.locationId).filter((o) => o.id !== po.id).length;

    // ---- header: who can do what, and why not ---------------------------------------------------
    let reason: ReactNode = null;
    let reasonTone: "quiet" | "warning" = "quiet";
    if (status === "draft") {
        if (!canManage) reason = "Managers and admins edit and submit drafts.";
        else if (dirty) reason = "Save or discard your changes before submitting.";
        else if (ordered.length === 0) reason = "Add at least one item before submitting.";
        else if (sentBack) {
            reasonTone = "warning";
            reason = (
                <>
                    Sent back by {userById(sentBack.by)?.name ?? "an admin"}: &ldquo;{sentBack.note}&rdquo;
                </>
            );
        }
    } else if (status === "awaiting-approval" && !canApprove) {
        reason = isCreator
            ? "Waiting for an admin to approve. The person who created an order cannot approve it."
            : "Waiting for an admin to approve. Only admins approve orders.";
    } else if (status === "approved" && !canManage) reason = "Approved. Managers and admins send orders.";
    else if ((status === "sent" || status === "partially-received") && !canReceive) reason = "Sent. People who receive deliveries log what arrives.";
    else if (status === "cancelled") reason = "Cancelled. Nothing was sent to the vendor.";

    const submit = () => {
        setStatus("awaiting-approval");
        setSentBack(null);
        setMessage("Submitted for approval. Admins see it in their approvals.");
        log({ text: `${user.name} submitted it for approval.` });
    };
    const approve = () => {
        setStatus("approved");
        setApprovedBy(user.id);
        setMessage("Approved. The order is ready to send.");
        log({ text: `${user.name} approved it.`, tone: "good" });
    };

    const big = "max-lg:min-h-11";
    let primary: ReactNode = null;
    let secondary: ReactNode = null;
    if (status === "draft" && canManage) {
        primary = (
            <Button
                color="primary"
                size="md"
                className={cx(big, "max-lg:flex-1")}
                isDisabled={dirty || ordered.length === 0}
                onClick={submit}
                data-testid="submit-order"
            >
                Submit for approval
            </Button>
        );
    } else if (status === "awaiting-approval" && canApprove) {
        primary = (
            <Button color="primary" size="md" className={cx(big, "max-lg:flex-1")} iconLeading={Check} onClick={approve} data-testid="approve-order">
                Approve
            </Button>
        );
        secondary = (
            <Button color="secondary" size="md" className={big} onClick={() => setSendBackOpen(true)}>
                Send back
            </Button>
        );
    } else if (status === "approved" && canManage) {
        primary = (
            <Button
                color="primary"
                size="md"
                className={cx(big, "max-lg:flex-1")}
                iconLeading={Send01}
                data-testid="send-order"
                onClick={() => document.getElementById("send-order")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
                Send order
            </Button>
        );
    } else if ((status === "sent" || status === "partially-received") && canReceive) {
        primary = (
            <Button
                href={ROUTES.receiveOrder(po.id)}
                color="primary"
                size="md"
                className={cx(big, "max-lg:flex-1")}
                iconLeading={Truck01}
                data-testid="receive-order"
            >
                Receive
            </Button>
        );
    }

    const canCancel = canManage && !sent && status !== "cancelled";
    const onMore = (key: string) => {
        if (key === "duplicate") setMessage(`Duplicated as a new draft with the same ${plural(lines.length, "line")}. The prototype does not keep the copy.`);
        else if (key === "print") window.print();
        else if (key === "export") exportCsv();
        else if (key === "cancel") setCancelOpen(true);
    };

    // Step through the orders for this location, in the order the list shows them.
    const siblings = purchaseOrders.filter((o) => o.locationId === po.locationId);
    const at = siblings.findIndex((o) => o.id === po.id);
    const previous = at > 0 ? siblings[at - 1] : undefined;
    const next = at >= 0 ? siblings[at + 1] : undefined;

    // ---- timeline: what the records show, then what happened on this page ------------------------
    const recorded: TimelineEvent[] = [
        po.imported
            ? { id: "created", at: po.createdAt, text: `Order form dated ${day(po.createdAt)}, imported from the 2026 backlog.` }
            : { id: "created", at: po.createdAt, text: `${creator?.name ?? "Someone"} created this order.` },
    ];
    if (!po.imported && po.status !== "draft")
        recorded.push({ id: "submitted", at: po.createdAt, text: `${creator?.name ?? "Someone"} submitted it for approval.` });
    // The backlog sheet does not record approvals, so an imported order's timeline leaves that step out.
    if (po.approvedBy && !po.imported) recorded.push({ id: "approved", text: `${userById(po.approvedBy)?.name ?? "An admin"} approved it.`, tone: "good" });
    else if (assumedApproval) recorded.push({ id: "approved", at: TODAY, text: `${approver?.name ?? "An admin"} approved it.`, tone: "good" });
    if (po.sentAt) recorded.push({ id: "sent", at: po.sentAt, text: `Sent to ${vendor.name}.` });
    const receipts = new Map<string, { lines: number; units: number }>();
    for (const l of po.lines) {
        if (l.qtyReceived <= 0) continue;
        const key = l.receivedAt?.slice(0, 10) ?? "";
        const entry = receipts.get(key) ?? { lines: 0, units: 0 };
        receipts.set(key, { lines: entry.lines + 1, units: entry.units + l.qtyReceived });
    }
    for (const [date, r] of [...receipts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        recorded.push({
            id: `received-${date || "undated"}`,
            at: date || undefined,
            text: `Delivery logged: ${plural(r.lines, "line")}, ${plural(r.units, "unit")} received.`,
        });
    }
    if (po.closedAt) recorded.push({ id: "closed", at: po.closedAt, text: "Every line received. Order closed.", tone: "good" });
    const events = [...recorded, ...happened];

    const expected = sent && status !== "received" && sentOn ? addDays(sentOn.slice(0, 10), vendor.leadTimeDays) : undefined;
    const estimate = vendor.leadTimeIsEstimate && (
        <Badge type="color" color="gray" size="sm">
            Estimate
        </Badge>
    );

    const th = "px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-tertiary first:pl-5 last:pr-5";
    const td = "px-3 py-2.5 align-middle first:pl-5 last:pr-5";
    const removeButton = (l: PurchaseOrderLine, size: string) => (
        <button
            type="button"
            aria-label={`Remove ${l.name}`}
            data-remove
            onClick={() => removeLine(l.id)}
            className={cx(
                "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2",
                size,
            )}
        >
            <XClose className="size-4" aria-hidden="true" />
        </button>
    );
    const lineTotal = (l: PurchaseOrderLine) => (l.unitCost !== undefined && l.qtyOrdered > 0 ? formatCurrency(l.qtyOrdered * l.unitCost, true) : "–");

    return (
        <AppShell activeUrl={ROUTES.orders} location={location} onLocationChange={setLocation} user={user}>
            <PageContent className={cx("lg:gap-6", dirty && "max-lg:pb-24")}>
                <SaveBar isDirty={dirty} changeCount={changeCount} onSave={save} onDiscard={() => setLines(savedLines)} />

                <div className="flex flex-col gap-3">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 flex-col gap-1">
                            <a
                                href={ROUTES.orders}
                                className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md text-sm font-medium text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:min-h-0"
                            >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Orders
                            </a>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <h1 className="text-xl font-semibold text-primary lg:text-display-xs">{po.number}</h1>
                                <OrderStatusBadge status={status} size="md" />
                            </div>
                            <p className="text-sm text-tertiary">
                                {vendor.name} <ArrowRight className="inline size-3.5 align-[-2px] text-fg-quaternary" aria-label="to" /> {place} ·{" "}
                                {formatMonth(po.cycle)} {KIND_LABEL[po.kind]} ·{" "}
                                {po.imported
                                    ? `order form dated ${day(po.createdAt)}`
                                    : `created ${day(po.createdAt)} by ${creator?.name ?? "someone not recorded"}`}
                                {po.imported && " · Imported from the 2026 backlog"}
                            </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2" data-testid="order-actions">
                            {primary}
                            {secondary}
                            <Dropdown.Root defaultOpen={moreOpen}>
                                <Button color="secondary" size="md" className={big} iconTrailing={ChevronDown} data-testid="more-actions">
                                    <span className="lg:hidden">More</span>
                                    <span className="max-lg:hidden">More actions</span>
                                </Button>
                                <Dropdown.Popover className="w-56">
                                    <Dropdown.Menu aria-label="More actions" onAction={(key) => onMore(String(key))}>
                                        {canManage && <Dropdown.Item id="duplicate" icon={Copy01} label="Duplicate" />}
                                        <Dropdown.Item id="print" icon={Printer} label="Print" />
                                        <Dropdown.Item id="export" icon={Download01} label="Export" addon="CSV" />
                                        <Dropdown.Item id="activity" icon={ClockRewind} label="View activity" href={ROUTES.activity} />
                                        {canCancel && <Dropdown.Separator />}
                                        {canCancel && <Dropdown.Item id="cancel" icon={SlashCircle01} label="Cancel order" />}
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown.Root>
                            <div role="group" aria-label="Step through orders" className="flex items-center max-lg:hidden">
                                <StepLink to={previous} direction="previous" />
                                <StepLink to={next} direction="next" />
                            </div>
                        </div>
                    </header>

                    {reason && (
                        <p
                            data-testid="order-reason"
                            className={cx("flex items-start gap-1.5 text-sm", reasonTone === "warning" ? "text-warning-primary" : "text-tertiary")}
                        >
                            <InfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <span>{reason}</span>
                        </p>
                    )}
                    {message && (
                        <p role="status" data-testid="order-message" className="flex items-start gap-1.5 text-sm font-medium text-success-primary">
                            <CheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <span>{message}</span>
                        </p>
                    )}
                    <SampleDataNote>
                        {po.imported
                            ? "Lines, quantities and received dates come from Meraki's 2026 backlog spreadsheet. Unit costs, totals and staff names are sample values, and the spreadsheet does not record when an order was approved or sent."
                            : "This order was generated from the reorder suggestions to show the approval flow. Unit costs, totals and staff names are sample values."}
                    </SampleDataNote>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
                    <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
                        {/* Lines */}
                        <Card padded={false} className="overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:px-5">
                                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 ring-1 ring-secondary ring-inset">
                                        <Building07 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                        {vendor.name}
                                    </span>
                                    <ArrowRight className="size-4 text-fg-quaternary" aria-label="to" />
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 ring-1 ring-secondary ring-inset">
                                        <MarkerPin01 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                        {place}
                                    </span>
                                </p>
                                <span className="lg:hidden">
                                    <SampleBadge label="Sample costs" />
                                </span>
                            </div>

                            {lines.length === 0 ? (
                                <p className="border-t border-secondary px-4 py-8 text-center text-sm text-tertiary lg:px-5">
                                    {editable ? "No lines on this order. Search below to add items." : "This order has no lines."}
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
                                                    <th scope="col" className={cx(th, "text-right")}>
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
                                                    {editable && (
                                                        <th scope="col" className={cx(th, "w-12")}>
                                                            <span className="sr-only">Remove</span>
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {shownLines.map((l) => (
                                                    <tr key={l.id} data-line={l.id}>
                                                        <td className={cx(td, "min-w-64")}>
                                                            <LineItem line={l} showNote={!editable} />
                                                        </td>
                                                        <td className={cx(td, "text-right font-medium text-primary tabular-nums")}>
                                                            {editable ? (
                                                                <QtyInput
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
                                                                <Received line={l} />
                                                            </td>
                                                        )}
                                                        <td className={cx(td, "text-right text-tertiary tabular-nums")}>
                                                            {l.unitCost !== undefined ? formatCurrency(l.unitCost, true) : "–"}
                                                        </td>
                                                        <td className={cx(td, "text-right font-medium text-primary tabular-nums")}>{lineTotal(l)}</td>
                                                        {editable && <td className={cx(td, "w-12 text-right")}>{removeButton(l, "size-9")}</td>}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <ul className="divide-y divide-secondary border-t border-secondary lg:hidden">
                                        {shownLines.map((l) => (
                                            <li key={l.id} data-line={l.id} className="flex flex-col gap-2 px-4 py-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <LineItem line={l} showNote={!editable} />
                                                    <span className="shrink-0 pt-0.5 text-sm font-semibold text-primary tabular-nums">{lineTotal(l)}</span>
                                                </div>
                                                {editable ? (
                                                    <div className="flex items-center gap-3 pl-13">
                                                        <QuantityStepper
                                                            value={l.qtyOrdered}
                                                            onChange={(v) => setQty(l.id, v)}
                                                            label={`Quantity of ${l.name}`}
                                                            min={1}
                                                            max={999}
                                                            className="w-36 shrink-0"
                                                        />
                                                        <span className="min-w-0 flex-1 text-xs text-tertiary tabular-nums">
                                                            {l.unitCost !== undefined ? `${formatCurrency(l.unitCost, true)} each` : "No cost"}
                                                        </span>
                                                        {removeButton(l, "-mr-2 size-11")}
                                                    </div>
                                                ) : (
                                                    <p className="pl-13 text-sm text-tertiary">
                                                        {l.qtyOrdered > 0 ? (
                                                            <>
                                                                Ordered <span className="font-medium text-secondary tabular-nums">{l.qtyOrdered}</span>
                                                                {l.unitCost !== undefined && <> at {formatCurrency(l.unitCost, true)}</>}
                                                            </>
                                                        ) : (
                                                            "No quantity given"
                                                        )}
                                                        {sent && l.qtyOrdered > 0 && (
                                                            <span className="mt-0.5 block">
                                                                <Received line={l} lead="Received " />
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
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

                            {editable && (
                                <button
                                    type="button"
                                    data-testid="add-items"
                                    onClick={() => setPickerOpen(true)}
                                    className="flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-t border-secondary px-4 text-left text-sm text-tertiary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-5"
                                >
                                    <SearchLg className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                    Search items to add
                                </button>
                            )}
                        </Card>

                        {/* Sending: the working panel, once the order is approved */}
                        {status === "approved" && canManage && (
                            <Card className="flex flex-col gap-4">
                                <div id="send-order" className="flex scroll-mt-24 flex-col gap-0.5">
                                    <h2 className="text-md font-semibold text-primary">How this order is sent</h2>
                                    <p className="text-sm text-tertiary">The app prepares the order. A person sends it.</p>
                                </div>
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
                                            `${SENT_VIA_LABEL[via]}.`,
                                        )
                                    }
                                />
                                {alsoWaiting > 0 && (
                                    <Button
                                        href={ROUTES.sendOrders}
                                        color="link-color"
                                        size="sm"
                                        iconTrailing={ArrowRight}
                                        className="self-start max-lg:min-h-11"
                                    >
                                        Send orders: {alsoWaiting} more waiting
                                    </Button>
                                )}
                            </Card>
                        )}

                        {/* Linked flags */}
                        {linkedFlags.length > 0 && (
                            <section className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-md font-semibold text-primary">{plural(linkedFlags.length, "flag")} on this order</h2>
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

                        {/* Timeline: status history and notes, as one */}
                        <Card className="flex flex-col gap-4">
                            <h2 className="text-md font-semibold text-primary">Timeline</h2>
                            <OrderTimeline
                                events={events}
                                subject={{ type: "order", id: po.id }}
                                subjectTitle={po.number}
                                href={ROUTES.order(po.id)}
                                user={user}
                                location={po.locationId}
                            />
                        </Card>
                    </div>

                    {/* Right rail: plain sections, no boxes */}
                    <aside className="flex min-w-0 flex-col divide-y divide-secondary text-sm">
                        <RailSection title="Summary" marker={<SampleBadge label="Sample costs" />}>
                            <dl className="flex flex-col gap-2">
                                <Row label="Lines">
                                    <span className="tabular-nums">{ordered.length}</span>
                                </Row>
                                <Row label="Units">
                                    <span className="tabular-nums">{unitsOrdered}</span>
                                </Row>
                                {sent && (
                                    <Row label="Received">
                                        <span className="tabular-nums">
                                            {unitsReceived} of {unitsOrdered} units
                                        </span>
                                    </Row>
                                )}
                                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-secondary pt-3">
                                    <dt className="font-semibold text-secondary">Estimated total</dt>
                                    <dd data-testid="order-total" className="text-lg font-semibold text-primary tabular-nums">
                                        {total > 0 ? formatCurrency(total, true) : "No costs yet"}
                                    </dd>
                                </div>
                            </dl>
                            {unpriced > 0 && (
                                <p className="text-xs text-tertiary">
                                    {plural(unpriced, "line")} {unpriced === 1 ? "has" : "have"} no cost because {unpriced === 1 ? "it is" : "they are"} not
                                    matched to a catalogue item, so the total is incomplete.
                                </p>
                            )}
                        </RailSection>

                        <RailSection title="Vendor">
                            <dl className="flex flex-col gap-2">
                                <Row label="Order method">{ORDER_CHANNEL_LABEL[vendor.channel]}</Row>
                                <Row label="Lead time">
                                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                        About {plural(vendor.leadTimeDays, "day")} {estimate}
                                    </span>
                                </Row>
                                {vendor.contact && <Row label="Contact">{vendor.contact}</Row>}
                            </dl>
                            {vendor.note && <p className="text-sm text-tertiary">{vendor.note}</p>}
                        </RailSection>

                        <RailSection title="Details">
                            <dl className="flex flex-col gap-2">
                                <Row label="Cycle">
                                    {formatMonth(po.cycle)}, {KIND_LABEL[po.kind]}
                                </Row>
                                <Row label={po.imported ? "Order form dated" : "Created"}>
                                    {day(po.createdAt)}
                                    {!po.imported && creator ? ` by ${creator.name}` : ""}
                                </Row>
                                <Row label="Approved by">
                                    {status === "approved" || sent ? (
                                        (approver?.name ?? <span className="font-normal text-tertiary">Not recorded</span>)
                                    ) : (
                                        <span className="font-normal text-tertiary">Not yet</span>
                                    )}
                                </Row>
                                <Row label="Sent">
                                    {sent ? (
                                        sentOn ? (
                                            day(sentOn)
                                        ) : (
                                            <span className="font-normal text-tertiary">Date not recorded</span>
                                        )
                                    ) : (
                                        <span className="font-normal text-tertiary">Not yet</span>
                                    )}
                                </Row>
                                {status === "received" ? (
                                    <Row label="Received">{po.closedAt ? day(po.closedAt) : "Every line"}</Row>
                                ) : status !== "cancelled" && (expected || !sent) ? (
                                    <Row label="Expected">
                                        {expected ? (
                                            <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                                About {day(expected)} {estimate}
                                            </span>
                                        ) : (
                                            <span className="font-normal text-tertiary">About {plural(vendor.leadTimeDays, "day")} after it is sent</span>
                                        )}
                                    </Row>
                                ) : null}
                            </dl>
                        </RailSection>
                    </aside>
                </div>
            </PageContent>

            <ProductPicker
                location={po.locationId}
                isOpen={pickerOpen}
                onOpenChange={setPickerOpen}
                onAdd={addPicks}
                excludeIds={onOrder}
                vendorId={po.vendorId}
                lockVendor
                title={`Add items to ${po.number}`}
                confirmLabel="Add to order"
            />

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
                                            setMessage(null);
                                            log({ text: `${user.name} sent it back to draft.`, detail: `“${note.trim()}”`, tone: "warning" });
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

            {cancelOpen && (
                <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && setCancelOpen(false)}>
                    <Modal className="sm:max-w-md">
                        <Dialog aria-label="Cancel order">
                            <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-semibold text-primary">Cancel {po.number}?</h2>
                                    <p className="text-sm text-tertiary">
                                        Nothing has been sent to {vendor.name}. The order stays in the list as cancelled, with its lines and its timeline.
                                    </p>
                                </div>
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <Button color="secondary" size="md" onClick={() => setCancelOpen(false)}>
                                        Keep order
                                    </Button>
                                    <Button
                                        color="primary-destructive"
                                        size="md"
                                        onClick={() => {
                                            setLines(savedLines);
                                            setStatus("cancelled");
                                            setMessage(null);
                                            log({ text: `${user.name} cancelled this order.`, tone: "warning" });
                                            setCancelOpen(false);
                                        }}
                                    >
                                        Cancel order
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
