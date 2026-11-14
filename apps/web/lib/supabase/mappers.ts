/**
 * Row <-> domain mapping.
 *
 * The database is snake_case with snake_case enum values ("front_desk", "transfer_in").
 * The domain model in packages/ui/data/types.ts is camelCase with kebab-case unions
 * ("front-desk", "transfer-in"). Everything that crosses that line goes through here, so
 * screens and the engine only ever see the domain shapes.
 *
 * PostgREST returns `numeric` columns as JSON numbers and `timestamptz` as ISO strings with
 * an offset. Timestamps are normalised to UTC `...Z` form because the engine slices them.
 */
import type {
    CountLine,
    CountSession,
    Flag,
    FlagEvidence,
    Item,
    Location,
    LocationId,
    NotificationRule,
    PurchaseOrder,
    PurchaseOrderLine,
    Role,
    StockLevel,
    StockMovement,
    User,
    Vendor,
} from "@/data/types";

/** "front_desk" -> "front-desk" */
export const kebab = <T extends string>(value: string): T => value.replace(/_/g, "-") as T;
/** "front-desk" -> "front_desk" */
export const snake = (value: string): string => value.replace(/-/g, "_");

const opt = <T>(value: T | null | undefined): T | undefined => (value === null || value === undefined ? undefined : value);
const iso = (value: string | null | undefined): string | undefined => (value ? new Date(value).toISOString() : undefined);

/** A timestamp as wall-clock time in a timezone: "2026-11-14T21:42:07" (no offset). */
export const localIso = (value: string, timeZone: string): string => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
};

/** Today's date (yyyy-mm-dd) in a timezone. */
export const todayIn = (timeZone: string, now = new Date()): string => localIso(now.toISOString(), timeZone).slice(0, 10);

// ------------------------------------------------------------------------------------ rows

export interface LocationRow {
    id: string;
    name: string;
    short_name: string;
    timezone: string;
}
export interface VendorRow {
    id: string;
    name: string;
    channel: string;
    lead_time_days: number;
    lead_time_is_estimate: boolean;
    contact: string | null;
    note: string | null;
}
/** From the `items_with_cost` view. */
export interface ItemRow {
    id: string;
    kind: string;
    name: string;
    brand: string | null;
    category: string;
    vendor_id: string;
    unit: string;
    polish_line: string | null;
    color_code: string | null;
    color_family: string | null;
    swatch: string | null;
    sku: string | null;
    abc_class: "A" | "B" | "C";
    discontinued: boolean;
    image_url: string | null;
    description: string | null;
    note: string | null;
    unit_cost: number | null;
    cost_is_sample: boolean | null;
}
export interface StockLevelRow {
    item_id: string;
    location_id: string;
    area: string;
    shelf: string;
    on_hand: number;
    fill_level: string | null;
    par: number | null;
    par_rule: string;
    par_note: string | null;
    reorder_requested: boolean;
    reorder_qty: number | null;
    last_counted_at: string | null;
    last_counted_by: string | null;
    is_sample: boolean;
}
export interface PurchaseOrderRow {
    id: string;
    number: string;
    location_id: string;
    vendor_id: string;
    kind: "supply" | "polish";
    status: string;
    cycle: string;
    created_at: string;
    created_by: string | null;
    approved_by: string | null;
    sent_at: string | null;
    closed_at: string | null;
    imported: boolean;
}
/** From the `purchase_order_lines_with_cost` view. */
export interface PurchaseOrderLineRow {
    id: string;
    purchase_order_id: string;
    line_no: number;
    item_id: string | null;
    name: string;
    sku: string | null;
    color_code: string | null;
    variant: string | null;
    qty_ordered: number;
    qty_received: number;
    received_at: string | null;
    received_by: string | null;
    variant_received: string | null;
    note: string | null;
    discontinued: boolean;
    unit_cost: number | null;
}
export interface CountSessionRow {
    id: string;
    location_id: string;
    area: string;
    name: string;
    status: string;
    assigned_to: string;
    due_at: string;
    started_at: string | null;
    submitted_at: string | null;
    approved_by: string | null;
    blind: boolean;
    is_sample: boolean;
}
export interface CountLineRow {
    count_session_id: string;
    item_id: string;
    expected: number | null;
    counted: number | null;
    note: string | null;
}
export interface StockMovementRow {
    id: string;
    item_id: string;
    location_id: string;
    type: string;
    delta: number;
    balance_after: number | null;
    reason: string;
    user_id: string;
    occurred_at: string;
    note: string | null;
    purchase_order_id: string | null;
    count_session_id: string | null;
    is_sample: boolean;
}
export interface FlagRow {
    id: string;
    type: string;
    severity: Flag["severity"];
    status: Flag["status"];
    title: string;
    summary: string;
    location_id: string;
    item_id: string | null;
    item_name: string | null;
    purchase_order_id: string | null;
    user_id: string | null;
    detected_at: string;
    evidence: FlagEvidence[] | null;
    suggested_action: string;
    assigned_to: string | null;
    resolution_note: string | null;
    from_real_data: boolean;
}
export interface ProfileRow {
    id: string;
    email: string;
    name: string;
    role: string;
    has_pin: boolean;
    last_active_at: string | null;
    profile_locations: { location_id: string }[] | null;
}
export interface NotificationRuleRow {
    id: string;
    label: string;
    description: string;
    channel: string;
    roles: string[];
    enabled: boolean;
}

