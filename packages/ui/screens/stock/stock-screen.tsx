"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Check, ChevronRight, Download01, FilterLines, Package, SearchLg, ShoppingCart01 } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Table, TableCard } from "@/components/application/table/table";
import { Tab, TabList, TabPanel, Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { StockStatusBadge } from "@/components/meraki/status-badges";
import { StockMeter } from "@/components/meraki/stock-meter";
import type { StockRow } from "@/data/inventory";
import { TODAY, locationName, stockRows, summary, tipMatrix, userById } from "@/data/inventory";
import type { ForecastConfidence, LocationId, PolishLine, StockStatus } from "@/data/types";
import { relativeDays } from "@/engine/dates";
import { formatQty } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

type TabId = "supplies" | "polish" | "tips";
type StatusFilter = "all" | "out" | "low" | "over" | "unknown";
type SortId = "urgent" | "shelf" | "name" | "on-hand" | "cover" | "counted";

const SUPPLY_PAGE = 60;
const POLISH_PAGE = 80;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
/** Items sold as "Each" have no sensible plural, so they read as units. */
const unitOf = (unit: string) => (unit.toLowerCase() === "each" ? "Unit" : unit);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, ok: 2, over: 3, unknown: 4, paused: 5 };
const STATUS_TEXT: Record<StockStatus, string> = {
    out: "text-error-primary",
    low: "text-warning-primary",
    ok: "text-primary",
    over: "text-primary",
    unknown: "text-primary",
    paused: "text-primary",
};
const STATUS_DOT: Record<Exclude<StatusFilter, "all">, string> = {
    out: "bg-error-solid",
    low: "bg-warning-solid",
    over: "bg-utility-blue-500",
    unknown: "bg-utility-neutral-400",
};
const CONFIDENCE_TEXT: Record<ForecastConfidence, string> = {
    high: "High confidence",
    medium: "Medium confidence",
    low: "Low confidence",
    none: "No forecast",
};

const SORTS: { value: SortId; label: string }[] = [
    { value: "urgent", label: "Most urgent first" },
    { value: "shelf", label: "Shelf order" },
    { value: "name", label: "Name, A to Z" },
    { value: "on-hand", label: "On hand, low to high" },
    { value: "cover", label: "Days of cover, shortest first" },
    { value: "counted", label: "Last counted, oldest first" },
];

const matchesStatus = (status: StockStatus, filter: StatusFilter) =>
    filter === "all" || (filter === "unknown" ? status === "unknown" || status === "paused" : status === filter);
const needsReorder = (r: StockRow) => (r.forecast?.suggestedOrderQty ?? 0) > 0 || r.level.reorderRequested;
const shelfLabel = (r: StockRow) => (r.level.shelf ? `Shelf ${r.level.shelf}` : undefined);

// ------------------------------------------------------------------------------------ shared bits

const FilterChip = ({
    selected,
    onPress,
    dot,
    count,
    children,
}: {
    selected: boolean;
    onPress: () => void;
    dot?: string;
    count?: number;
    children: ReactNode;
}) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onPress}
        className={cx(
            "flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9",
            selected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
        )}
    >
        {dot && <span aria-hidden="true" className={cx("size-2 rounded-full", dot)} />}
        {children}
        {count !== undefined && (
            <span className={cx("font-medium tabular-nums", selected ? "text-brand-secondary" : "text-quaternary")}>{count.toLocaleString("en-US")}</span>
        )}
    </button>
);

/** One row of chips that scrolls sideways on a phone and wraps on desktop. */
const ChipRow = ({ label, children }: { label: string; children: ReactNode }) => (
    <div
        role="group"
        aria-label={label}
        className="-mx-4 scrollbar-hide flex gap-2 overflow-x-auto px-4 py-0.5 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
        {children}
    </div>
);

const NothingHere = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
    <Card className="py-10 lg:py-14">
        <EmptyState size="sm">
            <EmptyState.Header pattern="none">
                <EmptyState.FeaturedIcon icon={Package} color="gray" theme="modern" />
            </EmptyState.Header>
            <EmptyState.Content>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>{children}</EmptyState.Description>
            </EmptyState.Content>
            {action && <EmptyState.Footer>{action}</EmptyState.Footer>}
        </EmptyState>
    </Card>
);

// ------------------------------------------------------------------------------------ supplies

interface SuppliesProps {
    location: LocationId;
    initialStatus: StatusFilter;
    initialReorderOnly: boolean;
    initialQuery: string;
}

