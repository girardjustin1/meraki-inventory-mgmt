"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
    ArrowLeft,
    ArrowNarrowRight,
    Check,
    CheckCircle,
    ChevronRight,
    ClipboardCheck,
    Edit05,
    Flag01,
    InfoCircle,
    Package,
    QrCode02,
    ShoppingCart01,
} from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Table, TableCard } from "@/components/application/table/table";
import { Tab, TabList, TabPanel, Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, CardHeader, PageContent, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { FillLevelPicker } from "@/components/meraki/fill-level-picker";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { LedgerList, REASON_CODES, REASON_LABEL } from "@/components/meraki/ledger-list";
import { QuantityStepper } from "@/components/meraki/quantity-stepper";
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
import { StockMeter } from "@/components/meraki/stock-meter";
import { UsageChart } from "@/components/meraki/usage-chart";
import {
    CURRENT_USER,
    TODAY,
    flags,
    getForecast,
    getItem,
    getStock,
    itemLedger,
    locationName,
    locations,
    purchaseOrders,
    userById,
    vendorById,
    vendors,
} from "@/data/inventory";
import type { FillLevel, Forecast, Item, LocationId, MovementType, ParRule, PolishLine, ReasonCode, StockLevel, StockMovement, VendorId } from "@/data/types";
import { addDays, formatDate, relativeDays } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { suggestOrderQty } from "@/engine/forecast";
import { FILL_FRACTION, FILL_LABEL, formatCount, formatCurrency, formatQty, stockStatus } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

const DEFAULT_ITEM = "sup-igel-beauty-non-cleansing-gel-top-coat";

const LINE_LABEL: Record<PolishLine, string> = {
    opi: "OPI",
    "opi-dip": "OPI dip",
    dnd: "DND",
    "dazzle-dry": "Dazzle Dry",
    chisel: "Chisel",
    "apres-gel-x": "Aprés Gel-X",
};
const RULE_LABEL: Record<ParRule, string> = { quantity: "Counted by quantity", level: "Tracked by fill level", paused: "Reorder paused", unset: "No par set" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Items sold as "Each" have no sensible plural, so they read as units. */
const unitOf = (item: Item) => (item.unit.toLowerCase() === "each" ? "Unit" : item.unit);

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

// ------------------------------------------------------------------------------------ small pieces

const Fact = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-medium text-tertiary">{label}</dt>
        <dd className="text-sm font-semibold text-primary tabular-nums">{children}</dd>
        {hint && <dd className="text-xs text-tertiary">{hint}</dd>}
    </div>
);

const CodeChip = ({ label, value }: { label: string; value: string }) => (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-0.5 text-xs text-secondary ring-1 ring-secondary ring-inset">
        <span className="font-medium text-tertiary">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
    </span>
);

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

// ------------------------------------------------------------------------------------ adjust modal

interface Adjustment {
    onHand: number;
    fillLevel?: FillLevel;
    delta: number;
    reason: ReasonCode;
    note?: string;
}

interface AdjustModalProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    item: Item;
    level: StockLevel;
    onSave: (adjustment: Adjustment) => void;
}

/**
 * Shopify's pattern: adjust by or set to, a required reason with no default, and the result shown
 * before anything is saved. Nothing is edited in place; saving writes one new ledger row.
 */
