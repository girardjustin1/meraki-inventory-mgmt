"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronSelectorVertical, Plus, SearchLg, XClose } from "@untitledui/icons";
import {
    Button as AriaButton,
    Checkbox as AriaCheckbox,
    Dialog as AriaDialog,
    DialogTrigger as AriaDialogTrigger,
    Heading as AriaHeading,
    ListBox as AriaListBox,
    ListBoxItem as AriaListBoxItem,
    Modal as AriaModal,
    ModalOverlay as AriaModalOverlay,
    Popover as AriaPopover,
    Select as AriaSelect,
    SelectValue as AriaSelectValue,
} from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { SampleBadge } from "@/components/meraki/status-badges";
import { getItem, getStock, stockRows, vendorById } from "@/data/inventory";
import type { StockRow } from "@/data/inventory";
import { POLISH_LINE_LABEL } from "@/data/labels";
import type { Item, LocationId, PolishLine, StockStatus, StockVariant, VariantId, VendorId } from "@/data/types";
import type { SearchDoc } from "@/engine/search";
import { scoreDoc } from "@/engine/search";
import { formatCount, formatQty } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

/** One thing picked: a product, or one finish of a polish colour. */
export interface PickerSelection {
    itemId: string;
    /** Set when the product is stocked in more than one finish and this one was ticked. */
    variant?: VariantId;
}

export interface ProductPickerProps {
    /** Whose shelves the "On hand" column reads from. */
    location: LocationId;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    /** Called with everything ticked, in the order it was ticked. The picker closes itself afterwards. */
    onAdd: (selection: PickerSelection[]) => void;
    /**
     * Already on the list, so shown but not selectable. An item id rules out the whole product;
     * `selectionKey({ itemId, variant })` rules out one finish.
     */
    excludeIds?: string[];
    title?: string;
    confirmLabel?: string;
    /** Start with only this vendor's products. A chip in the filter row turns that off. */
    vendorId?: VendorId;
    /**
     * Keep the list to `vendorId` with no way out. For a purchase order, which goes to one vendor:
     * another vendor's products belong on their own order.
     */
    lockVendor?: boolean;
    /** Search text to open on (for stories and deep links). */
    initialQuery?: string;
    /** Item ids whose finishes start expanded (for stories). */
    initialExpanded?: string[];
    /** Ticked on opening (for stories). */
    initialSelection?: PickerSelection[];
}

/** The stable key for a selection: "pol-opi-wh02" or "pol-opi-wh02:gel". */
export const selectionKey = ({ itemId, variant }: PickerSelection) => (variant ? `${itemId}:${variant}` : itemId);

/**
 * The catalogue item a selection should be ordered as, with the finish written out.
 * Dip powder is its own catalogue item (its own SKU and cost), so a "dip" pick resolves to that item.
 */
export const resolveSelection = (pick: PickerSelection, location: LocationId): { item: Item; variantLabel?: string } | undefined => {
    const variant = pick.variant ? getStock(pick.itemId, location)?.variants?.find((v) => v.id === pick.variant) : undefined;
    const item = getItem(variant?.linkedItemId ?? pick.itemId);
    if (!item) return undefined;
    return { item, variantLabel: variant?.label ?? (pick.variant ? pick.variant.charAt(0).toUpperCase() + pick.variant.slice(1) : undefined) };
};

// ------------------------------------------------------------------------------------ data

const FIRST_PAGE = 30;
/** The catalogue has about 1,750 products. Past this the list asks for a search or a filter. */
const MAX_SHOWN = 60;

type SearchBy = "all" | "name" | "colour" | "sku" | "barcode";
const SEARCH_BY: { id: SearchBy; label: string; placeholder: string }[] = [
    { id: "all", label: "All", placeholder: "Search items" },
    { id: "name", label: "Name", placeholder: "Search by name" },
    { id: "colour", label: "Colour code", placeholder: "Search by colour code, e.g. WH02" },
    { id: "sku", label: "SKU", placeholder: "Search by SKU" },
    { id: "barcode", label: "Barcode", placeholder: "Search by barcode number" },
];

type FilterId = "vendor" | "category" | "area" | "line";
const FILTERS: { id: FilterId; label: string }[] = [
    { id: "vendor", label: "Vendor" },
    { id: "category", label: "Category" },
    { id: "area", label: "Area" },
    { id: "line", label: "Polish line" },
];

