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
    contact?: string;
    note?: string;
}

export type Role = "owner" | "manager" | "front-desk" | "technician";

export interface User {
    id: string;
    name: string;
    role: Role;
    locations: LocationId[];
    email: string;
    /** PIN lock enabled for this user (the PIN itself is never stored client-side). */
    hasPin: boolean;
    lastActiveAt?: string;
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