// ------------------------------------------------------------------------------------ row -> domain

export const toLocation = (r: LocationRow): Location => ({ id: r.id as LocationId, name: r.name, shortName: r.short_name });

export const toVendor = (r: VendorRow): Vendor => ({
    id: r.id as Vendor["id"],
    name: r.name,
    channel: kebab(r.channel),
    leadTimeDays: r.lead_time_days,
    leadTimeIsEstimate: r.lead_time_is_estimate,
    contact: opt(r.contact),
    note: opt(r.note),
});

export const toItem = (r: ItemRow): Item => ({
    id: r.id,
    kind: r.kind as Item["kind"],
    name: r.name,
    brand: opt(r.brand),
    category: r.category,
    vendorId: r.vendor_id as Item["vendorId"],
    unit: r.unit,
    line: r.polish_line ? kebab(r.polish_line) : undefined,
    colorCode: opt(r.color_code),
    colorFamily: opt(r.color_family),
    sku: opt(r.sku),
    imageUrl: opt(r.image_url),
    description: opt(r.description),
    swatch: opt(r.swatch),
    abc: r.abc_class,
    unitCost: opt(r.unit_cost),
    costIsSample: opt(r.cost_is_sample),
    discontinued: r.discontinued,
    note: opt(r.note),
});

export const toStockLevel = (r: StockLevelRow): StockLevel => ({
    itemId: r.item_id,
    locationId: r.location_id as LocationId,
    area: r.area,
    shelf: r.shelf,
    onHand: r.on_hand,
    fillLevel: r.fill_level ? kebab(r.fill_level) : undefined,
    par: opt(r.par),
    parRule: r.par_rule as StockLevel["parRule"],
    parNote: opt(r.par_note),
    reorderRequested: r.reorder_requested,
    reorderQty: opt(r.reorder_qty),
    lastCountedAt: iso(r.last_counted_at),
    lastCountedBy: opt(r.last_counted_by),
    isSample: r.is_sample,
});

export const toPurchaseOrderLine = (r: PurchaseOrderLineRow): PurchaseOrderLine => ({
    id: r.id,
    itemId: opt(r.item_id),
    name: r.name,
    sku: opt(r.sku),
    colorCode: opt(r.color_code),
    variant: opt(r.variant),
    qtyOrdered: r.qty_ordered,
    qtyReceived: r.qty_received,
    receivedAt: iso(r.received_at),
    receivedBy: opt(r.received_by),
    variantReceived: opt(r.variant_received),
    unitCost: opt(r.unit_cost),
    note: opt(r.note),
    discontinued: r.discontinued,
});

export const toPurchaseOrder = (r: PurchaseOrderRow, lines: PurchaseOrderLineRow[]): PurchaseOrder => ({
    id: r.id,
    number: r.number,
    locationId: r.location_id as LocationId,
    vendorId: r.vendor_id as PurchaseOrder["vendorId"],
    kind: r.kind,
    status: kebab(r.status),
    cycle: r.cycle,
    createdAt: new Date(r.created_at).toISOString(),
    // Imported orders predate the app and have no creator on file.
    createdBy: r.created_by ?? "",
    approvedBy: opt(r.approved_by),
    sentAt: iso(r.sent_at),
    closedAt: iso(r.closed_at),
    lines: [...lines].sort((a, b) => a.line_no - b.line_no).map(toPurchaseOrderLine),
    imported: r.imported,
});