/** With nothing typed: supplies before the 1,600 polish colours, and within each what most needs ordering first. */
const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, over: 2, unknown: 2, paused: 3 };
const KIND_RANK: Record<Item["kind"], number> = { supply: 0, tips: 1, polish: 2 };
const browseRank = (r: StockRow) => KIND_RANK[r.item.kind] * 10 + STATUS_RANK[r.status];

const filterValue = (row: StockRow, id: FilterId): string | undefined =>
    id === "vendor" ? row.vendor.id : id === "category" ? row.item.category : id === "area" ? row.level.area : row.item.line;

const filterValueLabel = (id: FilterId, value: string) =>
    id === "vendor" ? vendorById(value as VendorId).name : id === "line" ? (POLISH_LINE_LABEL[value as PolishLine] ?? value) : value;

const docFor = ({ item, vendor, level }: StockRow, by: SearchBy): SearchDoc => {
    const base = { id: item.id, kind: "supply" as const, href: "" };
    if (by === "name") return { ...base, title: item.name, subtitle: item.brand };
    if (by === "colour") return { ...base, title: "", codes: item.colorCode ? [item.colorCode] : [] };
    if (by === "sku") return { ...base, title: "", codes: item.sku ? [item.sku] : [] };
    if (by === "barcode") return { ...base, title: "", codes: item.upc ? [item.upc] : [] };
    return {
        ...base,
        title: item.name,
        subtitle: [item.brand, item.category].filter(Boolean).join(" "),
        keywords: [vendor.name, level.area, level.shelf, item.line ? POLISH_LINE_LABEL[item.line] : ""].join(" "),
        codes: [item.colorCode, item.sku, item.upc].filter((c): c is string => Boolean(c)),
    };
};

/**
 * Everything that can be picked at a location. A dip powder that is linked to its colour is left
 * out as a row of its own: it is offered as the "Dip" finish of that colour, so a colour reads as
 * one product.
 */
const pickable = (location: LocationId): StockRow[] => {
    const rows = stockRows(location);
    const linked = new Set(rows.flatMap((r) => (r.level.variants ?? []).map((v) => v.linkedItemId)).filter(Boolean));
    return rows.filter((r) => !r.item.discontinued && !linked.has(r.item.id));
};

// ------------------------------------------------------------------------------------ pieces

const rowBase = "flex min-h-12 cursor-pointer items-center gap-3 outline-hidden sm:min-h-11";

const Tick = ({ state }: { state: { isSelected: boolean; isIndeterminate: boolean; isDisabled: boolean; isFocusVisible: boolean } }) => (
    <CheckboxBase
        size="md"
        isSelected={state.isSelected}
        isIndeterminate={state.isIndeterminate}
        isDisabled={state.isDisabled}
        isFocusVisible={state.isFocusVisible}
    />
);

const chipClass =
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 sm:min-h-8";

interface AddFilterProps {
    /** Filters not applied yet, each with the values found in the catalogue. */
    available: { id: FilterId; label: string; values: { value: string; label: string; count: number }[] }[];
    onPick: (id: FilterId, value: string) => void;
}

