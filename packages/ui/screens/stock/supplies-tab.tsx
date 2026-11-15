"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    ClipboardCheck,
    Download01,
    Edit05,
    MarkerPin01,
    PauseCircle,
    PlayCircle,
    QrCode02,
    ShoppingCart01,
    Target04,
    Truck01,
} from "@untitledui/icons";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { Card, ROUTES } from "@/components/meraki/app-shell";
import type { BulkAction } from "@/components/meraki/bulk-action-bar";
import { BulkActionBar } from "@/components/meraki/bulk-action-bar";
import type { BulkEditResult } from "@/components/meraki/bulk-quantity-editor";
import { BulkQuantityEditor } from "@/components/meraki/bulk-quantity-editor";
import type { ActiveFilters, ToolbarColumn, ToolbarFilter } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar, passesFilters } from "@/components/meraki/data-table-toolbar";
import { ItemThumb } from "@/components/meraki/item-thumb";
import type { QuantityChange } from "@/components/meraki/quantity-edit-popover";
import { QuantityEditPopover } from "@/components/meraki/quantity-edit-popover";
import { unitWord } from "@/components/meraki/quantity-stepper";
import { AbcBadge, SampleBadge, StockStatusBadge } from "@/components/meraki/status-badges";
import type { StockRow } from "@/data/inventory";
import { TODAY, incomingLines, locationName, stockRows, vendorById } from "@/data/inventory";
import type { FillLevel, LocationId, StockLevel, StockStatus, User, VendorId } from "@/data/types";
import { formatDate, relativeDays } from "@/engine/dates";
import { suggestOrderQty } from "@/engine/forecast";
import { can } from "@/engine/permissions";
import { REASON_LABEL } from "@/engine/reasons";
import { FILL_FRACTION, FILL_LABEL, STATUS_LABEL, formatCurrency, stockStatus } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import type { ParChoice } from "./stock-dialogs";
import { AddToOrderDialog, ChangeVendorDialog, CountTheseDialog, MoveDialog, SetParDialog } from "./stock-dialogs";
import type { Notice } from "./stock-shared";
import { NothingHere, ShowMore, norm, plural } from "./stock-shared";

export type StatusFilter = "all" | "out" | "low" | "over" | "unknown";
type ViewId = "all" | "low" | "out" | "reorder" | "no-par";
type SortId = "urgent" | "shelf" | "name" | "on-hand" | "cover" | "counted";
type ColumnId = "status" | "incoming" | "par" | "cover" | "area" | "vendor" | "category" | "reorder-point" | "suggested" | "counted" | "value" | "abc";
type DialogId = "order" | "count" | "edit" | "par" | "vendor" | "move";

const SUPPLY_PAGE = 60;

const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, over: 3, unknown: 4, paused: 5 };

const SORTS: { id: SortId; label: string }[] = [
    { id: "urgent", label: "Most urgent first" },
    { id: "shelf", label: "Shelf order" },
    { id: "name", label: "Name, A to Z" },
    { id: "on-hand", label: "On hand, low to high" },
    { id: "cover", label: "Days of cover, shortest first" },
    { id: "counted", label: "Last counted, oldest first" },
];

interface ColumnDef {
    id: ColumnId;
    label: string;
    align?: "right";
    /** Definition shown when the header is hovered or focused. */
    tooltip?: string;
    /** Shown unless the person turns it off. */
    onByDefault?: boolean;
}

const COLUMNS: ColumnDef[] = [
    { id: "status", label: "Status", onByDefault: true },
    {
        id: "incoming",
        label: "Incoming",
        onByDefault: true,
        tooltip:
            "Ordered and not received yet. An order placed more than 120 days ago and never marked received shows as unconfirmed: it has probably arrived.",
    },
    { id: "par", label: "Par", align: "right", onByDefault: true, tooltip: "The quantity to keep on the shelf. Orders top stock back up to it." },
    {
        id: "cover",
        label: "Days of cover",
        align: "right",
        onByDefault: true,
        tooltip: "How long what is on the shelf should last at the forecast usage rate.",
    },
    { id: "area", label: "Area" },
    { id: "vendor", label: "Vendor" },
    { id: "category", label: "Category" },
    {
        id: "reorder-point",
        label: "Reorder point",
        align: "right",
        tooltip: "Reorder when on hand falls to this: usage during the vendor's lead time, plus safety stock.",
    },
    { id: "suggested", label: "Suggested order", align: "right" },
    { id: "counted", label: "Last counted" },
    { id: "value", label: "Value", align: "right" },
    { id: "abc", label: "ABC class" },
];

const ON_HAND_TIP = "What is on the shelf now: the last count, plus deliveries and adjustments since.";

// ------------------------------------------------------------------------------------ local edits

/** A change made on this screen. The prototype has no backend, so edits live here until the page is left. */
interface Override {
    onHand?: number;
    fillLevel?: FillLevel;
    /** null clears the par level. */
    par?: number | null;
    paused?: boolean;
    vendorId?: VendorId;
    area?: string;
    shelf?: string;
    /** Why the quantity changed, for the hover text on the edited number. */
    why?: string;
}
type Overrides = Record<string, Override>;