const AdjustModal = ({ isOpen, onOpenChange, item, level, onSave }: AdjustModalProps) => {
    const unit = unitOf(item);
    const byFill = Boolean(level.fillLevel);
    const [mode, setMode] = useState<"adjust" | "set">("adjust");
    const [direction, setDirection] = useState<"remove" | "add">("remove");
    const [amount, setAmount] = useState(1);
    const [target, setTarget] = useState(level.onHand);
    const [fill, setFill] = useState<FillLevel | undefined>(level.fillLevel);
    const [reason, setReason] = useState<ReasonCode | "">("");
    const [note, setNote] = useState("");

    const after = byFill
        ? FILL_FRACTION[fill ?? "empty"]
        : mode === "set"
          ? target
          : direction === "add"
            ? level.onHand + amount
            : Math.max(0, level.onHand - amount);
    const delta = Math.round((after - level.onHand) * 100) / 100;
    const sensitive = reason === "lost" || reason === "suspected-theft";
    const noteRequired = Math.abs(delta) >= 3 || sensitive;
    const missing =
        delta === 0
            ? "Change the quantity to save."
            : reason === ""
              ? "Choose a reason to save."
              : noteRequired && !note.trim()
                ? "Add a note to save."
                : undefined;

    const before = formatQty(level, unit);
    const afterText = byFill ? FILL_LABEL[fill ?? "empty"] : formatCount(after, unit);

    return (
        <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
            <Modal className="max-w-md">
                <Dialog aria-label={`Adjust stock for ${item.name}`}>
                    <div className="flex flex-col gap-5 p-5 sm:p-6">
                        <div className="flex items-start gap-3">
                            <ItemThumb item={item} size="md" />
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold text-primary">Adjust stock</h2>
                                <p className="truncate text-sm text-tertiary">
                                    {item.name} · {locationName(level.locationId)}
                                </p>
                            </div>
                        </div>

                        {byFill ? (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm font-medium text-secondary">Set fill level to</p>
                                <FillLevelPicker label={`Fill level for ${item.name}`} value={fill} onChange={setFill} />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
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
                                            label={direction === "add" ? "Quantity to add" : "Quantity to remove"}
                                            value={amount}
                                            onChange={setAmount}
                                            min={0}
                                            max={direction === "remove" ? level.onHand : undefined}
                                        />
                                    </div>
                                ) : (
                                    <QuantityStepper
                                        className="w-full"
                                        label="New quantity on hand"
                                        value={target}
                                        onChange={setTarget}
                                        min={0}
                                        unit={formatCount(target, unit).replace(/^[\d.]+\s/, "")}
                                    />
                                )}
                            </div>
                        )}

                        <div
                            aria-live="polite"
                            className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 ring-1 ring-secondary ring-inset"
                        >
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <p className="text-xs font-medium text-tertiary">On hand after saving</p>
                                <p className="flex flex-wrap items-center gap-x-2 text-md font-semibold text-primary tabular-nums">
                                    <span className="text-tertiary">{before}</span>
                                    <ArrowNarrowRight className="size-4 shrink-0 text-fg-quaternary" aria-label="becomes" />
                                    <span>{afterText}</span>
                                </p>
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
                                        onSave({ onHand: after, fillLevel: byFill ? fill : undefined, delta, reason, note: note.trim() || undefined });
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

// ------------------------------------------------------------------------------------ settings tab

interface ItemSettings {
    par: string;
    rule: Exclude<ParRule, "paused">;
    paused: boolean;
    vendorId: VendorId;
    unit: string;
}

