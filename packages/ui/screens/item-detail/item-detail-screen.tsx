"use client";

import type { FC, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    Archive,
    ArrowLeft,
    ArrowNarrowRight,
    BarChart07,
    Check,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardCheck,
    ClockRewind,
    Edit05,
    InfoCircle,
    MarkerPin01,
    Package,
    PauseCircle,
    PlayCircle,
    Printer,
    ShoppingCart01,
    SwitchHorizontal01,
    XClose,
} from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { AppShell, Card, PageContent, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { DetailRail, RailField, RailSection } from "@/components/meraki/detail-rail";
import { FieldChips } from "@/components/meraki/field-chips";
import type { FieldChip } from "@/components/meraki/field-chips";
import { FillLevelPicker } from "@/components/meraki/fill-level-picker";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { LedgerList, REASON_CODES, REASON_LABEL } from "@/components/meraki/ledger-list";
import { NoteThread } from "@/components/meraki/note-thread";
import { QuantityStepper } from "@/components/meraki/quantity-stepper";
import { SaveBar } from "@/components/meraki/save-bar";
import {
    AbcBadge,
    ConfidenceBadge,
    FlagSeverityBadge,
    FlagStatusBadge,
    OrderStatusBadge,
    RealDataBadge,
    SampleBadge,
    StockStatusBadge,
} from "@/components/meraki/status-badges";
import { UsageChart } from "@/components/meraki/usage-chart";
import {
    INCOMING_MAX_AGE_DAYS,
    TODAY,
    flags,
    getForecast,
    getItem,
    getPolishForecast,
    getStock,
    incomingLines,
    itemLedger,
    items,
    locationName,
    locations,
    purchaseOrders,
    serviceRecipes,
    stockRows,
    userById,
    variantDemand,
    vendorById,
    vendors,
} from "@/data/inventory";
import type { IncomingLine } from "@/data/inventory";
import { ORDER_CHANNEL_LABEL, POLISH_LINE_LABEL } from "@/data/labels";
import type {
    FillLevel,
    Forecast,
    Item,
    LocationId,
    MovementType,
    ParRule,
    ReasonCode,
    StockLevel,
    StockMovement,
    StockStatus,
    StockVariant,
    User,
    VariantId,
    Vendor,
    VendorId,
} from "@/data/types";
import { addDays, formatDate, relativeDays } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { suggestOrderQty } from "@/engine/forecast";
import { can, visibleLocations } from "@/engine/permissions";
import { FILL_FRACTION, FILL_LABEL, STATUS_LABEL, formatCount, formatCurrency, formatQty, stockStatus } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

const DEFAULT_ITEM = "sup-igel-beauty-non-cleansing-gel-top-coat";

const RULE_LABEL: Record<ParRule, string> = { quantity: "Counted by quantity", level: "Tracked by fill level", paused: "Reorder paused", unset: "No par set" };
const ABC_MEANING: Record<Item["abc"], string> = {
    A: "High spend. Counted weekly.",
    B: "Mid spend. Counted monthly.",
    C: "Low spend. Counted quarterly.",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Items sold as "Each" have no sensible plural, so they read as units. */
const unitOf = (item: Item) => (item.unit.toLowerCase() === "each" ? "Unit" : item.unit);
const vendorLine = (v: Vendor) =>
    `${ORDER_CHANNEL_LABEL[v.channel]}, about ${plural(v.leadTimeDays, "day")} to arrive${v.leadTimeIsEstimate ? " (estimate)" : ""}.`;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** What an adjustment with this reason is in the ledger. */
const movementType = (reason: ReasonCode, delta: number): MovementType => {
    if (reason === "received-order") return "receive";
    if (reason === "used-in-service") return "use";
    if (reason === "cycle-count") return "count";
    if (reason === "transfer") return delta >= 0 ? "transfer-in" : "transfer-out";
    return "adjust";
};

/**
 * Forecast numbers that depend on what is on the shelf, recalculated after a local adjustment or
 * par change so the card never contradicts the on-hand figure beside it. Uses the engine's own rule.
 */
const liveForecast = (f: Forecast, level: StockLevel, leadTimeDays: number): Forecast => {
    if (level.fillLevel) return { ...f, onHand: level.onHand, suggestedOrderQty: FILL_FRACTION[level.fillLevel] <= 0.5 ? 1 : 0 };
    const { onHand, par } = level;
    const suggestedOrderQty = suggestOrderQty({
        onHand,
        par,
        dailyUsage: f.dailyUsage,
        leadTimeDays,
        safetyStock: f.safetyStock,
        reorderPoint: f.reorderPoint,
    });
    if (f.confidence === "none") return { ...f, onHand, suggestedOrderQty };
    const daysOfCover = f.dailyUsage > 0 ? Math.floor(onHand / f.dailyUsage) : undefined;
    return { ...f, onHand, daysOfCover, projectedStockoutDate: daysOfCover !== undefined ? addDays(TODAY, daysOfCover) : undefined, suggestedOrderQty };
};

// ------------------------------------------------------------------------------------ editable settings

type Rule = Exclude<ParRule, "paused">;

/** Settings that belong to the item, wherever it is stocked. */
interface ItemFields {
    vendorId: VendorId;
    category: string;
    unit: string;
    description: string;
    sku: string;
    upc: string;
    unitCost: string;
    paused: boolean;
    discontinued: boolean;
}

/** Settings that belong to one location's shelf. */
interface PlaceFields {
    par: string;
    rule: Rule;
    shelf: string;
}

interface Settings {
    item: ItemFields;
    place: Partial<Record<LocationId, PlaceFields>>;
}

/** Pending edits a story can start with. Shelf fields apply to the location being viewed. */
export type ItemDetailEdits = Partial<ItemFields & PlaceFields>;

const ITEM_KEYS = ["vendorId", "category", "unit", "description", "sku", "upc", "unitCost", "paused", "discontinued"] as const;
const PLACE_KEYS = ["par", "rule", "shelf"] as const;

const baseSettings = (item: Item): Settings => {
    const place: Settings["place"] = {};
    let paused = false;
    for (const l of locations) {
        const level = getStock(item.id, l.id);
        if (!level) continue;
        if (level.parRule === "paused") paused = true;
        place[l.id] = {
            par: level.par !== undefined ? String(level.par) : "",
            rule: level.parRule === "paused" ? (level.par !== undefined ? "quantity" : "unset") : level.parRule,
            shelf: level.shelf,
        };
    }
    return {
        item: {
            vendorId: item.vendorId,
            category: item.category,
            unit: item.unit,
            description: item.description ?? "",
            sku: item.sku ?? "",
            upc: item.upc ?? "",
            unitCost: item.unitCost !== undefined ? String(item.unitCost) : "",
            paused,
            discontinued: Boolean(item.discontinued),
        },
        place,
    };
};

const withEdits = (settings: Settings, location: LocationId, edits?: ItemDetailEdits): Settings => {
    if (!edits) return settings;
    const item = { ...settings.item };
    const here = settings.place[location];
    const place = here ? { ...here } : undefined;
    for (const key of ITEM_KEYS) if (edits[key] !== undefined) Object.assign(item, { [key]: edits[key] });
    if (place) for (const key of PLACE_KEYS) if (edits[key] !== undefined) Object.assign(place, { [key]: edits[key] });
    return { item, place: place ? { ...settings.place, [location]: place } : settings.place };
};

/** How many fields differ. This is the number on the save bar. */
const countChanges = (a: Settings, b: Settings) => {
    let n = 0;
    for (const key of ITEM_KEYS) if (a.item[key] !== b.item[key]) n++;
    for (const l of locations) {
        const x = a.place[l.id];
        const y = b.place[l.id];
        if (x && y) for (const key of PLACE_KEYS) if (x[key] !== y[key]) n++;
    }
    return n;
};

// ------------------------------------------------------------------------------------ small pieces

const Quiet = ({ icon: Icon = Package, title, children, action }: { icon?: typeof Package; title: string; children?: ReactNode; action?: ReactNode }) => (
    <EmptyState size="sm" className="py-6">
        <EmptyState.Header pattern="none">
            <EmptyState.FeaturedIcon icon={Icon} color="gray" theme="modern" />
        </EmptyState.Header>
        <EmptyState.Content>
            <EmptyState.Title>{title}</EmptyState.Title>
            {children && <EmptyState.Description>{children}</EmptyState.Description>}
        </EmptyState.Content>
        {action && <EmptyState.Footer>{action}</EmptyState.Footer>}
    </EmptyState>
);

/** A card title row: the name of the section, with one quiet control on the right. */
const SectionHeader = ({ title, count, children }: { title: string; count?: number; children?: ReactNode }) => (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 text-md font-semibold text-primary">
            {title}
            {count !== undefined && count > 0 && <span className="text-sm font-medium text-tertiary tabular-nums">{count}</span>}
        </h2>
        {children}
    </div>
);

/** A column header that explains itself: dotted underline, definition on hover or focus. */
const Defined = ({ label, definition }: { label: string; definition: string }) => (
    <Tooltip title={definition} placement="top">
        <TooltipTrigger className="cursor-help rounded-xs underline decoration-fg-quaternary decoration-dotted underline-offset-4 outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2">
            {label}
        </TooltipTrigger>
    </Tooltip>
);

const Figure = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-medium text-tertiary">{label}</dt>
        <dd className="text-md font-semibold text-primary tabular-nums">{children}</dd>
    </div>
);

const orderList = (lines: IncomingLine[]) => (
    <span className="flex flex-col gap-0.5">
        {lines.map((l) => (
            <span key={l.orderId} className="block tabular-nums">
                {l.orderNumber}: {l.qty}, ordered {formatDate(l.orderedAt, l.orderedAt.slice(0, 4) !== TODAY.slice(0, 4))} ({plural(l.ageDays, "day")} ago)
            </span>
        ))}
    </span>
);

/** Stock on its way. Old open lines are shown apart and muted: they probably arrived and were never logged. */
const Incoming = ({ lines }: { lines: IncomingLine[] }) => {
    const recent = lines.filter((l) => !l.unconfirmed);
    const old = lines.filter((l) => l.unconfirmed);
    const qty = (list: IncomingLine[]) => list.reduce((n, l) => n + l.qty, 0);
    const trigger =
        "cursor-help rounded-xs underline decoration-fg-quaternary decoration-dotted underline-offset-4 outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2";
    if (!lines.length) return <span className="text-quaternary">0</span>;
    return (
        <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
            {recent.length > 0 ? (
                <Tooltip title="On open orders" description={orderList(recent)} placement="top">
                    <TooltipTrigger className={cx(trigger, "font-medium text-primary")}>{qty(recent)}</TooltipTrigger>
                </Tooltip>
            ) : (
                <span className="text-quaternary">0</span>
            )}
            {old.length > 0 && (
                <Tooltip
                    title={`Ordered more than ${INCOMING_MAX_AGE_DAYS} days ago and never marked received`}
                    description={
                        <>
                            {orderList(old)}
                            <span className="mt-1 block">Probably arrived, so it is not counted as incoming. Receive or close the order to clear it.</span>
                        </>
                    }
                    placement="top"
                >
                    <TooltipTrigger className={cx(trigger, "text-xs whitespace-nowrap text-quaternary")}>+{qty(old)} unconfirmed</TooltipTrigger>
                </Tooltip>
            )}
        </span>
    );
};

// ------------------------------------------------------------------------------------ adjust modal

interface Adjustment {
    onHand: number;
    fillLevel?: FillLevel;
    delta: number;
    reason: ReasonCode;
    note?: string;
    /** Set when one finish of a polish colour was adjusted: its new split. `onHand` is then that finish alone. */
    variant?: Pick<StockVariant, "id" | "inUse" | "backstock">;
}

interface AdjustModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    item: Item;
    level: StockLevel;
    /** Adjust one finish of a polish colour. The number changed is its backstock; the open bottle is a switch. */
    variant?: StockVariant;
    onSave: (adjustment: Adjustment) => void;
}