/** The row as it reads after a local edit: status, days of cover and the suggested order are worked out again. */
const applyOverride = (row: StockRow, o?: Override): StockRow => {
    if (!o) return row;
    const level: StockLevel = { ...row.level };
    if (o.fillLevel) {
        level.fillLevel = o.fillLevel;
        level.onHand = FILL_FRACTION[o.fillLevel];
        level.isSample = false;
    } else if (o.onHand !== undefined) {
        level.onHand = o.onHand;
        level.isSample = false;
    }
    if (o.par !== undefined) {
        level.par = o.par ?? undefined;
        if (o.par !== null && level.parRule === "unset") level.parRule = "quantity";
        if (o.par === null && level.parRule === "quantity") level.parRule = "unset";
    }
    if (o.paused === true) level.parRule = "paused";
    if (o.paused === false && level.parRule === "paused") level.parRule = level.par !== undefined ? "quantity" : "unset";
    if (o.area) level.area = o.area;
    if (o.shelf !== undefined) level.shelf = o.shelf;

    const vendor = o.vendorId ? vendorById(o.vendorId) : row.vendor;
    const forecast = row.forecast && {
        ...row.forecast,
        onHand: level.onHand,
        daysOfCover: row.forecast.dailyUsage > 0 ? Math.floor(level.onHand / row.forecast.dailyUsage) : undefined,
        suggestedOrderQty: suggestOrderQty({
            onHand: level.onHand,
            par: level.par,
            dailyUsage: row.forecast.dailyUsage,
            leadTimeDays: vendor.leadTimeDays,
            safetyStock: row.forecast.safetyStock,
            reorderPoint: row.forecast.reorderPoint,
        }),
    };
    return { ...row, level, vendor, forecast, status: stockStatus(level, forecast), value: level.onHand * (row.item.unitCost ?? 0) };
};

const needsReorder = (r: StockRow) => r.level.parRule !== "paused" && ((r.forecast?.suggestedOrderQty ?? 0) > 0 || r.level.reorderRequested);

const inView = (r: StockRow, view: ViewId) =>
    view === "all" || (view === "reorder" ? needsReorder(r) : view === "no-par" ? r.status === "unknown" || r.status === "paused" : r.status === view);

const FILTER_READ: Record<string, (r: StockRow) => string | string[] | undefined> = {
    area: (r) => r.level.area,
    vendor: (r) => r.vendor.id,
    category: (r) => r.item.category,
    status: (r) => r.status,
    abc: (r) => r.item.abc,
    incoming: (r) => [...(r.incoming > 0 ? ["incoming"] : []), ...(r.unconfirmed > 0 ? ["unconfirmed"] : [])],
};

const coverText = (r: StockRow) => {
    if (r.level.fillLevel) return undefined;
    const days = r.forecast?.daysOfCover;
    return days === undefined ? undefined : days === 0 ? "No cover" : plural(days, "day");
};

const parText = (r: StockRow) => (r.level.fillLevel ? "Half" : r.level.par !== undefined ? String(r.level.par) : undefined);

const counted = (r: StockRow) => (r.level.lastCountedAt ? relativeDays(r.level.lastCountedAt, TODAY) : "Never");

// ------------------------------------------------------------------------------------ small pieces

const ShelfChip = ({ shelf }: { shelf: string }) => (
    <span
        className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset"
        title={`Shelf ${shelf}`}
    >
        <span className="sr-only">Shelf </span>
        {shelf}
    </span>
);

/** Column header with a definition: dotted underline, tooltip on hover and focus. */
const HeaderLabel = ({ label, tooltip }: { label: string; tooltip?: string }) =>
    tooltip ? (
        <Tooltip title={tooltip} placement="top">
            <TooltipTrigger className="cursor-help rounded-xs text-xs font-semibold whitespace-nowrap text-quaternary underline decoration-fg-quaternary decoration-dotted underline-offset-4 outline-focus-ring focus-visible:outline-2">
                {label}
            </TooltipTrigger>
        </Tooltip>
    ) : (
        <span className="text-xs font-semibold whitespace-nowrap text-quaternary">{label}</span>
    );

/** What is on order for one item. Opens the order numbers and their age. */
const Incoming = ({ row, location, compact, linkOrders }: { row: StockRow; location: LocationId; compact?: boolean; linkOrders: boolean }) => {
    if (row.incoming <= 0 && row.unconfirmed <= 0) return compact ? null : <span className="text-quaternary tabular-nums">0</span>;
    const lines = incomingLines(row.item.id, location);
    return (
        <AriaDialogTrigger>
            <AriaButton
                aria-label={`On order for ${row.item.name}: ${row.incoming > 0 ? `${row.incoming} incoming` : ""}${row.incoming > 0 && row.unconfirmed > 0 ? ", " : ""}${row.unconfirmed > 0 ? `${row.unconfirmed} unconfirmed` : ""}. Show orders`}
                data-incoming-trigger
                className={({ isHovered, isFocusVisible }) =>
                    cx(
                        "inline-flex cursor-pointer items-center gap-1 rounded-md text-sm whitespace-nowrap underline decoration-transparent decoration-dotted underline-offset-4 outline-focus-ring transition duration-100 ease-linear",
                        compact ? "min-h-6 text-xs" : "-mx-2 min-h-9 px-2",
                        isHovered && "bg-primary_hover decoration-fg-quaternary",
                        isFocusVisible && "outline-2 outline-offset-1",
                    )
                }
            >
                {row.incoming > 0 && (
                    <span className="font-medium text-primary tabular-nums">
                        {compact && "+"}
                        {row.incoming}
                        {compact && " incoming"}
                    </span>
                )}
                {row.unconfirmed > 0 && (
                    <span className="inline-flex items-center gap-1 text-tertiary">
                        <AlertTriangle className="size-3.5 text-fg-warning-secondary" aria-hidden="true" />
                        <span className="tabular-nums">{row.unconfirmed}</span>
                        {(row.incoming <= 0 || !compact) && " unconfirmed"}
                    </span>
                )}
            </AriaButton>
            <AriaPopover
                placement="bottom start"
                offset={6}
                className={({ isEntering, isExiting }) =>
                    cx(
                        "w-80 max-w-[calc(100vw-1.5rem)] origin-(--trigger-anchor-point) rounded-xl bg-primary shadow-xl ring-1 ring-secondary_alt will-change-transform",
                        isEntering && "duration-150 ease-out animate-in fade-in",
                        isExiting && "duration-100 ease-in animate-out fade-out",
                    )
                }
            >
                <AriaDialog aria-label={`Orders for ${row.item.name}`} className="flex flex-col gap-2 p-4 outline-hidden">
                    <p className="text-sm font-semibold text-primary">On order</p>
                    <ul className="flex flex-col divide-y divide-secondary">
                        {lines.map((line) => (
                            <li key={line.orderId} className="flex items-start justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    {linkOrders ? (
                                        <a
                                            href={ROUTES.order(line.orderId)}
                                            className="rounded-xs text-sm font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                        >
                                            {line.orderNumber}
                                        </a>
                                    ) : (
                                        <p className="text-sm font-semibold text-primary">{line.orderNumber}</p>
                                    )}
                                    <p className="text-xs text-tertiary">
                                        Ordered {formatDate(line.orderedAt)}, {plural(line.ageDays, "day")} ago
                                    </p>
                                </div>
                                <p className={cx("shrink-0 text-sm tabular-nums", line.unconfirmed ? "text-tertiary" : "font-semibold text-primary")}>
                                    {line.qty} {unitWord(line.qty, row.item.unit)}
                                    {line.unconfirmed && <span className="block text-right text-xs">unconfirmed</span>}
                                </p>
                            </li>
                        ))}
                    </ul>
                    {row.unconfirmed > 0 && (
                        <p className="rounded-lg bg-warning-primary px-3 py-2 text-xs text-secondary">
                            Unconfirmed: ordered more than 120 days ago and never marked received. It is not counted as stock on its way. Receive the order or
                            close the line to clear it.
                        </p>
                    )}
                </AriaDialog>
            </AriaPopover>
        </AriaDialogTrigger>
    );
};