/** "Add filter": pick what to filter by, then the value. Two short lists in one popover, so it works the same on a phone. */
const AddFilter = ({ available, onPick }: AddFilterProps) => {
    const [step, setStep] = useState<FilterId | null>(null);
    const current = available.find((f) => f.id === step);
    const option =
        "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-sm font-medium text-secondary outline-focus-ring data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focused:bg-primary_hover data-hovered:bg-primary_hover sm:min-h-9";
    return (
        <AriaDialogTrigger onOpenChange={(open) => !open && setStep(null)}>
            <AriaButton
                data-testid="picker-add-filter"
                className={cx(chipClass, "border border-dashed border-primary bg-primary text-secondary ring-0 hover:bg-primary_hover")}
            >
                Add filter
                <Plus className="size-4 text-fg-quaternary" aria-hidden="true" />
            </AriaButton>
            <AriaPopover
                placement="bottom start"
                offset={6}
                className={({ isEntering, isExiting }) =>
                    cx(
                        "w-64 max-w-[calc(100vw-2rem)] origin-(--trigger-anchor-point) rounded-lg bg-primary shadow-lg ring-1 ring-secondary_alt will-change-transform",
                        isEntering && "duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5",
                        isExiting && "duration-100 ease-in animate-out fade-out",
                    )
                }
            >
                <AriaDialog aria-label="Add a filter" className="outline-hidden">
                    {({ close }) =>
                        current ? (
                            <div className="flex flex-col">
                                <div className="flex items-center gap-1 border-b border-secondary p-1.5">
                                    <AriaButton
                                        aria-label="Back to the list of filters"
                                        onPress={() => setStep(null)}
                                        className="flex size-9 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                                    >
                                        <ArrowLeft className="size-4" aria-hidden="true" />
                                    </AriaButton>
                                    <span className="text-sm font-semibold text-primary">{current.label}</span>
                                </div>
                                <AriaListBox
                                    key={current.id}
                                    aria-label={current.label}
                                    autoFocus
                                    onAction={(key) => {
                                        onPick(current.id, String(key));
                                        close();
                                    }}
                                    className="max-h-64 overflow-y-auto p-1.5 outline-hidden"
                                >
                                    {current.values.map((v) => (
                                        <AriaListBoxItem key={v.value} id={v.value} textValue={v.label} className={option}>
                                            <span className="truncate">{v.label}</span>
                                            <span className="shrink-0 text-xs font-normal text-tertiary tabular-nums">{v.count}</span>
                                        </AriaListBoxItem>
                                    ))}
                                </AriaListBox>
                            </div>
                        ) : (
                            <AriaListBox aria-label="Filter by" autoFocus onAction={(key) => setStep(key as FilterId)} className="p-1.5 outline-hidden">
                                {available.map((f) => (
                                    <AriaListBoxItem key={f.id} id={f.id} textValue={f.label} className={option}>
                                        {f.label}
                                        <ChevronDown className="size-4 -rotate-90 text-fg-quaternary" aria-hidden="true" />
                                    </AriaListBoxItem>
                                ))}
                            </AriaListBox>
                        )
                    }
                </AriaDialog>
            </AriaPopover>
        </AriaDialogTrigger>
    );
};

// ------------------------------------------------------------------------------------ body

type BodyProps = Omit<ProductPickerProps, "isOpen" | "onOpenChange"> & { close: () => void };