/**
 * Shopify's pattern: adjust by or set to, a required reason with no default, and the result shown
 * before anything is saved. Nothing is edited in place; saving writes one new ledger row.
 */
const AdjustModal = ({ isOpen, onOpenChange, item, level, variant, onSave }: AdjustModalProps) => {
    const unit = unitOf(item);
    const byFill = Boolean(level.fillLevel) && !variant;
    // For a finish the number being changed is its backstock; otherwise it is everything on hand.
    const start = variant ? variant.backstock : level.onHand;
    const was = variant ? variant.onHand : level.onHand;
    const [mode, setMode] = useState<"adjust" | "set">("adjust");
    const [direction, setDirection] = useState<"remove" | "add">("remove");
    const [amount, setAmount] = useState(1);
    const [target, setTarget] = useState(start);
    const [inUse, setInUse] = useState(Boolean(variant?.inUse));
    const [fill, setFill] = useState<FillLevel | undefined>(level.fillLevel);
    const [reason, setReason] = useState<ReasonCode | "">("");
    const [note, setNote] = useState("");

    const counted = byFill ? FILL_FRACTION[fill ?? "empty"] : mode === "set" ? target : direction === "add" ? start + amount : Math.max(0, start - amount);
    const after = variant ? counted + (inUse ? 1 : 0) : counted;
    const delta = Math.round((after - was) * 100) / 100;
    // Opening a spare moves a bottle from backstock to the wall: the total stays, the split changes.
    const unchanged = variant ? counted === variant.backstock && (inUse ? 1 : 0) === variant.inUse : delta === 0;
    const sensitive = reason === "lost" || reason === "suspected-theft";
    const noteRequired = Math.abs(delta) >= 3 || sensitive;
    const missing = unchanged
        ? "Change the quantity to save."
        : reason === ""
          ? "Choose a reason to save."
          : noteRequired && !note.trim()
            ? "Add a note to save."
            : undefined;

    const before = variant ? formatCount(variant.onHand, unit) : formatQty(level, unit);
    const afterText = byFill ? FILL_LABEL[fill ?? "empty"] : formatCount(after, unit);

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
            <Modal className="max-w-md">
                <Dialog aria-label={`Adjust ${variant ? variant.label : "stock"} for ${item.name}`}>
                    <div className="flex flex-col gap-5 p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <ItemThumb item={item} size="md" />
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold text-primary">
                                    Adjust {variant ? variant.label : "stock"} at {locationName(level.locationId)}
                                </h2>
                                <p className="truncate text-sm text-tertiary">{item.name}</p>
                            </div>
                        </div>

                        {byFill ? (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm font-medium text-secondary">Set fill level to</p>
                                <FillLevelPicker label={`Fill level for ${item.name}`} value={fill} onChange={setFill} />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {variant && <p className="text-sm font-medium text-secondary">Backstock, unopened</p>}
                                <ButtonGroup
                                    aria-label="How to change the quantity"
                                    size="md"
                                    className="w-full [&>*]:flex-1 [&>*]:justify-center"
                                    selectedKeys={new Set([mode])}
                                    disallowEmptySelection
                                    onSelectionChange={(keys) => setMode(keys.has("set") ? "set" : "adjust")}
                                >
                                    <ButtonGroupItem id="adjust">Adjust by</ButtonGroupItem>
                                    <ButtonGroupItem id="set">Set to</ButtonGroupItem>
                                </ButtonGroup>

                                {mode === "adjust" ? (
                                    <div className="flex items-center gap-3">
                                        <ButtonGroup
                                            aria-label="Add or remove"
                                            size="md"
                                            selectedKeys={new Set([direction])}
                                            disallowEmptySelection
                                            onSelectionChange={(keys) => setDirection(keys.has("add") ? "add" : "remove")}
                                        >
                                            <ButtonGroupItem id="remove">Remove</ButtonGroupItem>
                                            <ButtonGroupItem id="add">Add</ButtonGroupItem>
                                        </ButtonGroup>
                                        <QuantityStepper
                                            className="flex-1"
                                            label={`${variant ? "Backstock" : "Quantity"} to ${direction === "add" ? "add" : "remove"}`}
                                            value={amount}
                                            onChange={setAmount}
                                            min={0}
                                            max={direction === "remove" ? start : undefined}
                                        />
                                    </div>
                                ) : (
                                    <QuantityStepper
                                        className="w-full"
                                        label={variant ? "New backstock" : "New quantity on hand"}
                                        value={target}
                                        onChange={setTarget}
                                        min={0}
                                        unit={formatCount(target, unit).replace(/^[\d.]+\s/, "")}
                                    />
                                )}
                                {variant && (
                                    <Toggle
                                        size="sm"
                                        label="In use"
                                        hint="One open on the polish wall."
                                        isSelected={inUse}
                                        onChange={setInUse}
                                        className="min-h-11 items-center"
                                    />
                                )}
                            </div>
                        )}

                        <div
                            aria-live="polite"
                            className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 ring-1 ring-secondary ring-inset"
                        >
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <p className="text-xs font-medium text-tertiary">
                                    {variant ? `${variant.label} on hand after saving` : "On hand after saving"}
                                </p>
                                <p className="flex flex-wrap items-center gap-x-2 text-md font-semibold text-primary tabular-nums">
                                    <span className="text-tertiary">{before}</span>
                                    <ArrowNarrowRight className="size-4 shrink-0 text-fg-quaternary" aria-label="becomes" />
                                    <span>{afterText}</span>
                                </p>
                                {variant && (
                                    <p className="text-xs text-tertiary tabular-nums">
                                        Backstock {variant.backstock} to {counted}, in use {variant.inUse} to {inUse ? 1 : 0}
                                    </p>
                                )}
                            </div>
                            {delta !== 0 && !byFill && (
                                <Badge type="pill-color" size="md" color={delta > 0 ? "success" : "error"}>
                                    {delta > 0 ? "+" : "−"}
                                    {Math.abs(delta)}
                                </Badge>
                            )}
                        </div>

                        <NativeSelect
                            label="Reason"
                            size="md"
                            required
                            value={reason}
                            onChange={(e) => setReason(e.currentTarget.value as ReasonCode | "")}
                            options={[
                                { label: "Choose a reason", value: "", disabled: true },
                                ...REASON_CODES.map((code) => ({ label: REASON_LABEL[code], value: code })),
                            ]}
                            hint={sensitive ? "This adjustment will be sent to a manager to review." : undefined}
                        />

                        <TextArea
                            label={noteRequired ? "Note" : "Note (optional)"}
                            isRequired={noteRequired}
                            rows={3}
                            placeholder="What happened?"
                            value={note}
                            onChange={setNote}
                            hint={
                                noteRequired
                                    ? sensitive
                                        ? "Required for lost stock and suspected theft."
                                        : "Required when the change is 3 or more."
                                    : "Required when the change is 3 or more."
                            }
                        />

                        <p className="flex items-start gap-2 text-xs text-tertiary">
                            <InfoCircle className="mt-0.5 size-3.5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            Adjustments are never edited or deleted. A mistake is fixed with a second adjustment that reverses it.
                        </p>

                        <div className="flex flex-col gap-2">
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button color="secondary" size="lg" onClick={() => onOpenChange(false)}>
                                    Cancel
                                </Button>
                                <Button
                                    size="lg"
                                    isDisabled={Boolean(missing)}
                                    onClick={() => {
                                        if (reason === "") return;
                                        onSave({
                                            onHand: after,
                                            fillLevel: byFill ? fill : undefined,
                                            delta,
                                            reason,
                                            note: note.trim() || undefined,
                                            variant: variant ? { id: variant.id, inUse: inUse ? 1 : 0, backstock: counted } : undefined,
                                        });
                                        onOpenChange(false);
                                    }}
                                >
                                    Save adjustment
                                </Button>
                            </div>
                            {missing && <p className="text-right text-xs text-tertiary max-sm:text-center">{missing}</p>}
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};