// ------------------------------------------------------------------------------------ the tab

export interface SuppliesTabProps {
    location: LocationId;
    user: User;
    initialStatus: StatusFilter;
    initialReorderOnly: boolean;
    initialQuery: string;
    initialSelected?: string[];
    editingItemId?: string;
    initialBulkEditing?: boolean;
    initialColumnsOpen?: boolean;
    notify: (notice: Notice | null) => void;
}

export const SuppliesTab = ({
    location,
    user,
    initialStatus,
    initialReorderOnly,
    initialQuery,
    initialSelected = [],
    editingItemId,
    initialBulkEditing,
    initialColumnsOpen,
    notify,
}: SuppliesTabProps) => {
    const isDesktop = useBreakpoint("lg");
    const canAdjust = can(user, "stock.adjust", location);
    const canOrder = can(user, "orders.create", location);
    const canSchedule = can(user, "counts.schedule", location);
    const seesCosts = can(user, "costs.view", location);
    const seesOrders = can(user, "orders.view", location);

    const baseRows = useMemo(() => stockRows(location, "supply"), [location]);
    const [overrides, setOverrides] = useState<Overrides>({});
    const rows = useMemo(() => baseRows.map((r) => applyOverride(r, overrides[r.item.id])), [baseRows, overrides]);
    const baseById = useMemo(() => new Map(baseRows.map((r) => [r.item.id, r])), [baseRows]);
    const rowById = useMemo(() => new Map(rows.map((r) => [r.item.id, r])), [rows]);
    // The edits the list was last sorted and filtered with. An edited row stays where it is (it does not
    // jump down the list or drop out of the "Low" view) until the view, search, filters or sort change.
    const [listedWith, setListedWith] = useState<Overrides>({});
    const listRows = useMemo(() => baseRows.map((r) => applyOverride(r, listedWith[r.item.id])), [baseRows, listedWith]);

    const [view, setView] = useState<ViewId>(
        initialReorderOnly ? "reorder" : initialStatus === "low" || initialStatus === "out" ? initialStatus : initialStatus === "unknown" ? "no-par" : "all",
    );
    const [filters, setFilters] = useState<ActiveFilters>(
        initialStatus !== "all" && (initialReorderOnly || initialStatus === "over") ? { status: [initialStatus] } : {},
    );
    const [query, setQuery] = useState(initialQuery);
    const [sort, setSort] = useState<SortId>("urgent");
    const [shownColumns, setShownColumns] = useState<string[]>(COLUMNS.filter((c) => c.onByDefault).map((c) => c.id));
    const [visible, setVisible] = useState(SUPPLY_PAGE);
    const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
    const [selectMode, setSelectMode] = useState(initialSelected.length > 0);
    const [dialog, setDialog] = useState<DialogId | null>(initialBulkEditing ? "edit" : null);
    const [saved, setSaved] = useState<{ id: string; prev: Override | undefined } | null>(null);
    // Shift-click range selection: where the last click landed.
    const anchor = useRef<string | null>(null);
    // A long press on a phone starts selecting; the tap that ends it must not open the item.
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const swallowUntil = useRef(0);

    // Deep link: the same `status`, `reorder` and `q` parameters the page reads back. null (not undefined) removes a
    // parameter: useUrlSync serialises its input, which drops undefined keys before it can clear them.
    const statusPicked = filters.status ?? [];
    const onlyStatus = statusPicked.length === 1 ? statusPicked[0] : undefined;
    useUrlSync({
        status:
            view === "low" || view === "out"
                ? view
                : view === "no-par"
                  ? "unknown"
                  : onlyStatus && ["out", "low", "over", "unknown"].includes(onlyStatus)
                    ? onlyStatus
                    : null,
        reorder: view === "reorder" ? "1" : null,
        q: query,
    });

    // "Saved · Undo" beside the edited number goes away on its own.
    useEffect(() => {
        if (!saved) return;
        const timer = setTimeout(() => setSaved(null), 8000);
        return () => clearTimeout(timer);
    }, [saved]);

    const areas = useMemo(() => [...new Set(baseRows.map((r) => r.level.area))], [baseRows]);

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const tally = (read: (r: StockRow) => string) => {
            const counts = new Map<string, number>();
            for (const r of rows) counts.set(read(r), (counts.get(read(r)) ?? 0) + 1);
            return counts;
        };
        const byArea = tally((r) => r.level.area);
        const byVendor = tally((r) => r.vendor.id);
        const byCategory = tally((r) => r.item.category);
        const byStatus = tally((r) => r.status);
        const byAbc = tally((r) => r.item.abc);
        return [
            { id: "area", label: "Area", options: [...byArea].map(([id, count]) => ({ id, label: id, count })) },
            {
                id: "vendor",
                label: "Vendor",
                options: [...byVendor].map(([id, count]) => ({ id, label: vendorById(id).name, count })).sort((a, b) => a.label.localeCompare(b.label)),
            },
            {
                id: "category",
                label: "Category",
                options: [...byCategory].map(([id, count]) => ({ id, label: id, count })).sort((a, b) => a.label.localeCompare(b.label)),
            },
            {
                id: "status",
                label: "Status",
                options: (["out", "low", "ok", "over", "unknown", "paused"] as StockStatus[]).map((s) => ({
                    id: s,
                    label: STATUS_LABEL[s],
                    count: byStatus.get(s) ?? 0,
                })),
            },
            {
                id: "abc",
                label: "ABC class",
                options: [
                    { id: "A", label: "A: count weekly", count: byAbc.get("A") ?? 0 },
                    { id: "B", label: "B: count monthly", count: byAbc.get("B") ?? 0 },
                    { id: "C", label: "C: count quarterly", count: byAbc.get("C") ?? 0 },
                ],
            },
            {
                id: "incoming",
                label: "On order",
                options: [
                    { id: "incoming", label: "Incoming", count: rows.filter((r) => r.incoming > 0).length },
                    { id: "unconfirmed", label: "Unconfirmed", count: rows.filter((r) => r.unconfirmed > 0).length },
                ],
            },
        ];
    }, [rows]);

    const views = [
        { id: "all", label: "All", count: rows.length },
        { id: "low", label: "Low", count: rows.filter((r) => inView(r, "low")).length },
        { id: "out", label: "Out", count: rows.filter((r) => inView(r, "out")).length },
        { id: "reorder", label: "Needs reorder", count: rows.filter((r) => inView(r, "reorder")).length },
        { id: "no-par", label: "No par", count: rows.filter((r) => inView(r, "no-par")).length },
    ];

    const filtered = useMemo(() => {
        const q = norm(query);
        const out = listRows.filter(
            (r) =>
                inView(r, view) &&
                passesFilters(r, filters, FILTER_READ) &&
                // Each field on its own, so a search cannot match across the end of one field and the start of the next.
                (!q ||
                    [r.item.name, `${r.item.brand ?? ""} ${r.item.name}`, r.item.category, r.item.sku ?? "", r.item.upc ?? ""].some((f) =>
                        norm(f).includes(q),
                    )),
        );
        const byName = (a: StockRow, b: StockRow) => a.item.name.localeCompare(b.item.name);
        const cover = (r: StockRow) => r.forecast?.daysOfCover ?? Number.POSITIVE_INFINITY;
        const compare: Record<SortId, (a: StockRow, b: StockRow) => number> = {
            urgent: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || cover(a) - cover(b) || byName(a, b),
            shelf: (a, b) => areas.indexOf(a.level.area) - areas.indexOf(b.level.area) || a.level.shelf.localeCompare(b.level.shelf) || byName(a, b),
            name: byName,
            "on-hand": (a, b) => a.level.onHand - b.level.onHand || byName(a, b),
            cover: (a, b) => cover(a) - cover(b) || byName(a, b),
            counted: (a, b) => (a.level.lastCountedAt ?? "").localeCompare(b.level.lastCountedAt ?? "") || byName(a, b),
        };
        return out.sort(compare[sort]).flatMap((r) => rowById.get(r.item.id) ?? []);
    }, [listRows, rowById, query, view, filters, sort, areas]);

    const page = filtered.slice(0, visible);
    const pageIds = page.map((r) => r.item.id);
    const narrowed = filtered.length !== rows.length;

    // Changing what is listed starts paging again and drops the selection, so actions never hit rows that are out of sight.
    const relist = () => {
        setListedWith(overrides);
        setVisible(SUPPLY_PAGE);
        if (selected.size) setSelected(new Set());
        anchor.current = null;
    };
    const clearAll = () => {
        setQuery("");
        setView("all");
        setFilters({});
        relist();
    };

    // ---------------------------------------------------------------- selection

    const toggle = (id: string, range = false) => {
        const next = new Set(selected);
        const from = anchor.current ? pageIds.indexOf(anchor.current) : -1;
        const to = pageIds.indexOf(id);
        if (range && from >= 0 && to >= 0 && from !== to) {
            for (const key of pageIds.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(key);
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
        anchor.current = id;
    };
    const allShownSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    const someSelected = selected.size > 0;
    const toggleAllShown = () => setSelected(allShownSelected ? new Set() : new Set([...selected, ...pageIds]));
    const clearSelection = () => {
        setSelected(new Set());
        anchor.current = null;
    };
    // In the order the list shows them, so dialogs and the bulk grid read top to bottom like the table.
    const selectedRows = [...filtered.filter((r) => selected.has(r.item.id)), ...rows.filter((r) => selected.has(r.item.id) && !filtered.includes(r))];

    // ---------------------------------------------------------------- edits

    const saveQuantity = (row: StockRow, change: QuantityChange) => {
        const id = row.item.id;
        const prev = overrides[id];
        const why = `${REASON_LABEL[change.reason]}${change.note ? `: ${change.note}` : ""}`;
        setOverrides({ ...overrides, [id]: { ...prev, ...(change.fillLevel ? { fillLevel: change.fillLevel } : { onHand: change.onHand }), why } });
        setSaved({ id, prev });
        notify(null);
    };

    const undoSaved = () => {
        if (!saved) return;
        const next = { ...overrides };
        if (saved.prev) next[saved.id] = saved.prev;
        else delete next[saved.id];
        setOverrides(next);
        setSaved(null);
    };

    /** Apply one change to many rows, then say what happened and offer to undo it. */
    const patchMany = (targets: StockRow[], change: (row: StockRow) => Override | undefined, message: (count: number) => ReactNode) => {
        const before = overrides;
        const next = { ...overrides };
        let count = 0;
        for (const row of targets) {
            const o = change(row);
            if (!o) continue;
            next[row.item.id] = { ...next[row.item.id], ...o };
            count += 1;
        }
        setOverrides(next);
        setSaved(null);
        setDialog(null);
        notify({
            text: message(count),
            onUndo: count
                ? () => {
                      setOverrides(before);
                      notify(null);
                  }
                : undefined,
        });
    };

    const saveBulk = (result: BulkEditResult) => {
        const byId = new Map(result.changes.map((c) => [c.id, c]));
        const why = result.reason ? `${REASON_LABEL[result.reason]}${result.note ? `: ${result.note}` : ""}` : undefined;
        patchMany(
            selectedRows,
            (row) => {
                const c = byId.get(row.item.id);
                if (!c) return undefined;
                return {
                    ...(c.onHand !== undefined ? { onHand: c.onHand, why } : {}),
                    ...(c.par !== undefined ? { par: c.par } : {}),
                    ...(c.paused !== undefined ? { paused: c.paused } : {}),
                };
            },
            (count) => `Saved changes to ${plural(count, "item")}.`,
        );
    };

    const applyPar = (choice: ParChoice) =>
        patchMany(
            selectedRows,
            (row) => (row.level.fillLevel ? undefined : { par: choice.mode === "value" ? choice.par : row.level.onHand }),
            (count) =>
                choice.mode === "value"
                    ? `Par level set to ${choice.par} for ${plural(count, "item")}.`
                    : `Par level set to the current on hand for ${plural(count, "item")}.`,
        );

    const setPaused = (paused: boolean) =>
        patchMany(
            selectedRows,
            (row) => ((row.level.parRule === "paused") === paused ? undefined : { paused }),
            (count) =>
                count === 0
                    ? paused
                        ? "Reorder was already paused for the selected items."
                        : "None of the selected items had reorder paused."
                    : paused
                      ? `Reorder paused for ${plural(count, "item")}. They stay out of suggested orders until resumed.`
                      : `Reorder resumed for ${plural(count, "item")}.`,
        );

    const actions: BulkAction[] = [
        ...(canOrder ? [{ id: "order", label: "Add to order", icon: ShoppingCart01, onAction: () => setDialog("order") }] : []),
        ...(canSchedule ? [{ id: "count", label: "Count these", icon: ClipboardCheck, onAction: () => setDialog("count") }] : []),
        ...(canAdjust
            ? [
                  { id: "edit", label: "Edit quantities", icon: Edit05, onAction: () => setDialog("edit") },
                  { id: "par", label: "Set par level", icon: Target04, onAction: () => setDialog("par") },
                  { id: "vendor", label: "Change vendor", icon: Truck01, onAction: () => setDialog("vendor") },
                  { id: "move", label: "Move to area or shelf", icon: MarkerPin01, onAction: () => setDialog("move") },
                  { id: "pause", label: "Pause reorder", icon: PauseCircle, onAction: () => setPaused(true) },
                  { id: "resume", label: "Resume reorder", icon: PlayCircle, onAction: () => setPaused(false) },
              ]
            : []),
        {
            id: "labels",
            label: "Print QR labels",
            icon: QrCode02,
            onAction: () => notify({ text: `${plural(selected.size, "QR label")} would go to the label printer. Nothing is printed in the prototype.` }),
        },
        {
            id: "export",
            label: "Export selected",
            icon: Download01,
            onAction: () => notify({ text: `${plural(selected.size, "row")} would be exported as a CSV file. Nothing is downloaded in the prototype.` }),
        },
    ];

    // ---------------------------------------------------------------- cells

    const toolbarColumns: ToolbarColumn[] = [
        { id: "item", label: "Item", locked: true },
        { id: "status", label: "Status" },
        { id: "on-hand", label: "On hand", locked: true },
        ...COLUMNS.filter((c) => c.id !== "status" && (c.id !== "value" || seesCosts)).map((c) => ({ id: c.id, label: c.label })),
    ];
    const tableColumns = COLUMNS.filter((c) => shownColumns.includes(c.id) && (c.id !== "value" || seesCosts));
    const afterOnHand = tableColumns.filter((c) => c.id !== "status");
    const showStatus = shownColumns.includes("status");

    const quantity = (r: StockRow, layout: "table" | "card") => {
        const base = baseById.get(r.item.id);
        const edited = base && (base.level.onHand !== r.level.onHand || base.level.fillLevel !== r.level.fillLevel);
        const was = edited && base ? (base.level.fillLevel ? FILL_LABEL[base.level.fillLevel] : String(base.level.onHand)) : undefined;
        const why = overrides[r.item.id]?.why;
        const wasMark = was && (
            <span
                className="mr-1.5 text-xs font-normal text-tertiary tabular-nums line-through"
                title={`Changed this session. Was ${was}.${why ? ` ${why}` : ""}`}
            >
                {was}
                <span className="sr-only"> before this session</span>
            </span>
        );
        const sampleDot = r.level.isSample && (
            <span aria-hidden="true" title="Sample count" className="ml-1.5 size-1 shrink-0 rounded-full bg-fg-warning-secondary opacity-60" />
        );
        const content =
            layout === "card" ? (
                <span className="flex flex-col items-end leading-tight">
                    <span className="flex items-center text-md font-semibold tabular-nums">
                        {wasMark}
                        {r.level.fillLevel ? FILL_LABEL[r.level.fillLevel] : r.level.onHand}
                        {sampleDot}
                    </span>
                    {!r.level.fillLevel && <span className="text-xs font-normal text-tertiary">{unitWord(r.level.onHand, r.item.unit)}</span>}
                </span>
            ) : r.level.fillLevel ? (
                <span className="flex items-center">
                    {wasMark}
                    {FILL_LABEL[r.level.fillLevel]}
                    {sampleDot}
                </span>
            ) : (
                <span className="flex items-center">
                    {wasMark}
                    <span className="min-w-5 text-right font-semibold tabular-nums">{r.level.onHand}</span>
                    <span className="ml-1.5 font-normal text-tertiary">{unitWord(r.level.onHand, r.item.unit)}</span>
                    {sampleDot}
                </span>
            );
        return (
            <QuantityEditPopover
                item={r.item}
                level={r.level}
                isDisabled={!canAdjust}
                disabledReason="You can see stock but not adjust it"
                defaultOpen={canAdjust && editingItemId === r.item.id}
                triggerClassName={layout === "table" ? "-mx-2" : "justify-end"}
                onSave={(change) => saveQuantity(r, change)}
            >
                {content}
            </QuantityEditPopover>
        );
    };

    const savedPill = (id: string, className?: string) =>
        saved?.id === id && (
            <span
                role="status"
                data-testid="saved-pill"
                className={cx(
                    "inline-flex items-center gap-1.5 rounded-full bg-primary py-1 pr-1 pl-2 text-xs font-medium whitespace-nowrap text-success-primary shadow-md ring-1 ring-secondary",
                    className,
                )}
            >
                <Check className="size-3.5" aria-hidden="true" />
                Saved
                <span aria-hidden="true" className="text-quaternary">
                    ·
                </span>
                <button
                    type="button"
                    onClick={undoSaved}
                    data-testid="undo-saved"
                    className="cursor-pointer rounded-full px-1.5 py-0.5 font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2 max-lg:px-2 max-lg:py-1.5"
                >
                    Undo
                </button>
            </span>
        );

    const cell = (column: ColumnId, r: StockRow): ReactNode => {
        switch (column) {
            case "status":
                return <StockStatusBadge status={r.status} />;
            case "incoming":
                return <Incoming row={r} location={location} linkOrders={seesOrders} />;
            case "par": {
                const base = baseById.get(r.item.id);
                const was = base && base.level.par !== r.level.par ? (base.level.par ?? "none") : undefined;
                return (
                    <>
                        {was !== undefined && (
                            <span className="mr-1.5 text-xs text-tertiary line-through" title={`Changed this session. Was ${was}.`}>
                                {was}
                            </span>
                        )}
                        {parText(r) ?? <span className="text-quaternary">–</span>}
                    </>
                );
            }
            case "cover":
                return coverText(r) ?? <span className="text-quaternary">–</span>;
            case "area":
                return r.level.area;
            case "vendor":
                return r.vendor.name;
            case "category":
                return r.item.category;
            case "reorder-point":
                return r.forecast && !r.level.fillLevel ? r.forecast.reorderPoint : <span className="text-quaternary">–</span>;
            case "suggested": {
                const qty = r.level.parRule === "paused" ? 0 : (r.forecast?.suggestedOrderQty ?? 0);
                return qty > 0 ? `${qty} ${unitWord(qty, r.item.unit)}` : <span className="text-quaternary">–</span>;
            }
            case "counted":
                return counted(r);
            case "value":
                return formatCurrency(r.value);
            case "abc":
                return <AbcBadge abc={r.item.abc} />;
        }
    };

    // The whole row opens the item, like a link. The name is the real link (keyboard and screen
    // readers use it); clicks on the checkbox, the quantity or the order numbers are left alone.
    const openRow = (event: MouseEvent<HTMLTableRowElement>) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest("a, button, input, label")) return;
        event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
    };

    const selectBox = (id: string, name: string) => (
        // Browsers do not pass a Shift-click on a label through to its checkbox, so the label handles the range itself.
        <label
            className="flex size-9 cursor-pointer items-center justify-center select-none"
            onMouseDown={(event) => {
                // Keeps Shift-click from selecting the text between the two rows.
                if (event.shiftKey) event.preventDefault();
            }}
            onClick={(event) => {
                if (!event.shiftKey) return;
                event.preventDefault();
                toggle(id, true);
            }}
        >
            <input type="checkbox" className="peer sr-only" aria-label={`Select ${name}`} checked={selected.has(id)} onChange={() => toggle(id)} />
            <CheckboxBase
                size="md"
                isSelected={selected.has(id)}
                className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
            />
        </label>
    );

    const summaryText = narrowed ? `${filtered.length.toLocaleString("en-US")} of ${plural(rows.length, "supply", "supplies")}` : undefined;

    return (
        <div className={cx("flex flex-col gap-3", !isDesktop && someSelected && "pb-28")}>
            <DataTableToolbar
                label={`supplies at ${locationName(location)}`}
                views={views}
                view={view}
                onViewChange={(id) => {
                    setView(id as ViewId);
                    relist();
                }}
                query={query}
                onQueryChange={(value) => {
                    setQuery(value);
                    relist();
                }}
                searchPlaceholder="Search by name, brand or barcode"
                compactSearchPlaceholder="Search supplies"
                filters={filterDefs}
                activeFilters={filters}
                onFiltersChange={(next) => {
                    setFilters(next);
                    relist();
                }}
                sorts={SORTS}
                sort={sort}
                onSortChange={(id) => {
                    setSort(id as SortId);
                    setListedWith(overrides);
                }}
                columns={toolbarColumns}
                visibleColumns={shownColumns}
                onColumnsChange={setShownColumns}
                summary={isDesktop ? summaryText : undefined}
                defaultColumnsOpen={initialColumnsOpen}
            />

            {!isDesktop && filtered.length > 0 && (
                <div className="-my-1 flex items-center justify-between gap-3 pl-1">
                    <p className="text-sm text-tertiary" aria-live="polite">
                        {summaryText ?? plural(rows.length, "supply", "supplies")}
                    </p>
                    <Button
                        color="link-color"
                        size="sm"
                        className="min-h-11 px-2"
                        data-testid="select-mode"
                        onClick={() => {
                            if (selectMode) clearSelection();
                            setSelectMode(!selectMode);
                        }}
                    >
                        {selectMode ? "Done" : "Select"}
                    </Button>
                </div>
            )}

            {filtered.length === 0 ? (
                <NothingHere
                    title="No supplies match"
                    action={
                        <Button color="secondary" size="md" onClick={clearAll}>
                            Clear search and filters
                        </Button>
                    }
                >
                    Nothing at {locationName(location)} fits this view, search and these filters.
                </NothingHere>
            ) : isDesktop ? (
                <div className="relative rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
                    {someSelected && (
                        // Zero-height sticky holder: the bar lies over the column headers and follows the page when it scrolls.
                        <div className="sticky top-0 z-20 h-0">
                            <BulkActionBar
                                count={selected.size}
                                totalMatching={filtered.length}
                                onSelectAll={() => setSelected(new Set(filtered.map((r) => r.item.id)))}
                                onClear={clearSelection}
                                onToggleAll={toggleAllShown}
                                actions={actions}
                                className="absolute inset-x-0 top-0 rounded-t-xl border-b border-secondary shadow-xs"
                            />
                        </div>
                    )}
                    <div className="overflow-x-auto rounded-xl">
                        <table className="w-full text-sm" aria-label={`Supplies at ${locationName(location)}`}>
                            <thead>
                                <tr className="h-10 bg-secondary">
                                    <th scope="col" className="w-12 border-b border-secondary py-0 pr-0 pl-3 text-left">
                                        <label className="flex size-9 cursor-pointer items-center justify-center">
                                            <input
                                                type="checkbox"
                                                className="peer sr-only"
                                                aria-label={allShownSelected ? "Clear selection" : "Select the supplies shown"}
                                                checked={allShownSelected}
                                                onChange={toggleAllShown}
                                            />
                                            <CheckboxBase
                                                size="md"
                                                isSelected={allShownSelected}
                                                isIndeterminate={someSelected && !allShownSelected}
                                                className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
                                            />
                                        </label>
                                    </th>
                                    <th scope="col" className="w-full border-b border-secondary px-3 text-left">
                                        <HeaderLabel label="Item" />
                                    </th>
                                    {showStatus && (
                                        <th scope="col" className="border-b border-secondary px-3 text-left">
                                            <HeaderLabel label="Status" />
                                        </th>
                                    )}
                                    <th scope="col" className="border-b border-secondary px-3 text-left">
                                        <HeaderLabel label="On hand" tooltip={canAdjust ? `${ON_HAND_TIP} Click a number to change it.` : ON_HAND_TIP} />
                                    </th>
                                    {afterOnHand.map((c) => (
                                        <th
                                            key={c.id}
                                            scope="col"
                                            className={cx("border-b border-secondary px-3 last:pr-5", c.align === "right" ? "text-right" : "text-left")}
                                        >
                                            <span className="inline-flex items-center gap-1.5">
                                                <HeaderLabel label={c.label} tooltip={c.tooltip} />
                                                {c.id === "value" && <SampleBadge />}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {page.map((r) => {
                                    const isSelected = selected.has(r.item.id);
                                    return (
                                        <tr
                                            key={r.item.id}
                                            data-row={r.item.id}
                                            data-edited={overrides[r.item.id] ? true : undefined}
                                            onClick={openRow}
                                            className={cx(
                                                "h-12 cursor-pointer transition duration-100 ease-linear [&:not(:last-child)>td]:border-b [&>td]:border-secondary",
                                                isSelected ? "bg-brand-primary_alt" : "hover:bg-primary_hover",
                                            )}
                                        >
                                            <td className="py-0 pr-0 pl-3">{selectBox(r.item.id, r.item.name)}</td>
                                            <td className="w-full max-w-0 px-3 py-1.5">
                                                <div className="flex items-center gap-3">
                                                    <ItemThumb item={r.item} size="sm" />
                                                    <a
                                                        data-row-link
                                                        href={ROUTES.item(r.item.id)}
                                                        className="min-w-0 truncate rounded-xs text-sm font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                                                    >
                                                        {r.item.name}
                                                    </a>
                                                    {r.level.shelf && <ShelfChip shelf={r.level.shelf} />}
                                                </div>
                                            </td>
                                            {showStatus && <td className="px-3 whitespace-nowrap">{cell("status", r)}</td>}
                                            <td className="px-3 whitespace-nowrap">
                                                <span className="relative inline-flex items-center">
                                                    {quantity(r, "table")}
                                                    {savedPill(r.item.id, "absolute top-1/2 left-full z-10 ml-1 -translate-y-1/2")}
                                                </span>
                                            </td>
                                            {afterOnHand.map((c) => (
                                                <td
                                                    key={c.id}
                                                    className={cx(
                                                        "px-3 whitespace-nowrap text-secondary last:pr-5",
                                                        c.align === "right" && "text-right tabular-nums",
                                                    )}
                                                >
                                                    {cell(c.id, r)}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <Card padded={false}>
                    <ul className="divide-y divide-secondary">
                        {page.map((r) => {
                            const isSelected = selected.has(r.item.id);
                            const body = (
                                <>
                                    {selectMode && <CheckboxBase size="md" isSelected={isSelected} />}
                                    <ItemThumb item={r.item} />
                                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                                        <span className="line-clamp-2 text-sm font-semibold text-primary">{r.item.name}</span>
                                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            {r.level.shelf && <ShelfChip shelf={r.level.shelf} />}
                                            <StockStatusBadge status={r.status} />
                                        </span>
                                    </span>
                                </>
                            );
                            const rowClass =
                                "flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 pl-3 text-left outline-focus-ring select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2";
                            const startPress = () => {
                                if (selectMode) return;
                                pressTimer.current = setTimeout(() => {
                                    swallowUntil.current = Date.now() + 700;
                                    setSelectMode(true);
                                    setSelected(new Set([r.item.id]));
                                    anchor.current = r.item.id;
                                }, 500);
                            };
                            const endPress = () => {
                                if (pressTimer.current) clearTimeout(pressTimer.current);
                                pressTimer.current = null;
                            };
                            return (
                                <li key={r.item.id} data-row={r.item.id} className={cx("flex items-stretch", isSelected && "bg-brand-primary_alt")}>
                                    {selectMode ? (
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={isSelected}
                                            onClick={() => {
                                                // The finger lifting after a long press is not a second tap.
                                                if (Date.now() > swallowUntil.current) toggle(r.item.id);
                                            }}
                                            className={cx(rowClass, "cursor-pointer")}
                                        >
                                            {body}
                                        </button>
                                    ) : (
                                        <a
                                            href={ROUTES.item(r.item.id)}
                                            className={rowClass}
                                            onPointerDown={startPress}
                                            onPointerUp={endPress}
                                            onPointerLeave={endPress}
                                            onPointerCancel={endPress}
                                            onContextMenu={(event) => event.preventDefault()}
                                            onClick={(event) => {
                                                if (Date.now() < swallowUntil.current) event.preventDefault();
                                            }}
                                        >
                                            {body}
                                        </a>
                                    )}
                                    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 py-1.5 pr-2">
                                        {quantity(r, "card")}
                                        {savedPill(r.item.id, "mr-1")}
                                        {saved?.id !== r.item.id && (
                                            <span className="pr-2">
                                                <Incoming row={r} location={location} linkOrders={seesOrders} compact />
                                            </span>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            )}

            {filtered.length > 0 && (
                <div className="flex flex-col items-center gap-2">
                    {filtered.length > page.length && isDesktop && (
                        <p className="text-sm text-tertiary">
                            Showing {page.length} of {filtered.length.toLocaleString("en-US")}
                        </p>
                    )}
                    <ShowMore step={SUPPLY_PAGE} remaining={filtered.length - page.length} onPress={() => setVisible((v) => v + SUPPLY_PAGE)} />
                </div>
            )}

            {!isDesktop && (
                <BulkActionBar
                    count={selected.size}
                    totalMatching={filtered.length}
                    onSelectAll={() => setSelected(new Set(filtered.map((r) => r.item.id)))}
                    onClear={() => {
                        clearSelection();
                        setSelectMode(false);
                    }}
                    actions={actions}
                />
            )}

            <AddToOrderDialog rows={selectedRows} location={location} isOpen={dialog === "order"} onClose={() => setDialog(null)} />
            <CountTheseDialog rows={selectedRows} location={location} user={user} isOpen={dialog === "count"} onClose={() => setDialog(null)} />
            <SetParDialog rows={selectedRows} location={location} isOpen={dialog === "par"} onClose={() => setDialog(null)} onApply={applyPar} />
            <ChangeVendorDialog
                rows={selectedRows}
                location={location}
                isOpen={dialog === "vendor"}
                onClose={() => setDialog(null)}
                onApply={(vendorId) =>
                    patchMany(
                        selectedRows,
                        (row) => (row.vendor.id === vendorId ? undefined : { vendorId }),
                        (count) => `Vendor changed to ${vendorById(vendorId).name} for ${plural(count, "item")}.`,
                    )
                }
            />
            <MoveDialog
                rows={selectedRows}
                areas={areas}
                location={location}
                isOpen={dialog === "move"}
                onClose={() => setDialog(null)}
                onApply={(area, shelf) =>
                    patchMany(
                        selectedRows,
                        () => ({ area, ...(shelf !== undefined ? { shelf } : {}) }),
                        (count) => `${plural(count, "item")} moved to ${area}${shelf ? `, shelf ${shelf}` : ""}.`,
                    )
                }
            />
            <BulkQuantityEditor
                rows={selectedRows.map((r) => ({
                    id: r.item.id,
                    item: r.item,
                    shelf: r.level.shelf || r.level.area,
                    onHand: r.level.onHand,
                    fillLevel: r.level.fillLevel,
                    par: r.level.par,
                    paused: r.level.parRule === "paused",
                }))}
                isOpen={dialog === "edit" && selectedRows.length > 0}
                onOpenChange={(open) => !open && setDialog(null)}
                onSave={saveBulk}
            />
        </div>
    );
};