const SettingsTab = ({ saved, onSave, parNote }: { saved: ItemSettings; onSave: (settings: ItemSettings) => void; parNote?: string }) => {
    const [draft, setDraft] = useState(saved);
    const [justSaved, setJustSaved] = useState(false);
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    const set = (patch: Partial<ItemSettings>) => {
        setDraft((d) => ({ ...d, ...patch }));
        setJustSaved(false);
    };
    const vendor = vendorById(draft.vendorId);

    return (
        <Card className="flex flex-col gap-5">
            <CardHeader title="Item settings" description="Changes apply to this location and are kept for this session only in the prototype." />
            <div className="grid gap-4 md:grid-cols-2">
                <NativeSelect
                    label="Par rule"
                    size="md"
                    value={draft.rule}
                    onChange={(e) => set({ rule: e.currentTarget.value as ItemSettings["rule"] })}
                    options={[
                        { label: RULE_LABEL.quantity, value: "quantity" },
                        { label: RULE_LABEL.level, value: "level" },
                        { label: RULE_LABEL.unset, value: "unset" },
                    ]}
                    hint={
                        draft.rule === "level"
                            ? "Reorder when the container reaches half. Applies from the next count."
                            : draft.rule === "unset"
                              ? "The item cannot go low until a par is set."
                              : parNote
                                ? `On the sheet: "${parNote}"`
                                : undefined
                    }
                />
                <Input
                    label="Par level"
                    size="md"
                    type="number"
                    inputMode="numeric"
                    isDisabled={draft.rule !== "quantity"}
                    value={draft.rule === "quantity" ? draft.par : ""}
                    onChange={(v) => set({ par: v.replace(/[^0-9]/g, "") })}
                    hint={draft.rule === "quantity" ? "How many should be on the shelf when fully stocked." : "Not used with this rule."}
                />
                <NativeSelect
                    label="Vendor"
                    size="md"
                    value={draft.vendorId}
                    onChange={(e) => set({ vendorId: e.currentTarget.value as VendorId })}
                    options={vendors.map((v) => ({ label: v.name, value: v.id }))}
                    hint={`About ${plural(vendor.leadTimeDays, "day")} from order to delivery${vendor.leadTimeIsEstimate ? " (estimate)" : ""}.`}
                />
                <Input
                    label="Counting unit"
                    size="md"
                    value={draft.unit}
                    onChange={(v) => set({ unit: v })}
                    hint="Bottle, box, gallon. Used wherever a quantity is shown."
                />
            </div>
            <div className="rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
                <Toggle
                    size="md"
                    label="Pause reordering"
                    hint="Leaves the item out of reorder suggestions and low-stock alerts. It is still counted."
                    isSelected={draft.paused}
                    onChange={(paused) => set({ paused })}
                />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                {justSaved && (
                    <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary sm:mr-auto">
                        <CheckCircle className="size-4" aria-hidden="true" />
                        Settings saved for this session.
                    </p>
                )}
                <Button color="secondary" size="md" isDisabled={!dirty} onClick={() => setDraft(saved)}>
                    Discard changes
                </Button>
                <Button
                    size="md"
                    isDisabled={!dirty}
                    onClick={() => {
                        onSave(draft);
                        setJustSaved(true);
                    }}
                >
                    Save settings
                </Button>
            </div>
        </Card>
    );
};

// ------------------------------------------------------------------------------------ screen

type DetailTab = "history" | "orders" | "flags" | "settings";

interface ItemDetailScreenProps {
    itemId?: string;
    location?: LocationId;
    /** Which record tab is open first. */
    initialTab?: DetailTab;
    /** Open the adjust dialog straight away. Used by the story that documents it. */
    adjusting?: boolean;
}