export const toCountSession = (r: CountSessionRow, lines: CountLineRow[], onHand: (itemId: string) => number): CountSession => ({
    id: r.id,
    locationId: r.location_id as LocationId,
    area: r.area,
    name: r.name,
    status: kebab(r.status),
    assignedTo: r.assigned_to,
    dueAt: r.due_at,
    startedAt: iso(r.started_at),
    submittedAt: iso(r.submitted_at),
    approvedBy: opt(r.approved_by),
    blind: r.blind,
    lines: lines.map(
        (l): CountLine => ({
            itemId: l.item_id,
            // `expected` is snapshotted when the line is counted; until then it is the live on-hand.
            expected: l.expected ?? onHand(l.item_id),
            counted: opt(l.counted),
            note: opt(l.note),
        }),
    ),
    isSample: r.is_sample,
});

/** `timeZone` is the location's; see AppState.movements for why `at` is local time. */
export const toStockMovement = (r: StockMovementRow, timeZone: string): StockMovement => ({
    id: r.id,
    itemId: r.item_id,
    locationId: r.location_id as LocationId,
    type: kebab(r.type),
    delta: r.delta,
    balance: r.balance_after ?? 0,
    reason: kebab(r.reason),
    userId: r.user_id,
    at: localIso(r.occurred_at, timeZone),
    note: opt(r.note),
    purchaseOrderId: opt(r.purchase_order_id),
    countSessionId: opt(r.count_session_id),
    isSample: r.is_sample,
});

export const toFlag = (r: FlagRow): Flag => ({
    id: r.id,
    type: kebab(r.type),
    severity: r.severity,
    status: r.status,
    title: r.title,
    summary: r.summary,
    locationId: r.location_id as LocationId,
    itemId: opt(r.item_id),
    itemName: opt(r.item_name),
    purchaseOrderId: opt(r.purchase_order_id),
    userId: opt(r.user_id),
    detectedAt: new Date(r.detected_at).toISOString(),
    evidence: r.evidence ?? [],
    suggestedAction: r.suggested_action,
    assignedTo: opt(r.assigned_to),
    resolutionNote: opt(r.resolution_note),
    fromRealData: r.from_real_data,
});

export const toUser = (r: ProfileRow): User => ({
    id: r.id,
    name: r.name,
    role: kebab<Role>(r.role),
    locations: (r.profile_locations ?? []).map((l) => l.location_id as LocationId),
    email: r.email,
    hasPin: r.has_pin,
    lastActiveAt: iso(r.last_active_at),
});

export const toNotificationRule = (r: NotificationRuleRow): NotificationRule => ({
    id: r.id,
    label: r.label,
    description: r.description,
    channel: kebab(r.channel),
    roles: r.roles.map((role) => kebab<Role>(role)),
    enabled: r.enabled,
});

// ------------------------------------------------------------------------------------ domain -> row

/**
 * A newly detected flag as an insertable row. References are passed through `known` so a
 * flag about something that has since been removed still inserts (with a null reference)
 * instead of failing the whole batch on a foreign key.
 */
export const toFlagInsert = (flag: Flag, known: { items: Set<string>; orders: Set<string>; users: Set<string> }) => ({
    id: flag.id,
    type: snake(flag.type),
    severity: flag.severity,
    status: flag.status,
    title: flag.title,
    summary: flag.summary,
    location_id: flag.locationId,
    item_id: flag.itemId && known.items.has(flag.itemId) ? flag.itemId : null,
    item_name: flag.itemName ?? null,
    purchase_order_id: flag.purchaseOrderId && known.orders.has(flag.purchaseOrderId) ? flag.purchaseOrderId : null,
    user_id: flag.userId && known.users.has(flag.userId) ? flag.userId : null,
    detected_at: new Date(flag.detectedAt.length === 10 ? `${flag.detectedAt}T12:00:00Z` : flag.detectedAt).toISOString(),
    evidence: flag.evidence,
    suggested_action: flag.suggestedAction,
    from_real_data: flag.fromRealData,
});