const PickerBody = ({
    location,
    onAdd,
    excludeIds,
    title = "Add items",
    confirmLabel = "Add to order",
    vendorId,
    lockVendor = false,
    initialQuery = "",
    initialExpanded,
    initialSelection,
    close,
}: BodyProps) => {
    const isWide = useBreakpoint("sm");
    const rows = useMemo(() => pickable(location), [location]);
    const [query, setQuery] = useState(initialQuery);
    const [by, setBy] = useState<SearchBy>("all");
    const [onlyVendor, setOnlyVendor] = useState(Boolean(vendorId));
    const [filters, setFilters] = useState<Partial<Record<FilterId, string>>>({});
    const [expanded, setExpanded] = useState<string[]>(initialExpanded ?? []);
    const [picked, setPicked] = useState<string[]>(() => (initialSelection ?? []).map(selectionKey));
    const [limit, setLimit] = useState(FIRST_PAGE);

    const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);
    const pickedSet = new Set(picked);
    const q = query.trim();
    const locked = lockVendor && Boolean(vendorId);
    const vendorFilter = onlyVendor || locked ? vendorId : (filters.vendor as VendorId | undefined);

    const passesFilters = (r: StockRow, withVendor: boolean) =>
        (!withVendor || !vendorFilter || r.vendor.id === vendorFilter) &&
        (["category", "area", "line"] as const).every((id) => !filters[id] || filterValue(r, id) === filters[id]);

    const { matches, elsewhere } = useMemo(() => {
        const scored = rows
            .filter((r) => passesFilters(r, false))
            .map((r) => ({ row: r, score: q ? scoreDoc(docFor(r, by), q) : 1 }))
            .filter((m) => m.score > 0);
        const inVendor = scored.filter((m) => !vendorFilter || m.row.vendor.id === vendorFilter);
        inVendor.sort((a, b) =>
            q
                ? b.score - a.score || a.row.item.name.localeCompare(b.row.item.name)
                : browseRank(a.row) - browseRank(b.row) || a.row.item.name.localeCompare(b.row.item.name),
        );
        return { matches: inVendor.map((m) => m.row), elsewhere: scored.length - inVendor.length };
        // passesFilters reads only `filters`, which is listed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, q, by, vendorFilter, filters]);

    const shown = matches.slice(0, Math.min(limit, MAX_SHOWN));
    const anySample = shown.some((r) => r.level.isSample);

    // ---- selection -------------------------------------------------------------------------
    /** Finishes that get their own row. A colour stocked in a single finish is one plain row that carries that finish. */
    const finishesOf = (r: StockRow): StockVariant[] => ((r.level.variants?.length ?? 0) > 1 ? (r.level.variants as StockVariant[]) : []);
    const soleVariant = (r: StockRow) => (r.level.variants?.length === 1 ? r.level.variants[0]?.id : undefined);
    const isExcluded = (r: StockRow, v?: StockVariant) =>
        excluded.has(r.item.id) ||
        (v ? excluded.has(selectionKey({ itemId: r.item.id, variant: v.id })) || Boolean(v.linkedItemId && excluded.has(v.linkedItemId)) : false);

    const toggle = (keys: string[], on: boolean) => {
        setPicked((prev) => (on ? [...prev, ...keys.filter((k) => !prev.includes(k))] : prev.filter((k) => !keys.includes(k))));
    };

    const submit = () => {
        onAdd(
            picked.map((key) => {
                const [itemId = key, variant] = key.split(":");
                return variant ? { itemId, variant: variant as VariantId } : { itemId };
            }),
        );
        close();
    };

    // ---- filters ---------------------------------------------------------------------------
    const availableFilters = FILTERS.filter((f) => !filters[f.id] && !(f.id === "vendor" && (onlyVendor || locked))).map((f) => {
        const counts = new Map<string, number>();
        for (const r of rows) {
            const value = filterValue(r, f.id);
            if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return {
            ...f,
            values: [...counts.entries()].map(([value, count]) => ({ value, label: filterValueLabel(f.id, value), count })).sort((a, b) => b.count - a.count),
        };
    });
    const activeFilters = FILTERS.filter((f) => filters[f.id]);
    const narrowed = activeFilters.length > 0 || onlyVendor || q.length > 0;
    const resetPaging = () => setLimit(FIRST_PAGE);

    const searchBy = SEARCH_BY.find((s) => s.id === by) ?? (SEARCH_BY[0] as (typeof SEARCH_BY)[number]);
    const onHandCell = "w-20 shrink-0 text-right text-sm text-secondary tabular-nums sm:w-24";

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Title */}
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 sm:px-5 sm:pt-4">
                <AriaHeading slot="title" className="text-lg font-semibold text-primary">
                    {title}
                </AriaHeading>
                <AriaButton
                    aria-label="Close"
                    onPress={close}
                    className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 sm:size-9"
                >
                    <XClose className="size-5" aria-hidden="true" />
                </AriaButton>
            </div>

            {/* Search and filters */}
            <div className="flex flex-col gap-2.5 border-b border-secondary px-4 pt-1 pb-3 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                        aria-label={searchBy.placeholder}
                        icon={SearchLg}
                        size="md"
                        placeholder={searchBy.placeholder}
                        value={query}
                        // Search comes first on a wide screen. On a phone the keyboard would cover the list, so it waits for a tap.
                        autoFocus={isWide}
                        onChange={(value) => {
                            setQuery(value);
                            resetPaging();
                        }}
                        className="min-w-0 flex-1"
                    />
                    <AriaSelect
                        aria-label="Search by"
                        selectedKey={by}
                        onSelectionChange={(key) => {
                            setBy(key as SearchBy);
                            resetPaging();
                        }}
                        className="shrink-0 sm:w-48"
                    >
                        <AriaButton className="flex h-11 w-full cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-md shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset focus-visible:ring-2 focus-visible:ring-brand sm:h-10">
                            <span className="text-tertiary">Search by</span>
                            <AriaSelectValue className="truncate font-medium text-primary" />
                            <ChevronSelectorVertical className="ml-auto size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        </AriaButton>
                        <AriaPopover
                            offset={4}
                            className="w-(--trigger-width) rounded-lg bg-primary shadow-lg ring-1 ring-secondary_alt data-entering:duration-150 data-entering:ease-out data-entering:animate-in data-entering:fade-in"
                        >
                            <AriaListBox className="p-1.5 outline-hidden">
                                {SEARCH_BY.map((s) => (
                                    <AriaListBoxItem
                                        key={s.id}
                                        id={s.id}
                                        textValue={s.label}
                                        className="flex min-h-11 cursor-pointer items-center rounded-md px-2.5 text-sm font-medium text-secondary outline-hidden data-focused:bg-primary_hover data-hovered:bg-primary_hover data-selected:text-brand-secondary sm:min-h-9"
                                    >
                                        {s.label}
                                    </AriaListBoxItem>
                                ))}
                            </AriaListBox>
                        </AriaPopover>
                    </AriaSelect>
                </div>

                <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                    {vendorId && locked && (
                        <span
                            className={cx(chipClass, "cursor-default bg-brand-primary_alt text-brand-secondary ring-brand")}
                            data-testid="picker-vendor-locked"
                        >
                            {vendorById(vendorId).name} only
                        </span>
                    )}
                    {vendorId && !locked && (
                        <button
                            type="button"
                            aria-pressed={onlyVendor}
                            onClick={() => {
                                setOnlyVendor((v) => !v);
                                setFilters((f) => ({ ...f, vendor: undefined }));
                                resetPaging();
                            }}
                            className={cx(
                                chipClass,
                                onlyVendor
                                    ? "bg-brand-primary_alt text-brand-secondary ring-brand"
                                    : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                            )}
                        >
                            Only {vendorById(vendorId).name}
                        </button>
                    )}
                    {activeFilters.map((f) => (
                        <span key={f.id} className={cx(chipClass, "cursor-default bg-secondary pr-1 text-secondary ring-secondary")}>
                            <span>
                                <span className="text-tertiary">{f.label}:</span> {filterValueLabel(f.id, filters[f.id] as string)}
                            </span>
                            <button
                                type="button"
                                aria-label={`Remove the ${f.label.toLowerCase()} filter`}
                                onClick={() => {
                                    setFilters((prev) => ({ ...prev, [f.id]: undefined }));
                                    resetPaging();
                                }}
                                className="flex size-9 cursor-pointer items-center justify-center rounded-full text-fg-quaternary outline-focus-ring hover:bg-secondary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 sm:size-6"
                            >
                                <XClose className="size-4" aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                    {availableFilters.length > 0 && (
                        <AddFilter
                            available={availableFilters}
                            onPick={(id, value) => {
                                setFilters((prev) => ({ ...prev, [id]: value }));
                                resetPaging();
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Column header */}
            <div className="flex items-center justify-between gap-3 border-b border-secondary bg-secondary px-4 py-2 text-xs font-semibold text-tertiary sm:px-5">
                <span>Item</span>
                <span className="flex items-center gap-1.5">
                    On hand
                    {anySample && <SampleBadge />}
                </span>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="picker-list">
                {shown.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                        <p className="text-sm font-semibold text-primary">{q ? <>Nothing matches &ldquo;{q}&rdquo;</> : "Nothing to show"}</p>
                        <p className="max-w-sm text-sm text-tertiary">
                            {elsewhere > 0 && vendorFilter
                                ? `${elsewhere} item${elsewhere === 1 ? "" : "s"} from other vendors ${elsewhere === 1 ? "matches" : "match"}.${
                                      locked && vendorId
                                          ? ` This order goes to ${vendorById(vendorId).name}, so ${elsewhere === 1 ? "it belongs" : "they belong"} on a separate order.`
                                          : ""
                                  }`
                                : by !== "all"
                                  ? `Searching by ${searchBy.label.toLowerCase()} only. Try "All", or check the spelling.`
                                  : "Check the spelling, or try the colour code or SKU."}
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {elsewhere > 0 && vendorFilter && !locked && (
                                <Button
                                    color="secondary"
                                    size="sm"
                                    className="max-sm:min-h-11"
                                    data-testid="picker-all-vendors"
                                    onClick={() => {
                                        setOnlyVendor(false);
                                        setFilters((f) => ({ ...f, vendor: undefined }));
                                        resetPaging();
                                    }}
                                >
                                    Show all vendors
                                </Button>
                            )}
                            {activeFilters.some((f) => f.id !== "vendor") && (
                                <Button
                                    color="secondary"
                                    size="sm"
                                    className="max-sm:min-h-11"
                                    onClick={() => {
                                        setFilters({});
                                        resetPaging();
                                    }}
                                >
                                    Clear filters
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    <ul className="divide-y divide-secondary">
                        {shown.map((r) => {
                            const finishes = finishesOf(r);
                            const code = r.item.colorCode ?? r.item.sku;
                            const label = (
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="truncate text-sm font-medium text-primary">{r.item.name}</span>
                                    {code && (
                                        <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-tertiary ring-1 ring-secondary ring-inset">
                                            {code}
                                        </span>
                                    )}
                                    {r.item.line && (
                                        <span className="hidden shrink-0 truncate text-xs text-tertiary sm:inline">{POLISH_LINE_LABEL[r.item.line]}</span>
                                    )}
                                </span>
                            );

                            if (finishes.length === 0) {
                                const key = selectionKey({ itemId: r.item.id, variant: soleVariant(r) });
                                const off = isExcluded(r, r.level.variants?.[0]);
                                return (
                                    <li key={r.item.id}>
                                        <AriaCheckbox
                                            isSelected={pickedSet.has(key)}
                                            isDisabled={off}
                                            onChange={(on) => toggle([key], on)}
                                            className={cx(rowBase, "px-4 sm:px-5", off ? "cursor-not-allowed" : "hover:bg-primary_hover")}
                                        >
                                            {(state) => (
                                                <>
                                                    <Tick state={state} />
                                                    <ItemThumb item={r.item} size="sm" className={cx(off && "opacity-60")} />
                                                    {label}
                                                    {off && (
                                                        <Badge type="modern" color="gray" size="sm">
                                                            Already added
                                                        </Badge>
                                                    )}
                                                    <span className={cx(onHandCell, off && "max-sm:hidden")}>{formatQty(r.level, r.item.unit)}</span>
                                                </>
                                            )}
                                        </AriaCheckbox>
                                    </li>
                                );
                            }

                            const open = finishes.filter((v) => !isExcluded(r, v));
                            const keys = open.map((v) => selectionKey({ itemId: r.item.id, variant: v.id }));
                            const chosen = keys.filter((k) => pickedSet.has(k)).length;
                            const isOpen = expanded.includes(r.item.id);
                            const listId = `finishes-${r.item.id}`;
                            return (
                                <li key={r.item.id} data-product={r.item.id}>
                                    <div className="flex items-center hover:bg-primary_hover">
                                        <AriaCheckbox
                                            isSelected={keys.length > 0 && chosen === keys.length}
                                            isIndeterminate={chosen > 0 && chosen < keys.length}
                                            isDisabled={keys.length === 0}
                                            onChange={(on) => {
                                                toggle(keys, on);
                                                // Ticking a colour ticks every finish: open it so the person sees what that added.
                                                if (on) setExpanded((prev) => (prev.includes(r.item.id) ? prev : [...prev, r.item.id]));
                                            }}
                                            className={cx(rowBase, "min-w-0 flex-1 pl-4 sm:pl-5")}
                                        >
                                            {(state) => (
                                                <>
                                                    <Tick state={state} />
                                                    <ItemThumb item={r.item} size="sm" />
                                                    {label}
                                                </>
                                            )}
                                        </AriaCheckbox>
                                        <button
                                            type="button"
                                            aria-expanded={isOpen}
                                            aria-controls={listId}
                                            aria-label={`${isOpen ? "Hide" : "Show"} the ${finishes.length} finishes of ${r.item.name}`}
                                            data-testid="picker-expand"
                                            onClick={() => setExpanded((prev) => (isOpen ? prev.filter((id) => id !== r.item.id) : [...prev, r.item.id]))}
                                            className="flex min-h-12 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-2 text-xs font-medium whitespace-nowrap text-tertiary outline-focus-ring hover:text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 sm:min-h-11"
                                        >
                                            <span className="max-sm:sr-only">{finishes.length} finishes</span>
                                            <ChevronDown
                                                className={cx("size-4 transition duration-100 ease-linear", isOpen && "rotate-180")}
                                                aria-hidden="true"
                                            />
                                        </button>
                                        <span className={cx(onHandCell, "box-content pr-4 sm:pr-5")}>{formatQty(r.level, r.item.unit)}</span>
                                    </div>
                                    {isOpen && (
                                        <ul
                                            id={listId}
                                            aria-label={`Finishes of ${r.item.name}`}
                                            className="bg-secondary_subtle divide-y divide-secondary border-t border-secondary"
                                        >
                                            {finishes.map((v) => {
                                                const key = selectionKey({ itemId: r.item.id, variant: v.id });
                                                const off = isExcluded(r, v);
                                                return (
                                                    <li key={v.id}>
                                                        <AriaCheckbox
                                                            isSelected={pickedSet.has(key)}
                                                            isDisabled={off}
                                                            onChange={(on) => toggle([key], on)}
                                                            data-variant={v.id}
                                                            className={cx(
                                                                rowBase,
                                                                "pr-4 pl-12 sm:pr-5 sm:pl-14",
                                                                off ? "cursor-not-allowed" : "hover:bg-primary_hover",
                                                            )}
                                                        >
                                                            {(state) => (
                                                                <>
                                                                    <Tick state={state} />
                                                                    <span className="min-w-0 flex-1 truncate text-sm text-secondary">{v.label}</span>
                                                                    {off && (
                                                                        <Badge type="modern" color="gray" size="sm">
                                                                            Already added
                                                                        </Badge>
                                                                    )}
                                                                    <span className={onHandCell}>
                                                                        {formatCount(
                                                                            v.onHand,
                                                                            (v.linkedItemId ? getItem(v.linkedItemId)?.unit : undefined) ?? r.item.unit,
                                                                        )}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </AriaCheckbox>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

                {matches.length > shown.length && (
                    <div className="flex flex-col items-center gap-2 border-t border-secondary px-4 py-4 text-center">
                        <p className="text-sm text-tertiary">
                            Showing {shown.length} of {matches.length.toLocaleString("en-US")}.
                            {shown.length >= MAX_SHOWN && (narrowed ? " Narrow the search to see the rest." : " Search or add a filter to find the rest.")}
                        </p>
                        {shown.length < MAX_SHOWN && (
                            <Button color="secondary" size="sm" className="max-sm:min-h-11" onClick={() => setLimit(MAX_SHOWN)}>
                                Show {Math.min(MAX_SHOWN, matches.length) - shown.length} more
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-secondary px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-4">
                <p aria-live="polite" data-testid="picker-count" className="text-sm font-medium text-secondary tabular-nums">
                    {picked.length} selected
                </p>
                <div className="flex items-center gap-2">
                    <Button color="secondary" size="md" className="max-sm:min-h-11" onClick={close}>
                        Cancel
                    </Button>
                    <Button color="primary" size="md" className="max-sm:min-h-11" isDisabled={picked.length === 0} onClick={submit} data-testid="picker-add">
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};

/**
 * Pick products to add to an order or a list.
 *
 * Search first: the catalogue is about 1,750 products, so the list shows at most 60 at a time.
 * A polish colour stocked in more than one finish opens to one row per finish (Regular, Gel, Dip),
 * each with its own tick and on-hand count; the colour's own tick is tri-state.
 * A dialog on a wide screen, a full-screen sheet on a phone. Nothing is saved here: `onAdd` hands
 * the selection to the screen.
 */
export const ProductPicker = ({ isOpen, onOpenChange, ...body }: ProductPickerProps) => (
    <AriaModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        className={({ isEntering, isExiting }) =>
            cx(
                "fixed inset-0 z-50 flex items-stretch justify-center bg-overlay/70 outline-hidden sm:items-center sm:p-8",
                isEntering && "duration-200 ease-out animate-in fade-in",
                isExiting && "duration-150 ease-in animate-out fade-out",
            )
        }
    >
        <AriaModal
            className={({ isEntering, isExiting }) =>
                cx(
                    "flex h-dvh w-full flex-col bg-primary shadow-xl outline-hidden sm:h-[min(44rem,calc(100dvh-4rem))] sm:max-w-2xl sm:rounded-2xl",
                    isEntering && "duration-200 ease-out animate-in max-sm:slide-in-from-bottom-4 sm:zoom-in-95",
                    isExiting && "duration-150 ease-in animate-out max-sm:slide-out-to-bottom-4 sm:zoom-out-95",
                )
            }
        >
            <AriaDialog className="flex h-full min-h-0 flex-col outline-hidden">{({ close }) => <PickerBody {...body} close={close} />}</AriaDialog>
        </AriaModal>
    </AriaModalOverlay>
);
