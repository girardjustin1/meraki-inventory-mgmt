/**
 * Meraki inventory — domain model.
 *
 * The whole app is a ledger: every change to stock is a StockMovement written by a named user.
 * On-hand quantities, usage, forecasts and flags are all derived from that ledger plus the
 * purchase orders. Nothing is edited in place, which is what makes the audit trail trustworthy.
 *
 * These shapes mirror the Supabase tables in supabase/migrations (snake_case there, camelCase here).
 */

export type LocationId = "lynnfield" | "newburyport";

export interface Location {
    id: LocationId;
    name: string;
    shortName: string;
}

export type VendorId = "nail-supply-store" | "costco-bjs" | "amazon" | "dazzle-dry" | "farmhouse-fresh" | "warehouse" | "other";

/** How an order physically reaches the vendor. Drives what "Send order" does. */
export type OrderChannel = "email-po" | "api" | "portal" | "in-store" | "internal";

export interface Vendor {
    id: VendorId;
    name: string;
    channel: OrderChannel;
    /** Typical days from order to delivery. Measured from the 2026 backlog where possible. */
    leadTimeDays: number;
    /** True when leadTimeDays is an assumption, not measured. */
    leadTimeIsEstimate: boolean;
    /** Rep or contact name, used in the greeting of an emailed order. */
    contact?: string;
    /** Where emailed purchase orders go. */
    orderEmail?: string;
    accountNumber?: string;
    /** Vendor's storefront, e.g. https://pro.example.com. Needed for cart links. */
    storeUrl?: string;
    /** The store accepts Shopify cart links (a pre-filled cart). */
    supportsCartLink?: boolean;
    note?: string;
}

export type Role = "owner" | "manager" | "front-desk" | "technician";

/** Admins can do everything everywhere. Users get what their role grants. See engine/permissions.ts. */
export type AccessLevel = "admin" | "user";

export interface User {
    id: string;
    name: string;
    role: Role;
    access: AccessLevel;
    locations: LocationId[];
    email: string;
    /** PIN lock enabled for this user (the PIN itself is never stored client-side). */
    hasPin: boolean;
    lastActiveAt?: string;
}

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

/**
 * An invitation to join. One person, one use.
 * `email` set: only that Google account can accept it. `email` unset: anyone holding the link can,
 * so those expire sooner and should be sent directly to the person.
 */
export interface Invite {
    id: string;
    /** Opaque token in the link. The server stores only its hash; the prototype keeps it for demo links. */
    token: string;
    email?: string;
    /** Name typed by the inviter, shown on the sign-up screen as a greeting. */
    name?: string;
    role: Role;
    access: AccessLevel;
    locations: LocationId[];
    invitedBy: string;
    createdAt: string;
    expiresAt: string;
    status: InviteStatus;
    acceptedAt?: string;
    /** User id created when the invite was accepted. */
    acceptedBy?: string;
    revokedAt?: string;
    note?: string;
}

export type ItemKind = "supply" | "polish" | "tips";

export type PolishLine = "opi" | "opi-dip" | "dnd" | "dazzle-dry" | "chisel" | "apres-gel-x";

/** How the reorder threshold is expressed. Many bulk items are tracked by eye, not by count. */
export type ParRule = "quantity" | "level" | "paused" | "unset";

/** For containers tracked by fill level instead of count. */
export type FillLevel = "full" | "three-quarter" | "half" | "quarter" | "empty";

export type AbcClass = "A" | "B" | "C";

export interface Item {
    id: string;
    kind: ItemKind;
    name: string;
    brand?: string;
    category: string;
    vendorId: VendorId;
    /** Counting unit: Bottle, Box, Gallon… */
    unit: string;
    /** Polish only. */
    line?: PolishLine;
    colorCode?: string;
    colorFamily?: string;
    sku?: string;
    upc?: string;
    imageUrl?: string;
    description?: string;
    /** Approximate swatch colour for polish. */
    swatch?: string;
    /** A = high value / high risk, counted weekly. C = low value, counted quarterly. */
    abc: AbcClass;
    /** Unit cost in dollars. */
    unitCost?: number;
    /** True while unitCost is a placeholder and not from an invoice. */
    costIsSample?: boolean;
    discontinued?: boolean;
    note?: string;
}