const SuppliesTab = ({ location, initialStatus, initialReorderOnly, initialQuery }: SuppliesProps) => {
    const isDesktop = useBreakpoint("lg");
    const rows = useMemo(() => stockRows(location, "supply"), [location]);
    const s = summary(location);

    const [query, setQuery] = useState(initialQuery);
    const [status, setStatus] = useState<StatusFilter>(initialStatus);
    const [area, setArea] = useState("all");
    const [vendor, setVendor] = useState("all");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState<SortId>("urgent");
    const [reorderOnly, setReorderOnly] = useState(initialReorderOnly);
    useUrlSync({ status: status === "all" ? undefined : status, reorder: reorderOnly ? "1" : undefined, q: query });
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [visible, setVisible] = useState(SUPPLY_PAGE);
    const [exported, setExported] = useState(false);

    const areas = useMemo(() => [...new Set(rows.map((r) => r.level.area))], [rows]);
    const vendors = useMemo(() => [...new Map(rows.map((r) => [r.vendor.id, r.vendor.name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
    const categories = useMemo(() => [...new Set(rows.map((r) => r.item.category))].sort(), [rows]);

    const filtered = useMemo(() => {
        const q = norm(query);
        const out = rows.filter(
            (r) =>
                matchesStatus(r.status, status) &&
                (area === "all" || r.level.area === area) &&
                (vendor === "all" || r.vendor.id === vendor) &&
                (category === "all" || r.item.category === category) &&
                (!reorderOnly || needsReorder(r)) &&
                (!q || norm(`${r.item.name} ${r.item.brand ?? ""} ${r.item.category} ${r.item.sku ?? ""} ${r.item.upc ?? ""}`).includes(q)),
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
        return out.sort(compare[sort]);
    }, [rows, query, status, area, vendor, category, reorderOnly, sort, areas]);

    const reset = () => setVisible(SUPPLY_PAGE);
    const activeFilters = [area, vendor, category].filter((v) => v !== "all").length + (reorderOnly ? 1 : 0);
    const clearAll = () => {
        setQuery("");
        setStatus("all");
        setArea("all");
        setVendor("all");
        setCategory("all");
        setReorderOnly(false);
        reset();
    };

    // On a phone the list is grouped by area, the way people walk the room.
    const ordered = isDesktop ? filtered : [...filtered].sort((a, b) => areas.indexOf(a.level.area) - areas.indexOf(b.level.area));
    const page = ordered.slice(0, visible);
    const remaining = ordered.length - page.length;

    const chips: { id: StatusFilter; label: string; count: number }[] = [
        { id: "all", label: "All", count: rows.length },
        { id: "out", label: "Out", count: s.out },
        { id: "low", label: "Low", count: s.low },
        { id: "over", label: "Overstocked", count: s.over },
        { id: "unknown", label: "No par", count: s.unknown },
    ];

    const controlSize = isDesktop ? "sm" : "md";
    const reorderToggle = (
        <Toggle
            size="sm"
            label="Needs reorder only"
            className="col-span-2 min-h-11 shrink-0 items-center lg:min-h-0"
            isSelected={reorderOnly}
            onChange={(v) => {
                setReorderOnly(v);
                reset();
            }}
        />
    );

    const coverText = (r: StockRow) => {
        if (r.level.fillLevel) return undefined;
        const days = r.forecast?.daysOfCover;
        return days === undefined ? undefined : days === 0 ? "No cover" : plural(days, "day");
    };
    const coverTone = (r: StockRow) => ((r.forecast?.daysOfCover ?? Number.POSITIVE_INFINITY) <= r.vendor.leadTimeDays ? "text-error-primary" : "text-primary");
    const counted = (r: StockRow) => (r.level.lastCountedAt ? relativeDays(r.level.lastCountedAt, TODAY) : "Never");

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <ChipRow label="Filter by status">
                    {chips.map((c) => (
                        <FilterChip
                            key={c.id}
                            selected={status === c.id}
                            dot={c.id === "all" ? undefined : STATUS_DOT[c.id]}
                            count={c.count}
                            onPress={() => {
                                setStatus(status === c.id ? "all" : c.id);
                                reset();
                            }}
                        >
                            {c.label}
                        </FilterChip>
                    ))}
                </ChipRow>
                {isDesktop && reorderToggle}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex items-center gap-2 lg:min-w-56 lg:flex-1">
                    <Input
                        size={controlSize}
                        icon={SearchLg}
                        aria-label="Search supplies"
                        placeholder="Search by name, brand or barcode"
                        value={query}
                        onChange={(v) => {
                            setQuery(v);
                            reset();
                        }}
                    />
                    <Button
                        color="secondary"
                        size="md"
                        iconLeading={FilterLines}
                        className="shrink-0 lg:hidden"
                        aria-expanded={filtersOpen}
                        onClick={() => setFiltersOpen((v) => !v)}
                    >
                        Filters{activeFilters ? ` (${activeFilters})` : ""}
                    </Button>
                </div>

                <div className={cx("grid-cols-2 gap-3 lg:flex lg:items-center", filtersOpen ? "grid" : "hidden")}>
                    <NativeSelect
                        selectClassName="w-full min-w-0 truncate"
                        aria-label="Area"
                        size={controlSize}
                        className="lg:w-36"
                        value={area}
                        onChange={(e) => {
                            setArea(e.target.value);
                            reset();
                        }}
                        options={[{ label: "All areas", value: "all" }, ...areas.map((a) => ({ label: a, value: a }))]}
                    />
                    <NativeSelect
                        selectClassName="w-full min-w-0 truncate"
                        aria-label="Vendor"
                        size={controlSize}
                        className="lg:w-40"
                        value={vendor}
                        onChange={(e) => {
                            setVendor(e.target.value);
                            reset();
                        }}
                        options={[{ label: "All vendors", value: "all" }, ...vendors.map(([value, label]) => ({ label, value }))]}
                    />
                    <NativeSelect
                        selectClassName="w-full min-w-0 truncate"
                        aria-label="Category"
                        size={controlSize}
                        className="lg:w-44"
                        value={category}
                        onChange={(e) => {
                            setCategory(e.target.value);
                            reset();
                        }}
                        options={[{ label: "All categories", value: "all" }, ...categories.map((c) => ({ label: c, value: c }))]}
                    />
                    <NativeSelect
                        selectClassName="w-full min-w-0 truncate"
                        aria-label="Sort"
                        size={controlSize}
                        className="lg:w-48"
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortId)}
                        options={SORTS}
                    />
                    {!isDesktop && reorderToggle}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-sm text-tertiary" aria-live="polite">
                    {filtered.length === rows.length
                        ? `${plural(rows.length, "supply", "supplies")} at ${locationName(location)}`
                        : `${filtered.length} of ${plural(rows.length, "supply", "supplies")}`}
                    {reorderOnly && " that need reordering"}
                </p>
                <Button color="secondary" size="sm" iconLeading={exported ? Check : Download01} onClick={() => setExported(true)}>
                    {exported ? `Exported ${plural(filtered.length, "row")}` : "Export CSV"}
                </Button>
            </div>

            {filtered.length === 0 ? (
                <NothingHere
                    title="No supplies match"
                    action={
                        <Button color="secondary" size="md" onClick={clearAll}>
                            Clear search and filters
                        </Button>
                    }
                >
                    Nothing at {locationName(location)} fits this search and these filters.
                </NothingHere>
            ) : isDesktop ? (
                <TableCard.Root size="sm">
                    <Table aria-label={`Supplies at ${locationName(location)}`}>
                        <Table.Header>
                            <Table.Head id="item" label="Item" isRowHeader className="w-full" />
                            <Table.Head id="shelf" label="Area and shelf" className="px-3" />
                            <Table.Head id="on-hand" label="On hand" className="px-3" />
                            <Table.Head id="par" label="Par" className="px-3" />
                            <Table.Head id="status" label="Status" className="px-3" />
                            <Table.Head
                                id="cover"
                                label="Days of cover"
                                className="px-3"
                                tooltip="How long the stock on the shelf should last at the forecast usage rate."
                            />
                            <Table.Head id="vendor" label="Vendor" className="px-3" />
                            <Table.Head id="counted" label="Last counted" className="pr-5 pl-3" />
                        </Table.Header>
                        <Table.Body>
                            {page.map((r) => {
                                const cover = coverText(r);
                                return (
                                    <Table.Row key={r.item.id} id={r.item.id} href={ROUTES.item(r.item.id)} className="cursor-pointer">
                                        <Table.Cell className="py-2.5 pr-3">
                                            <div className="flex items-center gap-3">
                                                <ItemThumb item={r.item} />
                                                <div className="min-w-0">
                                                    <p className="line-clamp-1 text-sm font-medium text-primary">{r.item.name}</p>
                                                    <p className="line-clamp-1 text-xs text-tertiary">
                                                        {[r.item.brand, r.item.category].filter(Boolean).join(" · ")}
                                                    </p>
                                                </div>
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell className="px-3 whitespace-nowrap">
                                            <p className="text-sm text-secondary">{r.level.area}</p>
                                            {shelfLabel(r) && <p className="text-xs text-tertiary">{shelfLabel(r)}</p>}
                                        </Table.Cell>
                                        <Table.Cell className="px-3">
                                            <div className="flex w-32 flex-col gap-1.5">
                                                <p className={cx("text-sm font-semibold whitespace-nowrap tabular-nums", STATUS_TEXT[r.status])}>
                                                    {formatQty(r.level, unitOf(r.item.unit))}
                                                </p>
                                                <StockMeter level={r.level} status={r.status} reorderPoint={r.forecast?.reorderPoint} />
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell className="px-3 whitespace-nowrap tabular-nums">
                                            {r.level.fillLevel ? "Half" : (r.level.par ?? "–")}
                                        </Table.Cell>
                                        <Table.Cell className="px-3 whitespace-nowrap">
                                            <StockStatusBadge status={r.status} />
                                        </Table.Cell>
                                        <Table.Cell className="px-3 whitespace-nowrap">
                                            {cover ? (
                                                <>
                                                    <p className={cx("text-sm font-medium tabular-nums", coverTone(r))}>{cover}</p>
                                                    <p className="text-xs text-tertiary">{CONFIDENCE_TEXT[r.forecast?.confidence ?? "none"]}</p>
                                                </>
                                            ) : (
                                                <p className="text-xs text-quaternary">{r.level.fillLevel ? "Tracked by fill level" : "No forecast yet"}</p>
                                            )}
                                        </Table.Cell>
                                        <Table.Cell className="px-3 whitespace-nowrap text-secondary">{r.vendor.name}</Table.Cell>
                                        <Table.Cell className="pr-5 pl-3 whitespace-nowrap">
                                            <p className="text-sm text-secondary">{counted(r)}</p>
                                            {r.level.lastCountedBy && (
                                                <p className="text-xs text-tertiary">by {userById(r.level.lastCountedBy)?.name.split(" ")[0]}</p>
                                            )}
                                        </Table.Cell>
                                    </Table.Row>
                                );
                            })}
                        </Table.Body>
                    </Table>
                </TableCard.Root>
            ) : (
                <div className="flex flex-col gap-4">
                    {areas
                        .map((a) => ({ area: a, items: page.filter((r) => r.level.area === a), total: ordered.filter((r) => r.level.area === a).length }))
                        .filter((g) => g.items.length > 0)
                        .map((g) => (
                            <section key={g.area} aria-label={g.area} className="flex flex-col gap-2">
                                <h3 className="sticky top-14 z-10 -mx-4 flex items-baseline justify-between bg-secondary_alt/95 px-4 py-2 text-sm font-semibold text-secondary backdrop-blur md:-mx-8 md:px-8">
                                    {g.area}
                                    <span className="text-xs font-medium text-tertiary">{plural(g.total, "item")}</span>
                                </h3>
                                <Card padded={false}>
                                    <ul className="divide-y divide-secondary">
                                        {g.items.map((r) => {
                                            const cover = coverText(r);
                                            return (
                                                <li key={r.item.id}>
                                                    <a
                                                        href={ROUTES.item(r.item.id)}
                                                        className="flex gap-3 px-4 py-3.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2"
                                                    >
                                                        <ItemThumb item={r.item} />
                                                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <p className="line-clamp-2 text-sm font-semibold text-primary">{r.item.name}</p>
                                                                    <p className="truncate text-xs text-tertiary">
                                                                        {[shelfLabel(r), r.vendor.name].filter(Boolean).join(" · ")}
                                                                    </p>
                                                                </div>
                                                                <div className="flex shrink-0 flex-col items-end gap-1">
                                                                    <p
                                                                        className={cx(
                                                                            "text-sm font-semibold whitespace-nowrap tabular-nums",
                                                                            STATUS_TEXT[r.status],
                                                                        )}
                                                                    >
                                                                        {formatQty(r.level, unitOf(r.item.unit))}
                                                                    </p>
                                                                    <StockStatusBadge status={r.status} />
                                                                </div>
                                                            </div>
                                                            <StockMeter level={r.level} status={r.status} reorderPoint={r.forecast?.reorderPoint} />
                                                            <p className="text-xs text-tertiary">
                                                                {r.level.fillLevel
                                                                    ? "Reorder at half"
                                                                    : r.level.par !== undefined
                                                                      ? `Par ${r.level.par}`
                                                                      : "No par"}
                                                                {cover && (
                                                                    <>
                                                                        {" · "}
                                                                        <span className={cx("font-medium", coverTone(r))}>
                                                                            {cover === "No cover" ? "no cover left" : `${cover} of cover`}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                {" · "}counted {counted(r).toLowerCase()}
                                                            </p>
                                                        </div>
                                                        <ChevronRight className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </Card>
                            </section>
                        ))}
                </div>
            )}

            {remaining > 0 && (
                <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={() => setVisible((v) => v + SUPPLY_PAGE)}>
                    Show {Math.min(SUPPLY_PAGE, remaining)} more ({remaining} left)
                </Button>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------ polish

const LINES: { id: PolishLine; label: string }[] = [
    { id: "opi", label: "OPI" },
    { id: "opi-dip", label: "OPI dip" },
    { id: "dnd", label: "DND" },
    { id: "dazzle-dry", label: "Dazzle Dry" },
    { id: "chisel", label: "Chisel" },
];

type Availability = "all" | "in" | "out" | "reorder";

const PolishTab = ({
    location,
    onViewLynnfield,
    initialLine,
    initialQuery,
}: {
    location: LocationId;
    onViewLynnfield: () => void;
    initialLine: PolishLine | "all";
    initialQuery: string;
}) => {
    const rows = useMemo(() => stockRows(location, "polish"), [location]);
    const [line, setLine] = useState<PolishLine | "all">(initialLine);
    const [family, setFamily] = useState("all");
    const [availability, setAvailability] = useState<Availability>("all");
    const [query, setQuery] = useState(initialQuery);
    useUrlSync({ line: line === "opi" ? undefined : line, q: query });
    const [visible, setVisible] = useState(POLISH_PAGE);

    const lineCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r.item.line ?? "", (counts.get(r.item.line ?? "") ?? 0) + 1);
        return counts;
    }, [rows]);

    const inLine = useMemo(() => (line === "all" ? rows : rows.filter((r) => r.item.line === line)), [rows, line]);
    const families = useMemo(() => {
        const map = new Map<string, { count: number; swatch?: string }>();
        for (const r of inLine) {
            if (!r.item.colorFamily) continue;
            const f = map.get(r.item.colorFamily) ?? { count: 0, swatch: r.item.swatch };
            f.count += 1;
            map.set(r.item.colorFamily, f);
        }
        return [...map.entries()];
    }, [inLine]);

    const q = norm(query);
    const matchesQuery = (r: StockRow) =>
        !q || norm(`${r.item.name} ${r.item.colorCode ?? ""} ${r.item.sku ?? ""} ${r.item.brand ?? ""}${r.item.colorCode ?? ""}`).includes(q);
    const filtered = inLine.filter(
        (r) =>
            matchesQuery(r) &&
            (family === "all" || r.item.colorFamily === family) &&
            (availability === "all" || (availability === "in" ? r.level.onHand > 0 : availability === "out" ? r.level.onHand <= 0 : r.level.reorderRequested)),
    );
    const elsewhere = q && line !== "all" ? rows.filter((r) => r.item.line !== line && matchesQuery(r)).length : 0;

    if (!rows.length) {
        return (
            <NothingHere
                title={`No polish wall recorded for ${locationName(location)}`}
                action={
                    location !== "lynnfield" ? (
                        <Button color="secondary" size="md" onClick={onViewLynnfield}>
                            View Lynnfield's polish
                        </Button>
                    ) : undefined
                }
            >
                The colour sheets on file cover Lynnfield only. Colours appear here after the first polish count at this location.
            </NothingHere>
        );
    }

    const reset = () => setVisible(POLISH_PAGE);
    const page = filtered.slice(0, visible);
    const remaining = filtered.length - page.length;
    const outCount = inLine.filter((r) => r.level.onHand <= 0).length;
    const reorderCount = inLine.filter((r) => r.level.reorderRequested).length;

    return (
        <div className="flex flex-col gap-4">
            <ChipRow label="Polish line">
                {LINES.map((l) => (
                    <FilterChip
                        key={l.id}
                        selected={line === l.id}
                        count={lineCounts.get(l.id) ?? 0}
                        onPress={() => {
                            setLine(l.id);
                            setFamily("all");
                            reset();
                        }}
                    >
                        {l.label}
                    </FilterChip>
                ))}
                <FilterChip
                    selected={line === "all"}
                    count={rows.length}
                    onPress={() => {
                        setLine("all");
                        setFamily("all");
                        reset();
                    }}
                >
                    All lines
                </FilterChip>
            </ChipRow>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <Input
                    size="md"
                    icon={SearchLg}
                    className="lg:max-w-sm"
                    aria-label="Search polish"
                    placeholder="Search by colour name, code or SKU"
                    value={query}
                    onChange={(v) => {
                        setQuery(v);
                        reset();
                    }}
                />
                <ChipRow label="Availability">
                    {(
                        [
                            { id: "all", label: "All", count: inLine.length },
                            { id: "in", label: "In stock", count: inLine.length - outCount },
                            { id: "out", label: "Out", count: outCount },
                            { id: "reorder", label: "Reorder requested", count: reorderCount },
                        ] as { id: Availability; label: string; count: number }[]
                    ).map((a) => (
                        <FilterChip
                            key={a.id}
                            selected={availability === a.id}
                            count={a.count}
                            dot={a.id === "out" ? "bg-error-solid" : undefined}
                            onPress={() => {
                                setAvailability(a.id);
                                reset();
                            }}
                        >
                            {a.label}
                        </FilterChip>
                    ))}
                </ChipRow>
            </div>

            {families.length > 1 && (
                <ChipRow label="Colour family">
                    <FilterChip
                        selected={family === "all"}
                        onPress={() => {
                            setFamily("all");
                            reset();
                        }}
                    >
                        All families
                    </FilterChip>
                    {families.map(([name, f]) => (
                        <button
                            key={name}
                            type="button"
                            aria-pressed={family === name}
                            onClick={() => {
                                setFamily(family === name ? "all" : name);
                                reset();
                            }}
                            className={cx(
                                "flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full py-1 pr-3.5 pl-2 text-sm font-medium whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9",
                                family === name
                                    ? "bg-brand-primary_alt text-brand-secondary ring-brand"
                                    : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                            )}
                        >
                            <span aria-hidden="true" className="size-5 rounded-full ring-1 ring-secondary ring-inset" style={{ backgroundColor: f.swatch }} />
                            {name}
                            <span className="text-quaternary tabular-nums">{f.count}</span>
                        </button>
                    ))}
                </ChipRow>
            )}

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-tertiary">
                <p aria-live="polite">
                    Showing {page.length.toLocaleString("en-US")} of {plural(filtered.length, "colour")}
                </p>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-3.5 rounded-sm bg-utility-neutral-300 opacity-40 ring-1 ring-secondary ring-inset" />
                        Faded: out of stock
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span
                            aria-hidden="true"
                            className="flex size-4 items-center justify-center rounded-full bg-primary text-fg-brand-primary ring-1 ring-secondary"
                        >
                            <ShoppingCart01 className="size-2.5" />
                        </span>
                        Reorder requested
                    </span>
                    <span>×3: bottles on hand</span>
                </p>
            </div>

            {elsewhere > 0 && (
                <p className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-tertiary ring-1 ring-secondary ring-inset">
                    {plural(elsewhere, "match", "matches")} in other lines.
                    <Button color="link-color" size="sm" onClick={() => setLine("all")}>
                        Search all lines
                    </Button>
                </p>
            )}

            {filtered.length === 0 ? (
                <NothingHere title="No colours match">Try a different name or code, or clear the availability filter.</NothingHere>
            ) : (
                <Card padded={false} className="p-2 lg:p-3">
                    <ul className="grid grid-cols-3 gap-1 xs:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                        {page.map((r) => {
                            const out = r.level.onHand <= 0;
                            return (
                                <li key={r.item.id}>
                                    <a
                                        href={ROUTES.item(r.item.id)}
                                        aria-label={`${r.item.colorCode ?? ""} ${r.item.name}, ${out ? "out of stock" : plural(r.level.onHand, "bottle")}${r.level.reorderRequested ? ", reorder requested" : ""}`}
                                        className="flex flex-col gap-1.5 rounded-lg p-1.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                    >
                                        <span className="relative block aspect-4/3 w-full">
                                            <ItemThumb item={r.item} className={cx("block size-full! rounded-lg!", out && "opacity-30")} />
                                            {out && (
                                                <span className="absolute inset-x-0 bottom-1.5 mx-auto w-max rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-error-primary shadow-xs ring-1 ring-secondary">
                                                    Out
                                                </span>
                                            )}
                                            {r.level.reorderRequested && (
                                                <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-fg-brand-primary shadow-xs ring-1 ring-secondary">
                                                    <ShoppingCart01 className="size-3" aria-hidden="true" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex items-baseline justify-between gap-1">
                                            <span className="truncate text-xs font-semibold text-primary">{r.item.colorCode}</span>
                                            <span className={cx("shrink-0 text-xs font-medium tabular-nums", out ? "text-error-primary" : "text-tertiary")}>
                                                ×{r.level.onHand}
                                            </span>
                                        </span>
                                        <span className="truncate text-xs text-tertiary">{r.item.name}</span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            )}

            {remaining > 0 && (
                <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={() => setVisible((v) => v + POLISH_PAGE)}>
                    Show {Math.min(POLISH_PAGE, remaining)} more ({remaining.toLocaleString("en-US")} left)
                </Button>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------ Gel-X tips

const sizeOrder = (size: string) => (size.toUpperCase() === "OO" ? -1 : Number(size));
const lengthLabel = (length: string) => (/^x[\s-]?short$/i.test(length) ? "X-Short" : length);

const TipsTab = ({ location, onViewLynnfield }: { location: LocationId; onViewLynnfield: () => void }) => {
    const tracked = stockRows(location, "tips").length > 0;
    const sizes = useMemo(() => [...new Set(tipMatrix.flatMap((t) => Object.keys(t.bySize)))].sort((a, b) => sizeOrder(a) - sizeOrder(b)), []);

    if (!tracked) {
        return (
            <NothingHere
                title={`No Gel-X tips recorded for ${locationName(location)}`}
                action={
                    location !== "lynnfield" ? (
                        <Button color="secondary" size="md" onClick={onViewLynnfield}>
                            View Lynnfield's tips
                        </Button>
                    ) : undefined
                }
            >
                The tip count on file covers Lynnfield only.
            </NothingHere>
        );
    }

    const boxes = tipMatrix.reduce((n, t) => n + t.total, 0);
    const emptySets = tipMatrix.filter((t) => t.total === 0).length;
    const cells = tipMatrix.length * sizes.length;
    const gaps = tipMatrix.reduce((n, t) => n + sizes.filter((sz) => (t.bySize[sz] ?? 0) === 0).length, 0);
    const columnTotal = (sz: string) => tipMatrix.reduce((n, t) => n + (t.bySize[sz] ?? 0), 0);

    return (
        <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: "Tip sets", value: tipMatrix.length, hint: "Shape and length" },
                    { label: "Boxes on hand", value: boxes, hint: "All sizes" },
                    { label: "Sets with none", value: emptySets, hint: "Every size is out", bad: emptySets > 0 },
                    { label: "Sizes missing", value: gaps, hint: `Of ${cells} shape, length and size combinations`, bad: gaps > 0 },
                ].map((stat) => (
                    <div key={stat.label} className="flex flex-col gap-0.5 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset">
                        <dt className="text-sm font-medium text-tertiary">{stat.label}</dt>
                        <dd className={cx("text-display-xs font-semibold tabular-nums", stat.bad ? "text-error-primary" : "text-primary")}>{stat.value}</dd>
                        <dd className="text-xs text-tertiary">{stat.hint}</dd>
                    </div>
                ))}
            </dl>

            <Card padded={false} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-secondary px-4 py-3 lg:px-5">
                    <div>
                        <h2 className="text-md font-semibold text-primary">Aprés Gel-X tips by size</h2>
                        <p className="text-sm text-tertiary">Boxes on hand for each shape, length and size, from the tip sheet.</p>
                    </div>
                    <p className="flex items-center gap-4 text-xs text-tertiary">
                        <span className="flex items-center gap-1.5">
                            <span
                                aria-hidden="true"
                                className="flex size-5 items-center justify-center rounded-sm bg-error-primary text-xs font-medium text-error-primary"
                            >
                                0
                            </span>
                            Gap: none on hand
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span
                                aria-hidden="true"
                                className="flex size-5 items-center justify-center rounded-sm bg-brand-primary_alt text-xs font-semibold text-brand-secondary"
                            >
                                2
                            </span>
                            In stock
                        </span>
                    </p>
                </div>
                <p className="border-b border-secondary bg-secondary px-4 py-1.5 text-xs text-tertiary lg:hidden">Scroll sideways to see every size.</p>
                {/* relative: keeps the visually hidden labels inside the scroll area so they cannot widen the page. */}
                <div className="relative overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                        <caption className="sr-only">Gel-X tip boxes on hand by shape, length and size</caption>
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                    className="sticky left-0 z-10 border-b border-secondary bg-secondary px-4 py-2 text-left text-xs font-semibold whitespace-nowrap text-quaternary lg:px-5"
                                >
                                    Shape and length
                                </th>
                                {sizes.map((sz) => (
                                    <th
                                        key={sz}
                                        scope="col"
                                        className="min-w-10 border-b border-secondary bg-secondary px-1 py-2 text-center text-xs font-semibold text-quaternary"
                                    >
                                        {sz}
                                    </th>
                                ))}
                                <th
                                    scope="col"
                                    className="border-b border-secondary bg-secondary px-4 py-2 text-right text-xs font-semibold text-quaternary lg:px-5"
                                >
                                    Total
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {tipMatrix.map((t, i) => {
                                const newShape = tipMatrix[i - 1]?.shape !== t.shape;
                                const border = cx("border-secondary", i > 0 && (newShape ? "border-t-2" : "border-t"));
                                return (
                                    <tr key={t.itemId}>
                                        <th
                                            scope="row"
                                            className={cx("sticky left-0 z-10 bg-primary px-4 py-0 text-left font-normal whitespace-nowrap lg:px-5", border)}
                                        >
                                            <a
                                                href={ROUTES.item(t.itemId)}
                                                className="flex min-h-11 items-center gap-1.5 rounded-xs outline-focus-ring hover:underline focus-visible:outline-2"
                                            >
                                                <span className={cx("font-semibold", newShape ? "text-primary" : "text-quaternary")}>{t.shape}</span>
                                                <span className="text-secondary">{lengthLabel(t.length)}</span>
                                            </a>
                                        </th>
                                        {sizes.map((sz) => {
                                            const qty = t.bySize[sz] ?? 0;
                                            return (
                                                <td key={sz} className={cx("p-0.5 text-center", border)}>
                                                    <span
                                                        className={cx(
                                                            "flex h-9 items-center justify-center rounded-sm tabular-nums",
                                                            qty === 0
                                                                ? "bg-error-primary text-xs font-medium text-error-primary"
                                                                : "bg-brand-primary_alt font-semibold text-brand-secondary",
                                                        )}
                                                    >
                                                        {qty}
                                                        {qty === 0 && <span className="sr-only"> (gap)</span>}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                        <td
                                            className={cx(
                                                "px-4 text-right font-semibold whitespace-nowrap tabular-nums lg:px-5",
                                                border,
                                                t.total === 0 ? "text-error-primary" : "text-primary",
                                            )}
                                        >
                                            {t.total === 0 ? "None" : t.total}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <th
                                    scope="row"
                                    className="sticky left-0 z-10 border-t border-secondary bg-secondary px-4 py-2.5 text-left text-xs font-semibold text-quaternary lg:px-5"
                                >
                                    All shapes
                                </th>
                                {sizes.map((sz) => (
                                    <td
                                        key={sz}
                                        className="border-t border-secondary bg-secondary px-1 py-2.5 text-center text-xs font-semibold text-secondary tabular-nums"
                                    >
                                        {columnTotal(sz)}
                                    </td>
                                ))}
                                <td className="border-t border-secondary bg-secondary px-4 py-2.5 text-right text-sm font-semibold text-primary tabular-nums lg:px-5">
                                    {boxes}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ screen

interface StockScreenProps {
    location?: LocationId;
    initialTab?: TabId;
    /** Start with one status chip selected. */
    initialStatus?: StatusFilter;
    /** Start with "Needs reorder only" switched on. */
    initialReorderOnly?: boolean;
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Polish line to start on (deep link `?line=`). */
    initialLine?: PolishLine | "all";
}

/** Everything on the shelves at one location: supplies, the polish wall and Gel-X tips. */
export const StockScreen = ({
    location: initialLocation = "lynnfield",
    initialTab = "supplies",
    initialStatus = "all",
    initialReorderOnly = false,
    initialQuery = "",
    initialLine = "opi",
}: StockScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [tab, setTab] = useState<TabId>(initialTab);
    useUrlSync({ tab: tab === "supplies" ? undefined : tab, ...(tab === "polish" ? {} : { line: undefined }) });
    const s = summary(location);
    const tips = stockRows(location, "tips").length;

    return (
        <AppShell activeUrl={ROUTES.stock} location={location} onLocationChange={setLocation}>
            <PageContent className="gap-5 lg:gap-6">
                <PageHeader
                    title={
                        <>
                            Stock at <em>{locationName(location)}</em>
                        </>
                    }
                    description={`${s.out} out and ${s.low} low across ${plural(s.supplies, "supply", "supplies")}. ${s.reorderLines} suggested for the next order.`}
                    actions={
                        <>
                            <Button href={ROUTES.counts} color="secondary" size="md" className="max-lg:flex-1">
                                Count stock
                            </Button>
                            <Button href={ROUTES.newOrder} size="md" iconLeading={ShoppingCart01} className="max-lg:flex-1">
                                Build order
                            </Button>
                        </>
                    }
                />

                <SampleDataNote>
                    Items, shelves, par levels, the polish wall and tip counts come from Meraki's spreadsheets. Most supply on-hand numbers, all Newburyport
                    stock, count dates and usage are sample values.
                </SampleDataNote>

                <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as TabId)} className="gap-5">
                    <TabList type="underline" size="md" aria-label="Stock type" className="scrollbar-hide overflow-x-auto">
                        <Tab id="supplies" label="Supplies" badge={s.supplies} />
                        <Tab id="polish" label="Polish" badge={s.polishes ? s.polishes.toLocaleString("en-US") : undefined} />
                        <Tab id="tips" label="Gel-X tips" badge={tips || undefined} />
                    </TabList>
                    <TabPanel id="supplies">
                        {/* Keyed by location so filters and paging start fresh when the salon changes. */}
                        <SuppliesTab
                            key={location}
                            location={location}
                            initialStatus={initialStatus}
                            initialReorderOnly={initialReorderOnly}
                            initialQuery={initialQuery}
                        />
                    </TabPanel>
                    <TabPanel id="polish">
                        <PolishTab
                            key={location}
                            location={location}
                            onViewLynnfield={() => setLocation("lynnfield")}
                            initialLine={initialLine}
                            initialQuery={initialQuery}
                        />
                    </TabPanel>
                    <TabPanel id="tips">
                        <TipsTab location={location} onViewLynnfield={() => setLocation("lynnfield")} />
                    </TabPanel>
                </Tabs>
            </PageContent>
        </AppShell>
    );
};