/** One item: what is on the shelf, how fast it goes, and every movement that got it there. */
export const ItemDetailScreen = ({
    itemId = DEFAULT_ITEM,
    location: initialLocation = "lynnfield",
    initialTab = "history",
    adjusting = false,
}: ItemDetailScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const isDesktop = useBreakpoint("lg");
    const item = getItem(itemId);

    // Local edits, kept per location so switching salons does not lose them.
    const [counts, setCounts] = useState<Partial<Record<LocationId, Pick<StockLevel, "onHand" | "fillLevel">>>>({});
    const [added, setAdded] = useState<Partial<Record<LocationId, StockMovement[]>>>({});
    const [settings, setSettings] = useState<Partial<Record<LocationId, ItemSettings>>>({});
    const [adjustOpen, setAdjustOpen] = useState(adjusting);
    const [adjustKey, setAdjustKey] = useState(0);
    const [savedMessage, setSavedMessage] = useState<string>();
    const [onOrder, setOnOrder] = useState(false);
    const [tab, setTab] = useState<DetailTab>(initialTab);

    const baseLedger = useMemo(() => itemLedger(itemId, location), [itemId, location]);

    if (!item) {
        return (
            <AppShell activeUrl={ROUTES.stock} location={location} onLocationChange={setLocation}>
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
            </AppShell>
        );
    }

    /** The stock line for a location with this session's edits applied. */
    const levelAt = (loc: LocationId): StockLevel | undefined => {
        const base = getStock(itemId, loc);
        if (!base) return undefined;
        const cfg = settings[loc];
        const withCount = { ...base, ...counts[loc] };
        if (!cfg) return withCount;
        const par = cfg.rule === "quantity" && cfg.par !== "" ? Number(cfg.par) : cfg.rule === "quantity" ? base.par : undefined;
        return { ...withCount, par, parRule: cfg.paused ? "paused" : cfg.rule };
    };

    const level = levelAt(location);
    const cfg = settings[location];
    const shown: Item = cfg ? { ...item, vendorId: cfg.vendorId, unit: cfg.unit.trim() || item.unit } : item;
    const unit = unitOf(shown);
    const vendor = vendorById(shown.vendorId);
    const baseForecast = getForecast(itemId, location);
    const edited = Boolean(counts[location] || cfg);
    const forecast = baseForecast && level ? (edited ? liveForecast(baseForecast, level, vendor.leadTimeDays) : baseForecast) : undefined;
    const status = level ? stockStatus(level, forecast) : "unknown";

    const ledger = [...(added[location] ?? []), ...baseLedger];
    const orderLines = purchaseOrders
        .filter((po) => po.locationId === location)
        .flatMap((po) => po.lines.filter((l) => l.itemId === itemId).map((line) => ({ po, line })));
    const openQty = orderLines
        .filter(
            ({ po, line }) =>
                (po.status === "sent" || po.status === "partially-received" || po.status === "approved" || po.status === "awaiting-approval") &&
                line.qtyReceived === 0,
        )
        .reduce((n, { line }) => n + line.qtyOrdered, 0);
    const itemFlags = flags.filter((f) => f.itemId === itemId && f.locationId === location);
    const openItemFlags = itemFlags.filter((f) => f.status === "open" || f.status === "reviewing").length;

    const savedSettings: ItemSettings = cfg ?? {
        par: level?.par !== undefined ? String(level.par) : "",
        rule: level?.parRule === "paused" ? (level.par !== undefined ? "quantity" : "unset") : (level?.parRule ?? "unset"),
        paused: level?.parRule === "paused",
        vendorId: item.vendorId,
        unit: item.unit,
    };

    const saveAdjustment = (a: Adjustment) => {
        if (!level) return;
        const movement: StockMovement = {
            id: `local-${location}-${adjustKey}`,
            itemId,
            locationId: location,
            type: movementType(a.reason, a.delta),
            delta: a.delta,
            balance: a.onHand,
            reason: a.reason,
            userId: CURRENT_USER.id,
            at: `${TODAY}T10:05:00Z`,
            note: a.note,
            isSample: false,
        };
        setCounts((c) => ({ ...c, [location]: { onHand: a.onHand, fillLevel: a.fillLevel } }));
        setAdded((m) => ({ ...m, [location]: [movement, ...(m[location] ?? [])] }));
        setSavedMessage(`Saved. On hand at ${locationName(location)} is now ${formatQty({ onHand: a.onHand, fillLevel: a.fillLevel }, unit)}.`);
        setTab("history");
    };

    const openAdjust = () => {
        setAdjustKey((k) => k + 1);
        setAdjustOpen(true);
    };

    const subtitle =
        item.kind === "polish"
            ? [item.brand ?? (item.line ? LINE_LABEL[item.line] : undefined), item.colorCode, item.colorFamily].filter(Boolean).join(" · ")
            : [item.brand, item.category].filter(Boolean).join(" · ");
    const place = level ? [level.area, item.kind === "supply" && level.shelf ? `Shelf ${level.shelf}` : undefined].filter(Boolean).join(" · ") : undefined;
    const suggested = forecast?.suggestedOrderQty ?? 0;
    const orderQty = Math.max(suggested, level?.reorderQty ?? 0, 1);

    const actionButtons = (size: "md" | "lg") => (
        <>
            <Button color="secondary" size={size} iconLeading={Edit05} className="flex-1" onClick={openAdjust}>
                Adjust
            </Button>
            <Button href={ROUTES.counts} size={size} iconLeading={ClipboardCheck} className="flex-1">
                Count now
            </Button>
        </>
    );

    return (
        <AppShell activeUrl={ROUTES.stock} location={location} onLocationChange={setLocation}>
            <PageContent className="gap-5 lg:gap-6">
                <header className="flex flex-col gap-4">
                    <Button href={ROUTES.stock} color="link-gray" size="md" iconLeading={ArrowLeft} className="self-start">
                        Stock
                    </Button>
                    <div className="flex items-start gap-4 lg:gap-5">
                        <ItemThumb item={item} size="xl" className="max-lg:size-16 max-lg:rounded-lg" />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex flex-col gap-0.5">
                                <h1 className="text-xl font-semibold text-primary lg:text-display-xs">{item.name}</h1>
                                <p className="text-sm text-tertiary lg:text-md">{[subtitle, place].filter(Boolean).join(" · ")}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {level && <StockStatusBadge status={status} size="md" />}
                                <AbcBadge abc={item.abc} size="md" showHint />
                                {item.discontinued && (
                                    <Badge type="pill-color" color="gray" size="md">
                                        Discontinued
                                    </Badge>
                                )}
                                {level?.reorderRequested && (
                                    <Badge type="pill-color" color="brand" size="md">
                                        Ticked to reorder on the sheet{level.reorderQty ? ` · ${level.reorderQty}` : ""}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {item.upc && <CodeChip label="UPC" value={item.upc} />}
                            {item.sku && <CodeChip label="SKU" value={item.sku} />}
                            {!item.upc && (
                                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-tertiary">
                                    <QrCode02 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                    No barcode linked yet ·
                                    <Button href={ROUTES.scan} color="link-color" size="md">
                                        Scan to link
                                    </Button>
                                </p>
                            )}
                        </div>
                        {item.description && <p className="max-w-3xl text-sm text-secondary">{item.description}</p>}
                        {item.note && (
                            <p className="text-sm text-tertiary">
                                <span className="font-medium text-secondary">Note on the sheet:</span> {item.note}
                            </p>
                        )}
                    </div>
                </header>

                <SampleDataNote>
                    The item, shelf, par level and 2026 orders come from Meraki's spreadsheets. {level?.isSample ? "The on-hand number, " : "The "}count dates,
                    usage rows and unit cost are sample values.
                </SampleDataNote>

                {savedMessage && (
                    <p
                        role="status"
                        className="flex items-center gap-2 rounded-lg bg-success-primary px-3 py-2.5 text-sm font-medium text-success-primary ring-1 ring-utility-green-200 ring-inset"
                    >
                        <CheckCircle className="size-4 shrink-0" aria-hidden="true" />
                        {savedMessage}
                    </p>
                )}

                {!level ? (
                    <Card>
                        <Quiet
                            title={`Not recorded at ${locationName(location)}`}
                            action={
                                <Button color="secondary" size="md" onClick={() => setLocation(location === "lynnfield" ? "newburyport" : "lynnfield")}>
                                    View {locationName(location === "lynnfield" ? "newburyport" : "lynnfield")}
                                </Button>
                            }
                        >
                            There is no stock line for this item here yet. It appears after the first count at this location.
                        </Quiet>
                    </Card>
                ) : (
                    <>
                        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-6">
                            <div className="flex flex-col gap-4 lg:gap-6">
                                <Card className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-sm font-medium text-tertiary">On hand at {locationName(location)}</h2>
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span
                                                className={cx(
                                                    "text-display-sm font-semibold tabular-nums lg:text-display-md",
                                                    status === "out" ? "text-error-primary" : "text-primary",
                                                )}
                                            >
                                                {formatQty(level, unit)}
                                            </span>
                                            {level.isSample && !counts[location] && <SampleBadge />}
                                        </p>
                                    </div>
                                    <StockMeter level={level} status={status} reorderPoint={forecast?.reorderPoint} size="md" />
                                    <dl className="grid grid-cols-3 gap-3">
                                        <Fact label="Par">{level.fillLevel ? "Full" : (level.par ?? "Not set")}</Fact>
                                        <Fact label="Reorder at">
                                            {level.fillLevel
                                                ? "Half"
                                                : forecast && forecast.reorderPoint > 0
                                                  ? forecast.reorderPoint
                                                  : level.par !== undefined
                                                    ? Math.floor(level.par / 2)
                                                    : "Not set"}
                                        </Fact>
                                        <Fact label="On order">{openQty > 0 ? openQty : "None"}</Fact>
                                    </dl>
                                    <p className="border-t border-secondary pt-3 text-sm text-tertiary">
                                        {level.lastCountedAt ? (
                                            <>
                                                Last counted {formatDate(level.lastCountedAt)} by{" "}
                                                <span className="font-medium text-secondary">{userById(level.lastCountedBy)?.name ?? "staff"}</span>,{" "}
                                                {relativeDays(level.lastCountedAt, TODAY)}.
                                            </>
                                        ) : (
                                            "Not counted in the app yet."
                                        )}
                                        {item.unitCost !== undefined && (
                                            <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                {formatCurrency(item.unitCost, true)} per {unit.toLowerCase()}
                                                {item.costIsSample && <SampleBadge />}
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex gap-3 max-lg:hidden">{actionButtons("md")}</div>
                                </Card>

                                {item.kind === "supply" && (
                                    <Card className="flex flex-col gap-3">
                                        <CardHeader title="Both locations" />
                                        <ul className="-mx-2 flex flex-col">
                                            {locations.map((l) => {
                                                const other = levelAt(l.id);
                                                const otherForecast = getForecast(itemId, l.id);
                                                const otherStatus = other ? (l.id === location ? status : stockStatus(other, otherForecast)) : "unknown";
                                                const viewing = l.id === location;
                                                const body = (
                                                    <>
                                                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                            <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                                                                {l.shortName}
                                                                {viewing && <span className="text-xs font-medium text-tertiary">Viewing</span>}
                                                            </span>
                                                            {other ? (
                                                                <StockMeter
                                                                    level={other}
                                                                    status={otherStatus}
                                                                    reorderPoint={l.id === location ? forecast?.reorderPoint : otherForecast?.reorderPoint}
                                                                />
                                                            ) : (
                                                                <span className="text-xs text-tertiary">Not recorded here</span>
                                                            )}
                                                        </span>
                                                        {other && (
                                                            <span className="flex shrink-0 flex-col items-end gap-1">
                                                                <span className="text-sm font-semibold text-primary tabular-nums">
                                                                    {formatQty(other, unit)}
                                                                </span>
                                                                <StockStatusBadge status={otherStatus} />
                                                            </span>
                                                        )}
                                                    </>
                                                );
                                                return (
                                                    <li key={l.id}>
                                                        {viewing ? (
                                                            <div className="flex min-h-14 items-center gap-3 rounded-lg bg-secondary px-2 py-2.5">{body}</div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setLocation(l.id)}
                                                                aria-label={`Switch to ${l.shortName}`}
                                                                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                                            >
                                                                {body}
                                                            </button>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </Card>
                                )}
                            </div>

                            <Card className="flex flex-col gap-4 lg:col-span-2">
                                <CardHeader
                                    title="Usage and forecast"
                                    description={
                                        forecast
                                            ? forecast.method === "order-history"
                                                ? "Based on the 2026 order history."
                                                : forecast.method === "movement-ledger"
                                                  ? "Based on logged usage."
                                                  : level.fillLevel
                                                    ? "Tracked by fill level, so there is no usage rate yet."
                                                    : "No order history yet, so this rests on the par level."
                                            : undefined
                                    }
                                    actions={forecast ? <ConfidenceBadge confidence={forecast.confidence} size="md" /> : undefined}
                                />
                                {forecast ? (
                                    <>
                                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset md:grid-cols-4">
                                            <Fact label="Monthly usage">
                                                {forecast.monthlyUsage > 0 ? `About ${formatCount(forecast.monthlyUsage, unit)}` : "Not known yet"}
                                            </Fact>
                                            <Fact label="Days of cover">
                                                {forecast.daysOfCover !== undefined ? plural(forecast.daysOfCover, "day") : "Not known yet"}
                                            </Fact>
                                            <Fact label="Projected stockout">
                                                {forecast.projectedStockoutDate ? formatDate(forecast.projectedStockoutDate, true) : "Not projected"}
                                            </Fact>
                                            <Fact label="Suggested order">{suggested > 0 ? formatCount(suggested, unit) : "None needed"}</Fact>
                                        </dl>
                                        <UsageChart forecast={forecast} unit={formatCount(2, unit).replace(/^2\s/, "")} />
                                        <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2.5 text-sm text-secondary">
                                            <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                            {forecast.explanation}
                                        </p>
                                    </>
                                ) : (
                                    <Quiet title="No forecast for this item yet">
                                        {item.kind === "supply"
                                            ? "A forecast appears after the first order cycle or count."
                                            : "Forecasts cover supplies for now. Colours are reordered when one runs out or is ticked on the polish sheet."}
                                    </Quiet>
                                )}
                                <div className="flex flex-col gap-3 border-t border-secondary pt-4 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-tertiary" role="status">
                                        {onOrder ? (
                                            <span className="flex items-center gap-1.5 font-medium text-success-primary">
                                                <CheckCircle className="size-4" aria-hidden="true" />
                                                {formatCount(orderQty, unit)} added to the next {vendor.name} order.
                                            </span>
                                        ) : (
                                            <>
                                                Ordered from <span className="font-medium text-secondary">{vendor.name}</span>, about{" "}
                                                {plural(vendor.leadTimeDays, "day")} to arrive{vendor.leadTimeIsEstimate ? " (estimate)" : ""}.
                                            </>
                                        )}
                                    </p>
                                    <Button
                                        size="md"
                                        color={onOrder ? "secondary" : "primary"}
                                        iconLeading={onOrder ? Check : ShoppingCart01}
                                        className="shrink-0"
                                        onClick={() => setOnOrder((v) => !v)}
                                    >
                                        {onOrder ? "Added to order" : suggested > 0 ? `Add ${formatCount(orderQty, unit)} to order` : "Add to order"}
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as DetailTab)} className="gap-4">
                            <TabList type="underline" size="md" aria-label="Item records" className="scrollbar-hide overflow-x-auto">
                                <Tab id="history" label="History" badge={ledger.length || undefined} />
                                <Tab id="orders" label="Orders" badge={orderLines.length || undefined} />
                                <Tab id="flags" label="Flags" badge={openItemFlags || undefined} />
                                <Tab id="settings" label="Settings" />
                            </TabList>

                            <TabPanel id="history">
                                <Card className="flex flex-col gap-4">
                                    <CardHeader
                                        title="Stock history"
                                        description="Every receipt, use, count and adjustment for the last six months, newest first."
                                    />
                                    <LedgerList
                                        movements={ledger}
                                        unit={unit}
                                        fillLevel={Boolean(level.fillLevel)}
                                        emptyMessage="No receipts, counts or adjustments recorded for this item yet."
                                    />
                                </Card>
                            </TabPanel>

                            <TabPanel id="orders">
                                {orderLines.length === 0 ? (
                                    <Card>
                                        <Quiet icon={ShoppingCart01} title="No orders on file">
                                            This item is not on any 2026 order for {locationName(location)}.
                                        </Quiet>
                                    </Card>
                                ) : isDesktop ? (
                                    <TableCard.Root size="sm">
                                        <Table aria-label="Orders that include this item">
                                            <Table.Header>
                                                <Table.Head id="po" label="Order" isRowHeader />
                                                <Table.Head id="date" label="Placed" />
                                                <Table.Head id="vendor" label="Vendor" />
                                                <Table.Head id="ordered" label="Ordered" />
                                                <Table.Head id="received" label="Received" />
                                                <Table.Head id="status" label="Order status" />
                                            </Table.Header>
                                            <Table.Body>
                                                {orderLines.map(({ po, line }) => (
                                                    <Table.Row
                                                        key={`${po.id}-${line.id}`}
                                                        id={`${po.id}-${line.id}`}
                                                        href={ROUTES.order(po.id)}
                                                        className="cursor-pointer"
                                                    >
                                                        <Table.Cell className="font-medium whitespace-nowrap text-primary">{po.number}</Table.Cell>
                                                        <Table.Cell className="whitespace-nowrap">{formatDate(po.createdAt, true)}</Table.Cell>
                                                        <Table.Cell className="whitespace-nowrap">{vendorById(po.vendorId).name}</Table.Cell>
                                                        <Table.Cell className="whitespace-nowrap tabular-nums">
                                                            {line.qtyOrdered}
                                                            {line.variant ? ` ${line.variant}` : ""}
                                                        </Table.Cell>
                                                        <Table.Cell className="whitespace-nowrap">
                                                            {line.qtyReceived > 0 ? (
                                                                <span
                                                                    className={cx(
                                                                        "tabular-nums",
                                                                        line.qtyReceived < line.qtyOrdered
                                                                            ? "font-medium text-warning-primary"
                                                                            : "text-secondary",
                                                                    )}
                                                                >
                                                                    {line.qtyReceived}
                                                                    {line.receivedAt ? ` on ${formatDate(line.receivedAt)}` : ""}
                                                                </span>
                                                            ) : (
                                                                <span className="text-quaternary">Not received</span>
                                                            )}
                                                        </Table.Cell>
                                                        <Table.Cell>
                                                            <OrderStatusBadge status={po.status} />
                                                        </Table.Cell>
                                                    </Table.Row>
                                                ))}
                                            </Table.Body>
                                        </Table>
                                    </TableCard.Root>
                                ) : (
                                    <Card padded={false}>
                                        <ul className="divide-y divide-secondary">
                                            {orderLines.map(({ po, line }) => (
                                                <li key={`${po.id}-${line.id}`}>
                                                    <a
                                                        href={ROUTES.order(po.id)}
                                                        className="flex min-h-14 items-center gap-3 px-4 py-3 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2"
                                                    >
                                                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                                                            <span className="flex flex-wrap items-center gap-2">
                                                                <span className="text-sm font-semibold text-primary">{po.number}</span>
                                                                <OrderStatusBadge status={po.status} />
                                                            </span>
                                                            <span className="text-sm text-tertiary">
                                                                {formatDate(po.createdAt, true)} · {vendorById(po.vendorId).name}
                                                            </span>
                                                            <span className="text-sm text-secondary">
                                                                Ordered {line.qtyOrdered}
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
                                    </Card>
                                )}
                            </TabPanel>

                            <TabPanel id="flags">
                                <Card padded={itemFlags.length === 0}>
                                    {itemFlags.length === 0 ? (
                                        <Quiet icon={Flag01} title="No flags for this item">
                                            Count variances, receiving mismatches and unusual orders for this item show up here.
                                        </Quiet>
                                    ) : (
                                        <ul className="divide-y divide-secondary">
                                            {itemFlags.map((f) => (
                                                <li key={f.id}>
                                                    <a
                                                        href={ROUTES.flag(f.id)}
                                                        className="flex items-start gap-3 px-4 py-4 outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-5"
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
                            </TabPanel>

                            <TabPanel id="settings">
                                <SettingsTab
                                    key={location}
                                    saved={savedSettings}
                                    parNote={level.parNote}
                                    onSave={(next) => setSettings((all) => ({ ...all, [location]: next }))}
                                />
                            </TabPanel>
                        </Tabs>

                        {/* Room for the sticky action bar on phones. */}
                        <div className="h-16 lg:hidden" aria-hidden="true" />
                        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex gap-3 border-t border-secondary bg-primary/95 px-4 py-3 backdrop-blur lg:hidden">
                            {actionButtons("lg")}
                        </div>

                        <AdjustModal
                            key={`${location}-${adjustKey}`}
                            isOpen={adjustOpen}
                            onOpenChange={setAdjustOpen}
                            item={shown}
                            level={level}
                            onSave={saveAdjustment}
                        />
                    </>
                )}
            </PageContent>
        </AppShell>
    );
};