export interface StockLevel {
    itemId: string;
    locationId: LocationId;
    area: string;
    shelf: string;
    onHand: number;
    /** Set when the item is tracked by fill level. */
    fillLevel?: FillLevel;
    par?: number;
    parRule: ParRule;
    parNote?: string;
    /** Staff ticked "Order?" on the sheet. */
    reorderRequested: boolean;
    reorderQty?: number;
    lastCountedAt?: string;
    lastCountedBy?: string;
    /** True when onHand came from the generator and not from a real count. */
    isSample: boolean;
}

export type StockStatus = "out" | "low" | "ok" | "over" | "unknown" | "paused";

export type MovementType = "count" | "receive" | "use" | "adjust" | "transfer-in" | "transfer-out";

export type ReasonCode =
    | "cycle-count"
    | "received-order"
    | "used-in-service"
    | "damaged"
    | "expired"
    | "lost"
    | "suspected-theft"
    | "sample-or-gift"
    | "returned-to-vendor"
    | "transfer"
    | "correction";

export interface StockMovement {
    id: string;
    itemId: string;
    locationId: LocationId;
    type: MovementType;
    /** Signed change to on-hand. */
    delta: number;
    /** On-hand after this movement. */
    balance: number;
    reason: ReasonCode;
    userId: string;
    /** ISO datetime. */
    at: string;
    note?: string;
    purchaseOrderId?: string;
    countSessionId?: string;
    isSample: boolean;
}

export type PurchaseOrderStatus = "draft" | "awaiting-approval" | "approved" | "sent" | "partially-received" | "received" | "cancelled";

export interface PurchaseOrderLine {
    id: string;
    /** Missing when the sheet row could not be matched to a catalogue item. */
    itemId?: string;
    name: string;
    sku?: string;
    colorCode?: string;
    /** Regular / Gel / Dip for polish lines. */
    variant?: string;
    qtyOrdered: number;
    qtyReceived: number;
    receivedAt?: string;
    receivedBy?: string;
    /** Variant actually delivered, when it differs from what was ordered. */
    variantReceived?: string;
    unitCost?: number;
    note?: string;
    discontinued?: boolean;
}

export interface PurchaseOrder {
    id: string;
    number: string;
    locationId: LocationId;
    vendorId: VendorId;
    kind: "supply" | "polish";
    status: PurchaseOrderStatus;
    /** yyyy-mm of the monthly cycle this belongs to. */
    cycle: string;
    createdAt: string;
    createdBy: string;
    approvedBy?: string;
    sentAt?: string;
    closedAt?: string;
    lines: PurchaseOrderLine[];
    /** Imported from the 2026 backlog workbook. */
    imported: boolean;
}

export type CountStatus = "scheduled" | "in-progress" | "submitted" | "approved";

export interface CountLine {
    itemId: string;
    expected: number;
    counted?: number;
    note?: string;
}

export interface CountSession {
    id: string;
    locationId: LocationId;
    area: string;
    name: string;
    status: CountStatus;
    assignedTo: string;
    dueAt: string;
    startedAt?: string;
    submittedAt?: string;
    approvedBy?: string;
    /** Blind count: the counter does not see the expected quantity. */
    blind: boolean;
    lines: CountLine[];
    isSample: boolean;
}

export type FlagType =
    | "received-mismatch"
    | "variant-mismatch"
    | "order-spike"
    | "overdue-receipt"
    | "count-variance"
    | "over-par"
    | "stockout-risk"
    | "repeat-out-of-stock"
    | "missed-count"
    | "unexplained-adjustment"
    | "data-quality";

export type FlagSeverity = "high" | "medium" | "low";

export type FlagStatus = "open" | "reviewing" | "resolved" | "dismissed";

export interface FlagEvidence {
    label: string;
    value: string;
}

export interface Flag {
    id: string;
    type: FlagType;
    severity: FlagSeverity;
    status: FlagStatus;
    title: string;
    /** One plain-English sentence saying what was seen and why it matters. */
    summary: string;
    locationId: LocationId;
    itemId?: string;
    itemName?: string;
    purchaseOrderId?: string;
    userId?: string;
    detectedAt: string;
    evidence: FlagEvidence[];
    /** What a manager should do next. */
    suggestedAction: string;
    assignedTo?: string;
    resolutionNote?: string;
    /** Built from imported spreadsheet data (true) or from generated sample activity (false). */
    fromRealData: boolean;
}

export type ForecastConfidence = "high" | "medium" | "low" | "none";

export interface UsagePoint {
    /** yyyy-mm */
    month: string;
    qty: number;
    /** True for projected months. */
    projected?: boolean;
    low?: number;
    high?: number;
}