// ------------------------------------------------------------------------------------ screen

type DetailTab = "history" | "orders" | "flags" | "settings";

/** The page is one scroll now. The old tab ids stay as anchors so existing links still land. */
const SECTION_ID: Record<DetailTab, string> = { history: "item-history", orders: "item-orders", flags: "item-flags", settings: "item-settings" };

const HISTORY_FILTERS: { id: string; label: string; types: MovementType[] }[] = [
    { id: "receive", label: "Received", types: ["receive"] },
    { id: "use", label: "Used", types: ["use"] },
    { id: "count", label: "Counted", types: ["count"] },
    { id: "adjust", label: "Adjusted", types: ["adjust"] },
    { id: "transfer", label: "Transfers", types: ["transfer-in", "transfer-out"] },
];

const ORDERS_SHOWN = 5;

const FINISH_LABEL: Record<VariantId, string> = { regular: "Regular", gel: "Gel", dip: "Dip" };
const FINISH_ORDER: VariantId[] = ["regular", "gel", "dip"];

/** One location's line for this item, with this session's edits applied. */
interface PlaceView {
    level: StockLevel;
    /** The forecast that decides the status badge. The same one the stock list uses. */
    ruleForecast?: Forecast;
    /** The forecast shown in the card: the supply forecast, or the per-colour one for polish. */
    forecast?: Forecast;
    status: StockStatus;
    lines: IncomingLine[];
}

const parOf = (v: PlaceView) => (v.level.fillLevel ? "Full" : (v.level.par ?? "Not set"));
const reorderAt = (v: PlaceView) =>
    v.level.fillLevel
        ? "Half"
        : v.ruleForecast && v.ruleForecast.reorderPoint > 0
          ? v.ruleForecast.reorderPoint
          : v.level.par !== undefined
            ? Math.floor(v.level.par / 2)
            : "Not set";

const numberCell = "px-3 py-2 text-right whitespace-nowrap tabular-nums text-secondary";
const headCell = "px-3 py-2 font-medium whitespace-nowrap";
const quantityButton =
    "inline-flex min-h-8 cursor-pointer items-center rounded-md bg-primary px-2 font-semibold whitespace-nowrap text-primary tabular-nums shadow-xs ring-1 ring-primary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 max-lg:min-h-11 max-lg:px-3";
const textLink =
    "cursor-pointer rounded-xs font-medium text-brand-secondary underline decoration-transparent underline-offset-4 outline-focus-ring transition duration-100 ease-linear hover:text-brand-secondary_hover hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2";

interface StepButtonProps {
    direction: "previous" | "next";
    target?: Item;
    /** Stepping away would drop unsaved changes. */
    blocked: boolean;
    size: "sm" | "lg";
    onStep: (id: string) => void;
}

/** Previous or next item in the stock list. A link, so it opens in a new tab like any other. */
const StepButton = ({ direction, target, blocked, size, onStep }: StepButtonProps) => {
    const Icon = direction === "previous" ? ChevronUp : ChevronDown;
    const word = direction === "previous" ? "Previous" : "Next";
    if (!target || blocked) {
        const why = blocked && target ? `${word} item. Save or discard your changes first.` : `No ${direction} item in the list`;
        return <Button color="secondary" size={size} iconLeading={Icon} isDisabled aria-label={why} />;
    }
    const label = `${word}: ${target.name}`;
    return (
        <Tooltip title={label} placement="bottom">
            <Button href={ROUTES.item(target.id)} color="secondary" size={size} iconLeading={Icon} aria-label={label} onPress={() => onStep(target.id)} />
        </Tooltip>
    );
};

interface MenuAction {
    id: string;
    label: string;
    icon: FC<{ className?: string }>;
    href?: string;
}

interface ItemDetailScreenProps {
    itemId?: string;
    location?: LocationId;
    /** Section to open scrolled to. The ids are the old tab names. */
    initialTab?: DetailTab;
    /** Open the adjust dialog straight away, or name a polish finish to open it on that one. Used by the stories that document it. */
    adjusting?: boolean | VariantId;
    /** Who is looking. Defaults to the person using the app. */
    user?: User;
    /** Start with edits pending, so the save bar shows. Used by the story that documents it. */
    initialEdits?: ItemDetailEdits;
    /** Open the "More actions" menu straight away. Used by the story that documents it. */
    moreOpen?: boolean;
}

/** One item: what is on the shelf at each location, how fast it goes, and every movement that got it there. */
export const ItemDetailScreen = ({
    itemId = DEFAULT_ITEM,
    location: initialLocation = "lynnfield",
    initialTab,
    adjusting = false,
    user: userProp,
    initialEdits,
    moreOpen = false,
}: ItemDetailScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const [location, setLocation] = useState<LocationId>(initialLocation);
    // Previous and next swap the item in place, so they work without a router; in the app the link also navigates.
    const [currentId, setCurrentId] = useState(itemId);
    const [linkedId, setLinkedId] = useState(itemId);
    const [stepped, setStepped] = useState(false);
    if (linkedId !== itemId) {
        setLinkedId(itemId);
        setCurrentId(itemId);
        setStepped(false);
    }
    const item = getItem(currentId);

    return (
        <AppShell activeUrl={ROUTES.stock} location={location} onLocationChange={setLocation} user={userProp}>
            {item ? (
                <ItemDetail
                    key={item.id}
                    item={item}
                    location={location}
                    onLocationChange={setLocation}
                    user={user}
                    onStep={(id) => {
                        setCurrentId(id);
                        setStepped(true);
                    }}
                    initialTab={stepped ? undefined : initialTab}
                    adjusting={!stepped && adjusting}
                    initialEdits={stepped ? undefined : initialEdits}
                    moreOpen={!stepped && moreOpen}
                />
            ) : (
                <PageContent>
                    <Card>
                        <Quiet
                            title="Item not found"
                            action={
                                <Button href={ROUTES.stock} color="secondary" size="md" iconLeading={ArrowLeft}>
                                    Back to stock
                                </Button>
                            }
                        >
                            This item is not in the catalogue. It may have been merged with a duplicate.
                        </Quiet>
                    </Card>
                </PageContent>
            )}
        </AppShell>
    );
};

interface ItemDetailProps {
    item: Item;
    location: LocationId;
    onLocationChange: (location: LocationId) => void;
    user: User;
    onStep: (id: string) => void;
    initialTab?: DetailTab;
    adjusting: boolean | VariantId;
    initialEdits?: ItemDetailEdits;
    moreOpen: boolean;
}

const ItemDetail = ({ item, location, onLocationChange, user, onStep, initialTab, adjusting, initialEdits, moreOpen }: ItemDetailProps) => {
    const isDesktop = useBreakpoint("lg");
    const itemId = item.id;
    const canAdjustAt = (loc: LocationId) => can(user, "stock.adjust", loc);
    const canEdit = canAdjustAt(location);
    const canCosts = can(user, "costs.view");
    const canOrder = can(user, "orders.create", location);
    const canCount = can(user, "stock.count", location);
    const canInsights = can(user, "reports.view");
    const seen = visibleLocations(
        user,
        locations.map((l) => l.id),
    );

    // Settings: what is saved, and what is typed but not saved yet. One save bar covers them all.
    const base = useMemo(() => baseSettings(item), [item]);
    const [saved, setSaved] = useState(base);
    const [draft, setDraft] = useState(() => withEdits(base, location, initialEdits));
    // Stock adjustments, kept per location so switching salons does not lose them.
    const [counts, setCounts] = useState<Partial<Record<LocationId, Pick<StockLevel, "onHand" | "fillLevel" | "variants" | "inUse" | "backstock">>>>({});
    const [added, setAdded] = useState<Partial<Record<LocationId, StockMovement[]>>>({});
    const [adjust, setAdjust] = useState<{ loc: LocationId; variantId?: VariantId; key: number; open: boolean }>({
        loc: location,
        variantId: typeof adjusting === "string" ? adjusting : undefined,
        key: 0,
        open: Boolean(adjusting) && canEdit,
    });
    const [notice, setNotice] = useState<string>();
    const [onOrder, setOnOrder] = useState(false);
    const [section, setSection] = useState<DetailTab | undefined>(initialTab);
    const [showAllOrders, setShowAllOrders] = useState(false);
    const [historyFilter, setHistoryFilter] = useState("all");
    const shelfRef = useRef<HTMLInputElement>(null);
    useUrlSync({ tab: section });

    // A deep link (?tab=orders) lands on that section. Repeated once the chart and photo have taken their space.
    useEffect(() => {
        if (!initialTab) return;
        const go = () => document.getElementById(SECTION_ID[initialTab])?.scrollIntoView({ block: "start" });
        const frame = window.requestAnimationFrame(go);
        const timer = window.setTimeout(go, 500);
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [initialTab]);

    const baseLedger = useMemo(() => itemLedger(itemId, location), [itemId, location]);
    const siblings = useMemo(() => stockRows(location, item.kind).map((r) => r.item), [location, item.kind]);
    const categories = useMemo(() => [...new Set(items.filter((i) => i.kind === item.kind).map((i) => i.category))].sort(), [item.kind]);
    // Dip powder is its own catalogue item. It points back at the lacquer colour with the same code.
    const lacquer = useMemo(
        () => (item.line === "opi-dip" && item.colorCode ? items.find((i) => i.line === "opi" && i.colorCode === item.colorCode) : undefined),
        [item.line, item.colorCode],
    );

    /** The stock line for a location with this session's adjustments and the given settings applied. */
    const levelWith = (loc: LocationId, s: Settings): StockLevel | undefined => {
        const line = getStock(itemId, loc);
        if (!line) return undefined;
        const withCount = { ...line, ...counts[loc] };
        const now = s.place[loc];
        const was = base.place[loc];
        if (!now || !was) return withCount;
        const ruleChanged = now.par !== was.par || now.rule !== was.rule;
        const pauseChanged = s.item.paused !== base.item.paused;
        if (!ruleChanged && !pauseChanged && now.shelf === was.shelf) return withCount;
        const par = !ruleChanged ? line.par : now.rule === "quantity" && now.par !== "" ? Number(now.par) : now.rule === "quantity" ? line.par : undefined;
        const paused = pauseChanged ? s.item.paused : line.parRule === "paused";
        return { ...withCount, shelf: now.shelf, par, parRule: paused ? "paused" : now.rule };
    };

    const viewWith = (loc: LocationId, s: Settings): PlaceView | undefined => {
        const level = levelWith(loc, s);
        if (!level) return undefined;
        const edited = Boolean(counts[loc]) || countChanges(s, base) > 0;
        const leadTime = vendorById(s.item.vendorId).leadTimeDays;
        const live = (f?: Forecast) => (f && edited ? liveForecast(f, level, leadTime) : f);
        const ruleForecast = live(getForecast(itemId, loc));
        const forecast = ruleForecast ?? live(item.kind === "polish" && loc === "lynnfield" ? getPolishForecast(itemId) : undefined);
        return { level, ruleForecast, forecast, status: stockStatus(level, ruleForecast), lines: incomingLines(itemId, loc) };
    };

    const here = viewWith(location, saved);
    const level = here?.level;
    const forecast = here?.forecast;
    const s = saved.item;
    const shown: Item = {
        ...item,
        vendorId: s.vendorId,
        category: s.category,
        unit: s.unit.trim() || item.unit,
        description: s.description.trim() || undefined,
        sku: s.sku.trim() || undefined,
        upc: s.upc.trim() || undefined,
        unitCost: s.unitCost !== "" ? Number(s.unitCost) : undefined,
        costIsSample: s.unitCost === base.item.unitCost ? item.costIsSample : false,
        discontinued: s.discontinued,
    };
    const unit = unitOf(shown);
    const vendor = vendorById(shown.vendorId);
    const other = locations.find((l) => l.id !== location);

    const changes = countChanges(draft, saved);
    const isDirty = changes > 0;
    const d = draft.item;
    const place = draft.place[location];
    const preview = isDirty ? viewWith(location, draft) : undefined;

    const ledger = [...(added[location] ?? []), ...baseLedger];
    const historyTypes = HISTORY_FILTERS.filter((f) => ledger.some((m) => f.types.includes(m.type)));
    const activeFilter = historyTypes.find((f) => f.id === historyFilter);
    const shownLedger = activeFilter ? ledger.filter((m) => activeFilter.types.includes(m.type)) : ledger;
    const orderLines = purchaseOrders
        .filter((po) => po.locationId === location)
        .flatMap((po) => po.lines.filter((l) => l.itemId === itemId).map((line) => ({ po, line })));
    const visibleOrders = showAllOrders ? orderLines : orderLines.slice(0, ORDERS_SHOWN);
    const itemFlags = flags.filter((f) => f.itemId === itemId && f.locationId === location);
    const recipes = serviceRecipes.filter((r) => r.lines.some((l) => l.itemId === itemId));

    const index = siblings.findIndex((i) => i.id === itemId);
    const previous = index > 0 ? siblings[index - 1] : undefined;
    const next = index >= 0 ? siblings[index + 1] : undefined;

    const suggested = forecast?.suggestedOrderQty ?? 0;
    const orderQty = Math.max(suggested, level?.reorderQty ?? 0, 1);
    // One primary action: ordering when a reorder is suggested, counting otherwise.
    const orderIsPrimary = canOrder && suggested > 0 && here?.status !== "paused";
    const previewSuggested = preview?.forecast?.suggestedOrderQty ?? 0;

    const editItem = (patch: Partial<ItemFields>) => setDraft((prev) => ({ ...prev, item: { ...prev.item, ...patch } }));
    const editPlace = (patch: Partial<PlaceFields>) =>
        setDraft((prev) => {
            const current = prev.place[location];
            return current ? { ...prev, place: { ...prev.place, [location]: { ...current, ...patch } } } : prev;
        });

    const save = async () => {
        const next = draft;
        // Stands in for the request the real app will make.
        await wait(700);
        setSaved(next);
    };

    const scrollTo = (tab: DetailTab) => {
        setSection(tab);
        const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(SECTION_ID[tab])?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    };

    const openAdjust = (loc: LocationId, variantId?: VariantId) => setAdjust((a) => ({ loc, variantId, key: a.key + 1, open: true }));
    const adjustLevel = levelWith(adjust.loc, saved);
    // A colour stocked by finish is adjusted one finish at a time, so the total never drifts from its parts.
    const ownFinishes = adjustLevel?.variants?.filter((v) => !v.linkedItemId);
    const adjustVariant = ownFinishes?.find((v) => v.id === adjust.variantId) ?? ownFinishes?.[0];

    const saveAdjustment = (a: Adjustment) => {
        const loc = adjust.loc;
        const current = levelWith(loc, saved);
        if (!current) return;
        const next = a.variant;
        const finish = next ? current.variants?.find((v) => v.id === next.id) : undefined;
        const variants =
            finish && next
                ? current.variants?.map((v) => (v.id === finish.id ? { ...v, inUse: next.inUse, backstock: next.backstock, onHand: a.onHand } : v))
                : current.variants;
        // The colour's total is its own finishes. Dip powder is a separate item and is not part of it.
        const own = finish ? variants?.filter((v) => !v.linkedItemId) : undefined;
        const total = own ? own.reduce((n, v) => n + v.onHand, 0) : a.onHand;
        const open = Math.min(current.inUse ?? 0, total);
        const split = own
            ? { inUse: own.reduce((n, v) => n + v.inUse, 0), backstock: own.reduce((n, v) => n + v.backstock, 0) }
            : current.inUse !== undefined
              ? { inUse: open, backstock: total - open }
              : {};
        const what =
            finish && next
                ? `${finish.label}: backstock ${finish.backstock} to ${next.backstock}${finish.inUse !== next.inUse ? `, in use ${finish.inUse} to ${next.inUse}` : ""}.`
                : undefined;
        const movement: StockMovement = {
            id: `local-${loc}-${adjust.key}`,
            itemId,
            locationId: loc,
            type: movementType(a.reason, a.delta),
            delta: a.delta,
            balance: total,
            reason: a.reason,
            userId: user.id,
            at: `${TODAY}T10:05:00Z`,
            note: [what, a.note].filter(Boolean).join(" ") || undefined,
            isSample: false,
        };
        setCounts((c) => ({ ...c, [loc]: { onHand: total, fillLevel: a.fillLevel, variants, ...split } }));
        setAdded((m) => ({ ...m, [loc]: [movement, ...(m[loc] ?? [])] }));
        setNotice(
            finish && own
                ? `Saved. ${finish.label} at ${locationName(loc)} is now ${formatCount(a.onHand, unit)}. ${own.map((v) => v.label).join(" and ")} together: ${formatCount(total, unit)}.`
                : `Saved. On hand at ${locationName(loc)} is now ${formatQty({ onHand: a.onHand, fillLevel: a.fillLevel }, unit)}.`,
        );
    };

    const toggleOrder = () => {
        setNotice(
            onOrder ? `Removed from the next ${vendor.name} order.` : `${formatCount(orderQty, unit) || orderQty} added to the next ${vendor.name} order.`,
        );
        setOnOrder((v) => !v);
    };

    const runAction = (id: string) => {
        if (id === "adjust") openAdjust(location);
        else if (id === "order") toggleOrder();
        else if (id === "print") setNotice(`QR label for ${item.name} is ready to print. Nothing is sent to a printer from the prototype.`);
        else if (id === "shelf") {
            scrollTo("settings");
            // After the menu has closed and handed focus back.
            window.setTimeout(() => shelfRef.current?.focus(), 400);
        } else if (id === "transfer" && other) setNotice(`Transfer to ${other.shortName}: transfers are not connected in the prototype, so nothing was moved.`);
        else if (id === "pause") editItem({ paused: !d.paused });
        else if (id === "discontinue") editItem({ discontinued: !d.discontinued });
        else if (id === "activity") scrollTo("history");
    };

    const menuGroups: MenuAction[][] = [
        // On a phone the header keeps one button; the other action moves in here.
        isDesktop
            ? []
            : orderIsPrimary
              ? canCount
                  ? [{ id: "count", label: "Count now", icon: ClipboardCheck, href: ROUTES.counts }]
                  : []
              : canOrder
                ? [{ id: "order", label: onOrder ? "Remove from order" : "Add to order", icon: ShoppingCart01 }]
                : [],
        [
            ...(canEdit && level ? [{ id: "adjust", label: "Adjust quantity", icon: Edit05 }] : []),
            { id: "print", label: "Print QR label", icon: Printer },
            ...(canEdit && level ? [{ id: "shelf", label: "Move to another shelf", icon: MarkerPin01 }] : []),
            ...(canEdit && level && other ? [{ id: "transfer", label: `Transfer to ${other.shortName}`, icon: SwitchHorizontal01 }] : []),
        ],
        canEdit
            ? [
                  { id: "pause", label: d.paused ? "Resume reorder" : "Pause reorder", icon: d.paused ? PlayCircle : PauseCircle },
                  { id: "discontinue", label: d.discontinued ? "Mark as active" : "Mark discontinued", icon: Archive },
              ]
            : [],
        level ? [{ id: "activity", label: "View activity", icon: ClockRewind }] : [],
    ].filter((group) => group.length > 0);

    const moreMenu = (size: "sm" | "lg") => (
        <Dropdown.Root defaultOpen={moreOpen}>
            <Button color="secondary" size={size} iconTrailing={ChevronDown} aria-label="More actions">
                {isDesktop ? "More actions" : "More"}
            </Button>
            <Dropdown.Popover className="w-64">
                <Dropdown.Menu aria-label="More actions" onAction={(key) => runAction(String(key))}>
                    {menuGroups.flatMap((group, i) => [
                        ...(i > 0 ? [<Dropdown.Separator key={`separator-${i}`} />] : []),
                        ...group.map((a) => <Dropdown.Item key={a.id} id={a.id} label={a.label} icon={a.icon} href={a.href} />),
                    ])}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const orderButton = (size: "sm" | "lg", className?: string) => (
        <Button
            size={size}
            color={orderIsPrimary && !onOrder ? "primary" : "secondary"}
            iconLeading={onOrder ? Check : ShoppingCart01}
            className={className}
            onClick={toggleOrder}
        >
            {onOrder ? "Added to order" : "Add to order"}
        </Button>
    );
    const countButton = (size: "sm" | "lg", className?: string) => (
        <Button href={ROUTES.counts} size={size} color={orderIsPrimary ? "secondary" : "primary"} iconLeading={ClipboardCheck} className={className}>
            Count now
        </Button>
    );
    const stepper = (size: "sm" | "lg") => (
        <div role="group" aria-label="Step through the stock list" className="flex shrink-0 items-center gap-1">
            <StepButton direction="previous" target={previous} blocked={isDirty} size={size} onStep={onStep} />
            <StepButton direction="next" target={next} blocked={isDirty} size={size} onStep={onStep} />
        </div>
    );

    const subtitle =
        item.kind === "polish"
            ? [item.brand ?? (item.line ? POLISH_LINE_LABEL[item.line] : undefined), item.colorCode, item.colorFamily].filter(Boolean).join(" · ")
            : (item.brand ?? "");
    const fieldSize = isDesktop ? "sm" : "lg";
    const mono = (value: string) => <span className="font-mono tabular-nums">{value}</span>;

    // Optional fields wait as chips in the details footer. Without edit rights a chip only states its value.
    const chips: FieldChip[] = [
        ...(canEdit
            ? [
                  {
                      id: "description",
                      label: "Description",
                      wide: true,
                      field: (
                          <TextArea
                              label="Description"
                              rows={3}
                              placeholder="What it is and what it is used for"
                              value={d.description}
                              onChange={(description) => editItem({ description })}
                          />
                      ),
                  },
              ]
            : []),
        {
            id: "sku",
            label: "SKU",
            value: d.sku ? mono(d.sku) : undefined,
            field: canEdit ? <Input label="SKU" size={fieldSize} value={d.sku} onChange={(sku) => editItem({ sku })} /> : undefined,
        },
        s.upc || d.upc
            ? {
                  id: "barcodes",
                  label: "Barcodes",
                  value: d.upc ? mono(d.upc) : undefined,
                  field: canEdit ? (
                      <Input
                          label="UPC barcode"
                          size={fieldSize}
                          inputMode="numeric"
                          value={d.upc}
                          onChange={(upc) => editItem({ upc: upc.replace(/[^0-9]/g, "") })}
                      />
                  ) : undefined,
              }
            : { id: "barcodes", label: "Barcodes", value: "Scan to link", href: ROUTES.scan },
        {
            id: "unit",
            label: "Unit",
            value: d.unit || undefined,
            field: canEdit ? <Input label="Counting unit" size={fieldSize} value={d.unit} onChange={(value) => editItem({ unit: value })} /> : undefined,
        },
        ...(canCosts
            ? [
                  {
                      id: "cost",
                      label: "Unit cost",
                      value:
                          d.unitCost !== "" ? (
                              <>
                                  <span className="tabular-nums">{formatCurrency(Number(d.unitCost), true)}</span>
                                  {item.costIsSample && d.unitCost === base.item.unitCost && <SampleBadge />}
                              </>
                          ) : undefined,
                      field: canEdit ? (
                          <Input
                              label={`Cost per ${unit.toLowerCase()}, in dollars`}
                              size={fieldSize}
                              inputMode="decimal"
                              value={d.unitCost}
                              onChange={(value) => editItem({ unitCost: value.replace(/[^0-9.]/g, "") })}
                          />
                      ) : undefined,
                  },
              ]
            : []),
    ].filter((c: FieldChip) => c.field || c.href || c.value !== undefined);

    const onHandCell = (loc: LocationId, name: string, view: PlaceView) => {
        const qty = formatQty(view.level, unit);
        return (
            <span className="inline-flex items-center justify-end gap-1.5">
                {view.level.isSample && !counts[loc] && <SampleBadge />}
                {canAdjustAt(loc) && !view.level.variants ? (
                    <button type="button" onClick={() => openAdjust(loc)} aria-label={`Adjust on hand at ${name}, now ${qty}`} className={quantityButton}>
                        {qty}
                    </button>
                ) : (
                    <span className="font-semibold whitespace-nowrap text-primary tabular-nums">{qty}</span>
                )}
            </span>
        );
    };

    const locationLabel = (id: LocationId, name: string) =>
        id === location ? (
            <span className="flex items-center gap-2">
                {name}
                <span className="text-xs font-medium text-tertiary">Viewing</span>
            </span>
        ) : seen.includes(id) ? (
            <button type="button" onClick={() => onLocationChange(id)} aria-label={`Switch to ${name}`} className={cx(textLink, "max-lg:min-h-11")}>
                {name}
            </button>
        ) : (
            name
        );

    const isPolish = item.kind === "polish";
    const rows = locations.map((l) => ({ id: l.id, name: l.shortName, view: l.id === location ? here : viewWith(l.id, saved) }));

    // Polish finishes. OPI colours are counted as regular and gel, with dip powder linked in from its own item.
    const finishHome = rows.find((r) => r.view?.level.variants?.length);
    const finishes = finishHome?.view?.level.variants;
    const ownLabels = finishes?.filter((v) => !v.linkedItemId).map((v) => v.label) ?? [];
    const finishDemand = finishHome ? variantDemand(itemId, finishHome.id) : {};
    const orderedIn2026 = (v: StockVariant) => (v.linkedItemId && finishHome ? variantDemand(v.linkedItemId, finishHome.id)[v.id] : finishDemand[v.id]) ?? 0;
    const finishUnit = (v: StockVariant) => (v.linkedItemId ? unitOf(getItem(v.linkedItemId) ?? shown) : unit);
    const demandHere = variantDemand(itemId, location);
    const demandSplit = FINISH_ORDER.filter((id) => (demandHere[id] ?? 0) > 0).map((id) => `${FINISH_LABEL[id]} ${demandHere[id]}`);
    const showSplit = isPolish && !finishes;
    // The colour reads as one product: swatch and finishes beside the title, the bottle photo in the details card.
    const colourHeader = isPolish && Boolean(item.swatch) && Boolean(finishes || lacquer);

    const finishStatus = (v: StockVariant) =>
        v.onHand <= 0 ? <StockStatusBadge status="out" /> : <span className="text-xs whitespace-nowrap text-quaternary">No par</span>;
    const finishOnHand = (v: StockVariant) => {
        const qty = formatCount(v.onHand, finishUnit(v));
        return finishHome && !v.linkedItemId && canAdjustAt(finishHome.id) ? (
            <button
                type="button"
                onClick={() => openAdjust(finishHome.id, v.id)}
                aria-label={`Adjust ${v.label} on hand at ${finishHome.name}, now ${qty}`}
                className={quantityButton}
            >
                {qty}
            </button>
        ) : (
            <span className="font-semibold whitespace-nowrap text-primary tabular-nums">{qty}</span>
        );
    };
    const dipLink = (v: StockVariant) =>
        v.linkedItemId ? (
            <a href={ROUTES.item(v.linkedItemId)} className={cx(textLink, "text-xs max-lg:inline-flex max-lg:min-h-11 max-lg:items-center")}>
                Dip powder is its own item
            </a>
        ) : null;
    const hasForecast = Boolean(forecast && forecast.confidence !== "none");

    return (
        <PageContent className="gap-4 lg:gap-5">
            <SaveBar isDirty={isDirty} changeCount={changes} onSave={save} onDiscard={() => setDraft(saved)} />

            <header className="flex flex-col gap-3">
                <div className="flex min-h-9 items-center justify-between gap-3">
                    <Button href={ROUTES.stock} color="link-gray" size="md" iconLeading={ArrowLeft} className="max-lg:min-h-11">
                        Stock
                    </Button>
                    {isDesktop ? (
                        <div className="flex items-center gap-2">
                            {canOrder && level && orderButton("sm")}
                            {canCount && countButton("sm")}
                            {moreMenu("sm")}
                            {stepper("sm")}
                        </div>
                    ) : (
                        stepper("lg")
                    )}
                </div>
                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        {colourHeader && <ItemThumb item={item} size="sm" />}
                        <h1 className="text-xl font-semibold text-primary lg:text-display-xs">{item.name}</h1>
                        {here && <StockStatusBadge status={here.status} size="md" />}
                        {shown.discontinued && (
                            <Badge type="pill-color" color="gray" size="md">
                                Discontinued
                            </Badge>
                        )}
                    </div>
                    {colourHeader && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            {finishes && (
                                <ul aria-label="On hand by finish" className="flex flex-wrap items-center gap-1.5">
                                    {finishes.map((v) => (
                                        <li key={v.id}>
                                            <Badge type="modern" color="gray" size="sm">{`${v.label} ${v.onHand}`}</Badge>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {lacquer && (
                                <a href={ROUTES.item(lacquer.id)} className={cx(textLink, "text-sm max-lg:inline-flex max-lg:min-h-11 max-lg:items-center")}>
                                    See {lacquer.name} lacquer and gel
                                </a>
                            )}
                            <span className="text-quaternary">Swatch colour is approximate.</span>
                        </div>
                    )}
                    <SampleDataNote>
                        The item, shelf, par level and 2026 orders come from Meraki's spreadsheets. {level?.isSample ? "The on-hand number, " : "The "}count
                        dates, usage rows and unit cost are sample values. Edits and adjustments made here last for this session only.
                    </SampleDataNote>
                </div>
                {!isDesktop && (
                    <div className="flex gap-2">
                        {orderIsPrimary && level ? orderButton("lg", "flex-1") : canCount ? countButton("lg", "flex-1") : null}
                        {moreMenu("lg")}
                    </div>
                )}
            </header>

            {notice && (
                <p
                    role="status"
                    className="flex items-center gap-2 rounded-lg bg-success-primary py-1 pr-1 pl-3 text-sm font-medium text-success-primary ring-1 ring-utility-green-200 ring-inset"
                >
                    <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 py-1.5">{notice}</span>
                    <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => setNotice(undefined)}
                        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md outline-focus-ring hover:bg-success-secondary focus-visible:outline-2 max-lg:size-11"
                    >
                        <XClose className="size-4" aria-hidden="true" />
                    </button>
                </p>
            )}

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
                <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
                    {/* Details */}
                    <Card padded={false}>
                        <div className="flex items-start gap-4 p-4 lg:p-5">
                            <ItemThumb
                                item={colourHeader && shown.imageUrl ? { ...shown, swatch: undefined } : shown}
                                size="xl"
                                className="max-lg:size-16 max-lg:rounded-lg"
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <h2 className="text-md font-semibold text-primary">{item.name}</h2>
                                {subtitle && <p className="text-sm text-tertiary">{subtitle}</p>}
                                {shown.description && <p className="mt-1 max-w-2xl text-sm text-secondary">{shown.description}</p>}
                                {item.note && (
                                    <p className="mt-1 text-sm text-tertiary">
                                        <span className="font-medium text-secondary">Note on the sheet:</span> {item.note}
                                    </p>
                                )}
                            </div>
                        </div>
                        {chips.length > 0 && <FieldChips label="More details" fields={chips} className="border-t border-secondary" />}
                    </Card>

                    {/* Inventory */}
                    <Card padded={false} className="overflow-hidden">
                        <div className="flex flex-col gap-3 p-4 lg:p-5">
                            <SectionHeader title="Inventory">
                                {canEdit && level ? (
                                    <Toggle
                                        size="sm"
                                        label="Reorder paused"
                                        isSelected={d.paused}
                                        onChange={(paused) => editItem({ paused })}
                                        className="flex-row-reverse items-center max-lg:min-h-11"
                                    />
                                ) : null}
                            </SectionHeader>

                            {finishes && finishHome && (
                                <div className="flex flex-col gap-2">
                                    <h3 className="text-xs font-medium text-tertiary">Finishes at {finishHome.name}</h3>
                                    {isDesktop ? (
                                        <div className="overflow-x-auto rounded-lg ring-1 ring-secondary ring-inset">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-secondary text-xs text-tertiary">
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            Finish
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined label="In use" definition="Open and out on the polish wall." />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined label="Backstock" definition="Unopened spares." />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined
                                                                label="On hand"
                                                                definition={
                                                                    canAdjustAt(finishHome.id)
                                                                        ? "In use plus backstock. Click a quantity to adjust that finish."
                                                                        : "In use plus backstock."
                                                                }
                                                            />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            <Defined label="Box" definition="The storage box code written on the polish sheet." />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined
                                                                label="Ordered in 2026"
                                                                definition="Ordered in this finish across the 2026 orders. A line marked Regular & Gel counts once for each."
                                                            />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            Status
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-secondary">
                                                    {finishes.map((v) => (
                                                        <tr key={v.id}>
                                                            <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap text-primary">
                                                                <span className="flex flex-col gap-0.5">
                                                                    {v.label}
                                                                    {dipLink(v)}
                                                                </span>
                                                            </th>
                                                            <td className={numberCell}>{v.inUse}</td>
                                                            <td className={numberCell}>{v.backstock}</td>
                                                            <td className="px-3 py-1.5 text-right">{finishOnHand(v)}</td>
                                                            <td className="px-3 py-2 whitespace-nowrap text-secondary">
                                                                {v.box ?? <span className="text-quaternary">None</span>}
                                                            </td>
                                                            <td className={numberCell}>
                                                                {orderedIn2026(v) > 0 ? orderedIn2026(v) : <span className="text-quaternary">0</span>}
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">{finishStatus(v)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <ul className="flex flex-col divide-y divide-secondary">
                                            {finishes.map((v) => (
                                                <li key={v.id} className="flex flex-col gap-2 py-3 first:pt-0">
                                                    <div className="flex min-h-6 items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold text-primary">{v.label}</p>
                                                        {finishStatus(v)}
                                                    </div>
                                                    <dl className="grid grid-cols-3 items-start gap-x-3 gap-y-3 text-sm">
                                                        <div className="col-span-3 flex items-center justify-between gap-3">
                                                            <dt className="text-tertiary">On hand</dt>
                                                            <dd>{finishOnHand(v)}</dd>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">In use</dt>
                                                            <dd className="font-medium text-primary tabular-nums">{v.inUse}</dd>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Backstock</dt>
                                                            <dd className="font-medium text-primary tabular-nums">{v.backstock}</dd>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Box</dt>
                                                            <dd className="font-medium text-primary">
                                                                {v.box ?? <span className="font-normal text-quaternary">None</span>}
                                                            </dd>
                                                        </div>
                                                        <div className="col-span-3 flex items-center justify-between gap-3">
                                                            <dt className="text-xs text-tertiary">Ordered in 2026</dt>
                                                            <dd className="font-medium text-primary tabular-nums">{orderedIn2026(v)}</dd>
                                                        </div>
                                                    </dl>
                                                    {dipLink(v)}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <h3 className="mt-2 text-xs font-medium text-tertiary">
                                        {ownLabels.length > 1 ? `${ownLabels.join(" and ")} together, by location` : "By location"}
                                    </h3>
                                </div>
                            )}

                            {isDesktop ? (
                                <div className="overflow-x-auto rounded-lg ring-1 ring-secondary ring-inset">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-secondary text-xs text-tertiary">
                                                <th scope="col" className={cx(headCell, "text-left")}>
                                                    Location
                                                </th>
                                                <th scope="col" className={cx(headCell, "text-right")}>
                                                    <Defined
                                                        label="On hand"
                                                        definition={
                                                            finishes
                                                                ? `${ownLabels.join(" and ")} together. Adjust a finish in the table above.`
                                                                : canEdit
                                                                  ? "What is on the shelf now, open containers included. Click a quantity to adjust it."
                                                                  : "What is on the shelf now, open containers included."
                                                        }
                                                    />
                                                </th>
                                                {showSplit && (
                                                    <>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined label="In use" definition="Open bottles out on the polish wall." />
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            <Defined label="Backstock" definition="Unopened spares." />
                                                        </th>
                                                    </>
                                                )}
                                                <th scope="col" className={cx(headCell, "text-right")}>
                                                    <Defined
                                                        label="Incoming"
                                                        definition={`Ordered in the last ${INCOMING_MAX_AGE_DAYS} days and not received yet. Hover a number for the orders.`}
                                                    />
                                                </th>
                                                <th scope="col" className={cx(headCell, "text-right")}>
                                                    <Defined label="Par" definition="How many should be on the shelf when fully stocked." />
                                                </th>
                                                <th scope="col" className={cx(headCell, "text-right")}>
                                                    <Defined
                                                        label="Reorder point"
                                                        definition="At or below this, the item shows as low. Usage during the vendor's lead time plus safety stock, or half of par until there is usage history."
                                                    />
                                                </th>
                                                <th scope="col" className={cx(headCell, "text-left")}>
                                                    Status
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-secondary">
                                            {rows.map(({ id, name, view }) => (
                                                <tr key={id}>
                                                    <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap text-primary">
                                                        {locationLabel(id, name)}
                                                    </th>
                                                    {view ? (
                                                        <>
                                                            <td className="px-3 py-1.5 text-right">{onHandCell(id, name, view)}</td>
                                                            {showSplit && (
                                                                <>
                                                                    <td className={numberCell}>{view.level.inUse ?? "Not split"}</td>
                                                                    <td className={numberCell}>{view.level.backstock ?? "Not split"}</td>
                                                                </>
                                                            )}
                                                            <td className={numberCell}>
                                                                <Incoming lines={view.lines} />
                                                            </td>
                                                            <td className={numberCell}>{parOf(view)}</td>
                                                            <td className={numberCell}>{reorderAt(view)}</td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <StockStatusBadge status={view.status} />
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <td colSpan={showSplit ? 7 : 5} className="px-3 py-2.5 text-tertiary">
                                                            Not recorded here
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <ul className="flex flex-col divide-y divide-secondary">
                                    {rows.map(({ id, name, view }) => {
                                        const old = view?.lines.filter((l) => l.unconfirmed) ?? [];
                                        return (
                                            <li key={id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                                                <div className="flex min-h-6 items-center justify-between gap-2">
                                                    <p className="text-sm font-semibold text-primary">{locationLabel(id, name)}</p>
                                                    {view ? (
                                                        <StockStatusBadge status={view.status} />
                                                    ) : (
                                                        <span className="text-sm text-tertiary">Not recorded here</span>
                                                    )}
                                                </div>
                                                {view && (
                                                    <dl className="grid grid-cols-3 items-start gap-x-3 gap-y-3 text-sm">
                                                        <div className="col-span-3 flex items-center justify-between gap-3">
                                                            <dt className="text-tertiary">On hand</dt>
                                                            <dd>{onHandCell(id, name, view)}</dd>
                                                        </div>
                                                        {showSplit && (
                                                            <>
                                                                <div className="flex flex-col gap-0.5">
                                                                    <dt className="text-xs text-tertiary">In use</dt>
                                                                    <dd className="font-medium text-primary tabular-nums">{view.level.inUse ?? "Not split"}</dd>
                                                                </div>
                                                                <div className="col-span-2 flex flex-col gap-0.5">
                                                                    <dt className="text-xs text-tertiary">Backstock</dt>
                                                                    <dd className="font-medium text-primary tabular-nums">
                                                                        {view.level.backstock ?? "Not split"}
                                                                    </dd>
                                                                </div>
                                                            </>
                                                        )}
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Incoming</dt>
                                                            <dd className="font-medium text-primary tabular-nums">
                                                                {view.lines.filter((l) => !l.unconfirmed).reduce((n, l) => n + l.qty, 0)}
                                                            </dd>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Par</dt>
                                                            <dd className="font-medium text-primary tabular-nums">{parOf(view)}</dd>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5">
                                                            <dt className="text-xs text-tertiary">Reorder point</dt>
                                                            <dd className="font-medium text-primary tabular-nums">{reorderAt(view)}</dd>
                                                        </div>
                                                    </dl>
                                                )}
                                                {old.length > 0 && (
                                                    <p className="text-xs text-tertiary">
                                                        {old.reduce((n, l) => n + l.qty, 0)} more on {old.map((l) => l.orderNumber).join(", ")}, ordered over{" "}
                                                        {INCOMING_MAX_AGE_DAYS} days ago and never marked received. Not counted as incoming.
                                                    </p>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            {!level && (
                                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tertiary">
                                    There is no stock line at {locationName(location)} yet. It appears after the first count there.
                                    {other && seen.includes(other.id) && (
                                        <button type="button" onClick={() => onLocationChange(other.id)} className={textLink}>
                                            View {other.shortName}
                                        </button>
                                    )}
                                </p>
                            )}
                        </div>
                        {level && (
                            <div className="border-t border-secondary bg-secondary px-4 py-1 lg:px-5 lg:py-2.5">
                                <button
                                    type="button"
                                    onClick={() => scrollTo("history")}
                                    className={cx(
                                        textLink,
                                        "text-sm text-secondary underline decoration-fg-quaternary hover:text-secondary_hover max-lg:min-h-11",
                                    )}
                                >
                                    View adjustment history
                                </button>
                            </div>
                        )}
                    </Card>

                    {level && (
                        <>
                            {/* Forecast */}
                            <Card className="flex flex-col gap-4">
                                <SectionHeader title="Forecast">{forecast && <ConfidenceBadge confidence={forecast.confidence} />}</SectionHeader>
                                {forecast && hasForecast ? (
                                    <>
                                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                                            <Figure label="Monthly usage">
                                                {forecast.monthlyUsage > 0 ? `About ${formatCount(forecast.monthlyUsage, unit)}` : "Not known yet"}
                                            </Figure>
                                            <Figure label="Days of cover">
                                                {forecast.daysOfCover !== undefined ? plural(forecast.daysOfCover, "day") : "Not known yet"}
                                            </Figure>
                                            <Figure label="Projected stockout">
                                                {forecast.projectedStockoutDate ? formatDate(forecast.projectedStockoutDate, true) : "Not projected"}
                                            </Figure>
                                            <Figure label="Suggested order">{suggested > 0 ? formatCount(suggested, unit) : "None needed"}</Figure>
                                        </dl>
                                        <UsageChart forecast={forecast} unit={formatCount(2, unit).replace(/^2\s/, "")} />
                                        <p className="text-sm text-tertiary">{forecast.explanation}</p>
                                    </>
                                ) : (
                                    <p className="flex items-start gap-2.5 text-sm text-tertiary">
                                        <BarChart07 className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                        <span>
                                            <span className="font-medium text-secondary">No usage to project yet. </span>
                                            {forecast
                                                ? forecast.explanation
                                                : isPolish
                                                  ? "This colour has not been reordered in 2026. A forecast needs at least one reorder or a counted usage."
                                                  : "A forecast needs at least one order cycle or count for this item."}
                                            {suggested > 0 && (
                                                <span className="font-medium text-secondary"> Suggested order: {formatCount(suggested, unit)}.</span>
                                            )}
                                        </span>
                                    </p>
                                )}
                                {demandSplit.length > 1 && <p className="text-sm text-tertiary">Ordered in 2026 by finish: {demandSplit.join(", ")}.</p>}
                            </Card>

                            {/* Orders */}
                            <div id={SECTION_ID.orders} className="scroll-mt-20">
                                <Card className="flex flex-col gap-3 overflow-hidden">
                                    <SectionHeader title="Orders" count={orderLines.length} />
                                    {orderLines.length === 0 ? (
                                        <p className="flex items-start gap-2.5 text-sm text-tertiary">
                                            <ShoppingCart01 className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                            This item is not on any 2026 order for {locationName(location)}.
                                        </p>
                                    ) : isDesktop ? (
                                        <div className="overflow-x-auto rounded-lg ring-1 ring-secondary ring-inset">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="bg-secondary text-xs text-tertiary">
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            Order
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            Placed
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            Ordered
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-right")}>
                                                            Received
                                                        </th>
                                                        <th scope="col" className={cx(headCell, "text-left")}>
                                                            Order status
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-secondary">
                                                    {visibleOrders.map(({ po, line }) => (
                                                        <tr key={`${po.id}-${line.id}`}>
                                                            <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                                                <a href={ROUTES.order(po.id)} className={textLink}>
                                                                    {po.number}
                                                                </a>
                                                            </th>
                                                            <td className="px-3 py-2 whitespace-nowrap text-secondary">{formatDate(po.createdAt, true)}</td>
                                                            <td className={numberCell}>
                                                                {line.qtyOrdered}
                                                                {line.variant ? ` ${line.variant}` : ""}
                                                            </td>
                                                            <td className={numberCell}>
                                                                {line.qtyReceived > 0 ? (
                                                                    <span
                                                                        className={cx(line.qtyReceived < line.qtyOrdered && "font-medium text-warning-primary")}
                                                                    >
                                                                        {line.qtyReceived}
                                                                        {line.receivedAt ? ` on ${formatDate(line.receivedAt)}` : ""}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-quaternary">Not received</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 whitespace-nowrap">
                                                                <OrderStatusBadge status={po.status} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <ul
                                            className={cx(
                                                "-mx-4 divide-y divide-secondary border-t border-secondary",
                                                orderLines.length > ORDERS_SHOWN ? "border-b" : "-mb-4",
                                            )}
                                        >
                                            {visibleOrders.map(({ po, line }) => (
                                                <li key={`${po.id}-${line.id}`}>
                                                    <a
                                                        href={ROUTES.order(po.id)}
                                                        className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2"
                                                    >
                                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                            <span className="flex flex-wrap items-center gap-2">
                                                                <span className="text-sm font-semibold text-primary">{po.number}</span>
                                                                <OrderStatusBadge status={po.status} />
                                                            </span>
                                                            <span className="text-sm text-tertiary">
                                                                {formatDate(po.createdAt, true)} · ordered {line.qtyOrdered}
                                                                {line.variant ? ` ${line.variant}` : ""} ·{" "}
                                                                {line.qtyReceived > 0
                                                                    ? `received ${line.qtyReceived}${line.receivedAt ? ` on ${formatDate(line.receivedAt)}` : ""}`
                                                                    : "not received"}
                                                            </span>
                                                        </span>
                                                        <ChevronRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {orderLines.length > ORDERS_SHOWN && (
                                        <button
                                            type="button"
                                            onClick={() => setShowAllOrders((v) => !v)}
                                            className={cx(textLink, "self-start text-sm max-lg:min-h-11")}
                                        >
                                            {showAllOrders ? `Show the latest ${ORDERS_SHOWN}` : `Show all ${orderLines.length}`}
                                        </button>
                                    )}
                                </Card>
                            </div>

                            {/* Flags: only when there are any, or when a link asked for them. */}
                            {(itemFlags.length > 0 || initialTab === "flags") && (
                                <div id={SECTION_ID.flags} className="scroll-mt-20">
                                    <Card padded={false}>
                                        <div className="px-4 pt-4 lg:px-5 lg:pt-5">
                                            <SectionHeader title="Flags" count={itemFlags.length} />
                                        </div>
                                        {itemFlags.length === 0 ? (
                                            <p className="px-4 pt-2 pb-4 text-sm text-tertiary lg:px-5 lg:pb-5">
                                                No flags for this item at {locationName(location)}.
                                            </p>
                                        ) : (
                                            <ul className="divide-y divide-secondary">
                                                {itemFlags.map((f) => (
                                                    <li key={f.id}>
                                                        <a
                                                            href={ROUTES.flag(f.id)}
                                                            className="flex items-start gap-3 px-4 py-3 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-5"
                                                        >
                                                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                                <span className="flex flex-wrap items-center gap-2">
                                                                    <FlagSeverityBadge severity={f.severity} />
                                                                    <FlagStatusBadge status={f.status} />
                                                                    <span className="text-xs font-medium text-tertiary">{FLAG_TYPE_LABEL[f.type]}</span>
                                                                    {f.fromRealData && <RealDataBadge />}
                                                                </span>
                                                                <span className="text-sm font-semibold text-primary">{f.title}</span>
                                                                <span className="text-sm text-tertiary">{f.summary}</span>
                                                                <span className="text-xs text-quaternary">
                                                                    Detected {formatDate(f.detectedAt.slice(0, 10), true)}
                                                                </span>
                                                            </span>
                                                            <ChevronRight className="mt-1 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </Card>
                                </div>
                            )}

                            {/* History */}
                            <div id={SECTION_ID.history} className="scroll-mt-20">
                                <Card className="flex flex-col gap-4">
                                    <SectionHeader title="History" count={ledger.length}>
                                        {historyTypes.length > 1 && (
                                            <NativeSelect
                                                aria-label="Show movements of type"
                                                size="sm"
                                                className="w-auto"
                                                selectClassName="pr-8 max-lg:min-h-11"
                                                value={activeFilter?.id ?? "all"}
                                                onChange={(e) => setHistoryFilter(e.currentTarget.value)}
                                                options={[
                                                    { label: "All movements", value: "all" },
                                                    ...historyTypes.map((f) => ({ label: f.label, value: f.id })),
                                                ]}
                                            />
                                        )}
                                    </SectionHeader>
                                    <LedgerList
                                        key={activeFilter?.id ?? "all"}
                                        movements={shownLedger}
                                        unit={unit}
                                        fillLevel={Boolean(level.fillLevel)}
                                        pageSize={8}
                                        emptyMessage="No receipts, counts or adjustments recorded for this item yet."
                                    />
                                </Card>
                            </div>
                        </>
                    )}

                    {/* Notes */}
                    <Card className="flex flex-col gap-4">
                        <SectionHeader title="Notes" />
                        <NoteThread
                            key={item.id}
                            subject={{ type: "item", id: item.id }}
                            subjectTitle={item.name}
                            href={ROUTES.item(item.id)}
                            user={user}
                            location={location}
                        />
                    </Card>
                </div>

                {/* Right rail: plain sections, no boxes. Drops under the main column on smaller screens. */}
                <div id={SECTION_ID.settings} className="min-w-0 scroll-mt-20">
                    <DetailRail label="Status and settings">
                        {here && level && (
                            <RailSection title="Status" action={<span className="text-xs font-medium text-tertiary">{locationName(location)}</span>}>
                                <RailField label="Stock">
                                    {STATUS_LABEL[here.status]}, {formatQty(level, unit)} on hand
                                </RailField>
                                <RailField
                                    label="Days of cover"
                                    hint={
                                        hasForecast && forecast?.projectedStockoutDate
                                            ? `Runs out around ${formatDate(forecast.projectedStockoutDate, true)} at this rate.`
                                            : undefined
                                    }
                                >
                                    {hasForecast && forecast?.daysOfCover !== undefined ? plural(forecast.daysOfCover, "day") : "Not known yet"}
                                </RailField>
                                <RailField label="Last counted" hint={level.lastCountedAt ? relativeDays(level.lastCountedAt, TODAY) : undefined}>
                                    {level.lastCountedAt
                                        ? `${formatDate(level.lastCountedAt)} by ${userById(level.lastCountedBy)?.name ?? "staff"}`
                                        : "Not counted in the app yet"}
                                </RailField>
                                {level.reorderRequested && (
                                    <RailField label="On the sheet">Ticked to reorder{level.reorderQty ? `, quantity ${level.reorderQty}` : ""}</RailField>
                                )}
                            </RailSection>
                        )}

                        <RailSection title="Organisation">
                            {canEdit ? (
                                <>
                                    <NativeSelect
                                        label="Category"
                                        size={fieldSize}
                                        value={d.category}
                                        onChange={(e) => editItem({ category: e.currentTarget.value })}
                                        options={categories.map((c) => ({ label: c, value: c }))}
                                    />
                                    <NativeSelect
                                        label="Vendor"
                                        size={fieldSize}
                                        value={d.vendorId}
                                        onChange={(e) => editItem({ vendorId: e.currentTarget.value as VendorId })}
                                        options={vendors.map((v) => ({ label: v.name, value: v.id }))}
                                        hint={vendorLine(vendorById(d.vendorId))}
                                    />
                                    {level && place && (
                                        <div className="grid grid-cols-2 items-start gap-3">
                                            <RailField label="Area" className="gap-1.5 [&>div]:py-2 max-lg:[&>div]:py-2.5">
                                                {level.area}
                                            </RailField>
                                            <Input
                                                ref={shelfRef}
                                                label="Shelf"
                                                size={fieldSize}
                                                value={place.shelf}
                                                onChange={(shelf) => editPlace({ shelf })}
                                            />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <RailField label="Category">{shown.category}</RailField>
                                    <RailField label="Vendor" hint={vendorLine(vendor)}>
                                        {vendor.name}
                                    </RailField>
                                    {level && (
                                        <RailField label="Area and shelf">
                                            {[level.area, level.shelf ? `shelf ${level.shelf}` : undefined].filter(Boolean).join(", ")}
                                        </RailField>
                                    )}
                                </>
                            )}
                            <RailField label="ABC class" hint={ABC_MEANING[item.abc]}>
                                <AbcBadge abc={item.abc} />
                            </RailField>
                        </RailSection>

                        {here && level && (
                            <RailSection title="Reorder" action={<span className="text-xs font-medium text-tertiary">{locationName(location)}</span>}>
                                {canEdit && place ? (
                                    <div className="grid grid-cols-2 items-start gap-3">
                                        <Input
                                            label="Par level"
                                            size={fieldSize}
                                            type="number"
                                            inputMode="numeric"
                                            isDisabled={place.rule !== "quantity"}
                                            value={place.rule === "quantity" ? place.par : ""}
                                            onChange={(v) => editPlace({ par: v.replace(/[^0-9]/g, "") })}
                                        />
                                        <NativeSelect
                                            label="Par rule"
                                            size={fieldSize}
                                            value={place.rule}
                                            onChange={(e) => editPlace({ rule: e.currentTarget.value as Rule })}
                                            options={[
                                                { label: "By quantity", value: "quantity" },
                                                { label: "By fill level", value: "level" },
                                                { label: "No par", value: "unset" },
                                            ]}
                                        />
                                        {(place.rule !== "quantity" || level.parNote) && (
                                            <p className="col-span-2 text-xs text-tertiary">
                                                {place.rule === "level"
                                                    ? "Reorder when the container reaches half. Applies from the next count."
                                                    : place.rule === "unset"
                                                      ? "The item cannot go low until a par is set."
                                                      : `On the sheet: "${level.parNote}"`}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <RailField label="Par level">{parOf(here)}</RailField>
                                        <RailField label="Par rule">{RULE_LABEL[level.parRule]}</RailField>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <RailField label="Reorder point">{reorderAt(here)}</RailField>
                                    <RailField label="Suggested order">{suggested > 0 ? formatCount(suggested, unit) || suggested : "None needed"}</RailField>
                                </div>
                                {preview && previewSuggested !== suggested && (
                                    <p className="text-xs text-tertiary" role="status">
                                        After saving, the suggested order becomes{" "}
                                        {previewSuggested > 0 ? formatCount(previewSuggested, unit) || previewSuggested : "none"}.
                                    </p>
                                )}
                            </RailSection>
                        )}

                        <RailSection title="Usage">
                            <RailField
                                label="Monthly usage"
                                hint={
                                    hasForecast && forecast && forecast.observations > 0
                                        ? `From ${plural(forecast.observations, "order cycle")} in 2026.`
                                        : undefined
                                }
                            >
                                {hasForecast && forecast && forecast.monthlyUsage > 0 ? `About ${formatCount(forecast.monthlyUsage, unit)}` : "Not known yet"}
                            </RailField>
                            {recipes.length > 0 && (
                                <RailField label="Used in">
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {recipes.map((r) => r.service).join(", ")}
                                        {recipes.some((r) => r.isExample) && <SampleBadge label="Example recipe" />}
                                    </span>
                                </RailField>
                            )}
                            {canInsights && (
                                <Button
                                    href={ROUTES.insights}
                                    color="link-color"
                                    size="sm"
                                    iconTrailing={ArrowNarrowRight}
                                    className="self-start max-lg:min-h-11"
                                >
                                    See where it is used in Insights
                                </Button>
                            )}
                        </RailSection>
                    </DetailRail>
                </div>
            </div>

            {/* Room for the save bar where it docks above the tab bar on phones. */}
            {isDirty && <div className="h-14 lg:hidden" aria-hidden="true" />}

            {adjustLevel && (
                <AdjustModal
                    key={`${adjust.loc}-${adjust.key}`}
                    isOpen={adjust.open}
                    onOpenChange={(open) => setAdjust((a) => ({ ...a, open }))}
                    item={shown}
                    level={adjustLevel}
                    variant={adjustVariant}
                    onSave={saveAdjustment}
                />
            )}
        </PageContent>
    );
};