export interface Forecast {
    itemId: string;
    locationId: LocationId;
    /** Units consumed per 30 days. */
    monthlyUsage: number;
    dailyUsage: number;
    /** Number of order cycles the estimate is based on. */
    observations: number;
    confidence: ForecastConfidence;
    method: "order-history" | "movement-ledger" | "none";
    onHand: number;
    daysOfCover?: number;
    projectedStockoutDate?: string;
    reorderPoint: number;
    safetyStock: number;
    suggestedOrderQty: number;
    history: UsagePoint[];
    projection: UsagePoint[];
    explanation: string;
}

export type DigestPeriod = "weekly" | "monthly";

export interface DigestStat {
    label: string;
    value: string;
    /** Signed change vs the previous period, already formatted ("+3", "-12%"). */
    change?: string;
    /** Whether that change is good news. */
    tone?: "good" | "bad" | "neutral";
    hint?: string;
}

export interface DigestInsight {
    id: string;
    tone: "good" | "bad" | "neutral" | "warning";
    title: string;
    body: string;
    href?: string;
}

export interface Digest {
    id: string;
    period: DigestPeriod;
    locationId: LocationId | "all";
    rangeStart: string;
    rangeEnd: string;
    generatedAt: string;
    headline: string;
    stats: DigestStat[];
    insights: DigestInsight[];
    reorder: { itemId: string; name: string; vendor: string; onHand: number; suggested: number; unit: string; daysOfCover?: number }[];
    flags: Flag[];
    vendorPerformance: { vendor: string; lines: number; fillRate: number; avgLeadDays?: number }[];
    recipients: string[];
}

export interface NotificationRule {
    id: string;
    label: string;
    description: string;
    channel: "email" | "in-app";
    roles: Role[];
    enabled: boolean;
}

export interface ActivityEntry {
    id: string;
    at: string;
    userId: string;
    locationId: LocationId;
    verb: string;
    subject: string;
    detail?: string;
    href?: string;
    tone?: "neutral" | "good" | "warning" | "bad";
}

// ------------------------------------------------------------------------------------ notes, notifications, tasks

/** What a note or task is attached to. */
export interface NoteSubject {
    type: "flag" | "order" | "item" | "count" | "task";
    id: string;
}

/** A comment on a record. `body` is plain text with mention tokens like `@[u-fd-lyn]` (see engine/mentions.ts). */
export interface Note {
    id: string;
    subject: NoteSubject;
    authorId: string;
    body: string;
    createdAt: string;
    editedAt?: string;
    isSample?: boolean;
}

export type NotificationType =
    "mention" | "task-assigned" | "task-updated" | "approval-requested" | "flag-assigned" | "count-due" | "delivery-expected" | "order-approved";

/** One entry in a person's inbox. Named AppNotification to stay clear of the browser's Notification. */
export interface AppNotification {
    id: string;
    userId: string;
    type: NotificationType;
    /** Who caused it, when it was a person. */
    actorId?: string;
    title: string;
    body?: string;
    href: string;
    createdAt: string;
    readAt?: string;
    /** Also sent by email (depends on the person's notification settings). */
    emailed: boolean;
}

export type TaskType = "pickup-run" | "count" | "receive" | "review" | "general";

export type TaskStatus = "assigned" | "accepted" | "in-progress" | "done" | "declined" | "cancelled";

export interface PickupLine {
    name: string;
    itemId?: string;
    qty: number;
    /** What the person actually got. Undefined until they tick it. */
    picked?: number;
    /** Substitution or reason for a shortfall. */
    note?: string;
}

/**
 * Something one person asks another to do. A pickup run sends someone to a store with a pick
 * list for one or more orders; when they are back the order is received in the normal way.
 */
export interface Task {
    id: string;
    type: TaskType;
    title: string;
    locationId: LocationId;
    assigneeId: string;
    createdBy: string;
    createdAt: string;
    /** ISO datetime. */
    dueAt: string;
    status: TaskStatus;
    note?: string;
    /** The record a non-pickup task is about (the count to review, the flag to check). */
    subject?: NoteSubject;
    /** Why the person could not do it, when declined. */
    declineReason?: string;
    /** Pickup runs: the orders being collected and where from. */
    orderIds?: string[];
    vendorId?: VendorId;
    /** Store name or address the person should go to. */
    place?: string;
    lines?: PickupLine[];
    acceptedAt?: string;
    doneAt?: string;
    /** What the run cost, when the person paid in store. */
    amountPaid?: number;
    paidWith?: string;
    isSample?: boolean;
}
