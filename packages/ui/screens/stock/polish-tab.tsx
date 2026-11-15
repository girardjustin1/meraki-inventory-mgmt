"use client";

import { useMemo, useRef, useState } from "react";
import { ShoppingCart01 } from "@untitledui/icons";
import { Link as AriaLink } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { Card, ROUTES } from "@/components/meraki/app-shell";
import type { ActiveFilters, ToolbarFilter } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar } from "@/components/meraki/data-table-toolbar";
import { ItemThumb } from "@/components/meraki/item-thumb";
import type { PageSize } from "@/components/meraki/list-pagination";
import { ListPagination, paginate } from "@/components/meraki/list-pagination";
import { QuantityEditPopover } from "@/components/meraki/quantity-edit-popover";
import type { StockRow } from "@/data/inventory";
import { locationName, stockRows } from "@/data/inventory";
import type { LocationId, PolishLine, StockVariant, User, VariantId } from "@/data/types";
import { can } from "@/engine/permissions";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { NothingHere, norm, plural } from "./stock-shared";

const LINES: { id: PolishLine; label: string }[] = [
    { id: "opi", label: "OPI" },
    { id: "opi-dip", label: "OPI dip" },
    { id: "dnd", label: "DND" },
    { id: "dazzle-dry", label: "Dazzle Dry" },
    { id: "chisel", label: "Chisel" },
];

const FINISHES: { id: VariantId; label: string }[] = [
    { id: "regular", label: "Regular" },
    { id: "gel", label: "Gel" },
    { id: "dip", label: "Dip" },
];

type Availability = "all" | "in" | "out" | "reorder";

const finishOf = (r: StockRow, finish: VariantId | undefined): StockVariant | undefined =>
    finish ? r.level.variants?.find((v) => v.id === finish) : undefined;

/** Bottles to show for a colour: one finish when the wall is filtered to it, otherwise every finish together. */
const shownQty = (r: StockRow, finish: VariantId | undefined) => finishOf(r, finish)?.onHand ?? r.level.onHand;

const available = (r: StockRow, view: Availability, finish?: VariantId) =>
    view === "all" || (view === "in" ? shownQty(r, finish) > 0 : view === "out" ? shownQty(r, finish) <= 0 : r.level.reorderRequested);

const finishSummary = (variants: StockVariant[]) => variants.map((v) => `${v.label} ${v.onHand}`).join(" · ");

interface PolishTabProps {
    location: LocationId;
    user: User;
    onViewLynnfield: () => void;
    initialLine: PolishLine | "all";
    initialFinish?: VariantId;
    initialQuery: string;
    /** Page to open on, counting from 1 (deep link `?page=`). */
    initialPage: number;
    /** Colours per page. Shared with the other stock tabs, so the screen owns it. */
    pageSize: PageSize;
    onPageSizeChange: (size: PageSize) => void;
}

/** The polish wall as swatches. Line and colour family are filters in the same bar the supplies use. */
export const PolishTab = ({
    location,
    user,
    onViewLynnfield,
    initialLine,
    initialFinish,
    initialQuery,
    initialPage,
    pageSize,
    onPageSizeChange,
}: PolishTabProps) => {
    const canAdjust = can(user, "stock.adjust", location);
    const baseRows = useMemo(() => stockRows(location, "polish"), [location]);
    // Backstock changed on this screen, keyed by colour or by "colour:finish". On hand is the open bottles plus the spares.
    const [backstock, setBackstock] = useState<Record<string, number>>({});
    const rows = useMemo(
        () =>
            baseRows.map((r) => {
                if (r.level.variants) {
                    if (!r.level.variants.some((v) => backstock[`${r.item.id}:${v.id}`] !== undefined)) return r;
                    const variants = r.level.variants.map((v) => {
                        const spare = backstock[`${r.item.id}:${v.id}`];
                        return spare === undefined ? v : { ...v, backstock: spare, onHand: v.inUse + spare };
                    });
                    // Dip is its own catalogue item, so the colour's total is its lacquer and gel bottles.
                    const own = variants.filter((v) => !v.linkedItemId);
                    return {
                        ...r,
                        level: {
                            ...r.level,
                            variants,
                            inUse: own.reduce((n, v) => n + v.inUse, 0),
                            backstock: own.reduce((n, v) => n + v.backstock, 0),
                            onHand: own.reduce((n, v) => n + v.onHand, 0),
                        },
                    };
                }
                const spare = backstock[r.item.id];
                return spare === undefined ? r : { ...r, level: { ...r.level, backstock: spare, onHand: (r.level.inUse ?? 0) + spare } };
            }),
        [baseRows, backstock],
    );

    const [filters, setFilters] = useState<ActiveFilters>({
        ...(initialLine === "all" ? {} : { line: [initialLine] }),
        ...(initialFinish ? { finish: [initialFinish] } : {}),
    });
    const [view, setView] = useState<Availability>("all");
    const [query, setQuery] = useState(initialQuery);
    const [pageNumber, setPageNumber] = useState(initialPage);
    const listTop = useRef<HTMLDivElement>(null);

    const line = (filters.line?.[0] ?? "all") as PolishLine | "all";
    const families = filters.family ?? [];
    const finish = filters.finish?.[0] as VariantId | undefined;
    // Every page of the wall has its own address: /stock?tab=polish&page=3. Page 1 is the plain address.
    useUrlSync({ line: line === "opi" ? null : line, finish: finish ?? null, q: query, page: pageNumber > 1 ? pageNumber : null });

    const lineRows = useMemo(() => (line === "all" ? rows : rows.filter((r) => r.item.line === line)), [rows, line]);
    // Filtered to a finish, the wall holds only the colours stocked in that finish.
    const inLine = useMemo(() => (finish ? lineRows.filter((r) => finishOf(r, finish)) : lineRows), [lineRows, finish]);

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const perLine = new Map<string, number>();
        for (const r of rows) perLine.set(r.item.line ?? "", (perLine.get(r.item.line ?? "") ?? 0) + 1);
        const perFamily = new Map<string, number>();
        for (const r of inLine) if (r.item.colorFamily) perFamily.set(r.item.colorFamily, (perFamily.get(r.item.colorFamily) ?? 0) + 1);
        const perFinish = new Map<VariantId, number>();
        for (const r of lineRows) for (const v of r.level.variants ?? []) perFinish.set(v.id, (perFinish.get(v.id) ?? 0) + 1);
        return [
            { id: "line", label: "Line", multiple: false, options: LINES.map((l) => ({ id: l.id, label: l.label, count: perLine.get(l.id) ?? 0 })) },
            ...(perFinish.size > 0
                ? [
                      {
                          id: "finish",
                          label: "Finish",
                          multiple: false,
                          options: FINISHES.filter((f) => perFinish.has(f.id)).map((f) => ({ id: f.id, label: f.label, count: perFinish.get(f.id) ?? 0 })),
                      },
                  ]
                : []),
            ...(perFamily.size > 1 ? [{ id: "family", label: "Colour family", options: [...perFamily].map(([id, count]) => ({ id, label: id, count })) }] : []),
        ];
    }, [rows, lineRows, inLine]);

    if (!baseRows.length) {
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

    const q = norm(query);
    const matchesQuery = (r: StockRow) =>
        !q || norm(`${r.item.name} ${r.item.colorCode ?? ""} ${r.item.sku ?? ""} ${r.item.brand ?? ""}${r.item.colorCode ?? ""}`).includes(q);
    const filtered = inLine.filter(
        (r) => matchesQuery(r) && (families.length === 0 || families.includes(r.item.colorFamily ?? "")) && available(r, view, finish),
    );
    const elsewhere = q && line !== "all" ? rows.filter((r) => r.item.line !== line && matchesQuery(r)).length : 0;

    const paged = paginate(filtered, pageNumber, pageSize);
    const page = paged.rows;
    const reset = () => setPageNumber(1);

    const views = [
        { id: "all", label: "All", count: inLine.length },
        { id: "in", label: "In stock", count: inLine.filter((r) => available(r, "in", finish)).length },
        { id: "out", label: "Out", count: inLine.filter((r) => available(r, "out", finish)).length },
        { id: "reorder", label: "Reorder requested", count: inLine.filter((r) => available(r, "reorder")).length },
    ];

    return (
        <div ref={listTop} className="flex scroll-mt-20 flex-col gap-3">
            <DataTableToolbar
                label="polish colours"
                views={views}
                view={view}
                onViewChange={(id) => {
                    setView(id as Availability);
                    reset();
                }}
                query={query}
                onQueryChange={(value) => {
                    setQuery(value);
                    reset();
                }}
                searchPlaceholder="Search by colour name, code or SKU"
                compactSearchPlaceholder="Search colours"
                filters={filterDefs}
                activeFilters={filters}
                onFiltersChange={(next) => {
                    // Colour families and finishes belong to a line, so changing the line starts those filters again.
                    const lineChanged = next.line?.[0] !== filters.line?.[0];
                    setFilters(lineChanged ? Object.fromEntries(Object.entries(next).filter(([id]) => id !== "family" && id !== "finish")) : next);
                    reset();
                }}
                summary={
                    filtered.length > page.length
                        ? `${paged.from.toLocaleString("en-US")}–${paged.to.toLocaleString("en-US")} of ${plural(filtered.length, "colour")}`
                        : plural(filtered.length, "colour")
                }
            />

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-tertiary">
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
                <span>
                    {finish
                        ? `×3: ${FINISHES.find((f) => f.id === finish)?.label} ${finish === "dip" ? "jars" : "bottles"} on hand${canAdjust && finish !== "dip" ? ". Select it to change the backstock" : ""}`
                        : `×3: bottles on hand, every finish together${canAdjust ? ". Filter by finish to change one here" : ""}`}
                </span>
            </p>

            {elsewhere > 0 && (
                <p className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-tertiary ring-1 ring-secondary ring-inset">
                    {plural(elsewhere, "match", "matches")} in other lines.
                    <Button
                        color="link-color"
                        size="sm"
                        onClick={() => {
                            setFilters({});
                            reset();
                        }}
                    >
                        Search all lines
                    </Button>
                </p>
            )}

            {filtered.length === 0 ? (
                <NothingHere title="No colours match">Try a different name or code, or clear the view and filters.</NothingHere>
            ) : (
                <Card padded={false} className="p-2 lg:p-3">
                    <ul className="grid grid-cols-3 gap-1 xs:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
                        {page.map((r) => {
                            const variants = r.level.variants;
                            const variant = finishOf(r, finish);
                            const qty = variant?.onHand ?? r.level.onHand;
                            const out = qty <= 0;
                            const inUse = variant?.inUse ?? r.level.inUse ?? 0;
                            const spare = variant?.backstock ?? r.level.backstock ?? Math.max(0, r.level.onHand - inUse);
                            const key = variant ? `${r.item.id}:${variant.id}` : r.item.id;
                            const edited = variants ? variants.some((v) => backstock[`${r.item.id}:${v.id}`] !== undefined) : backstock[key] !== undefined;
                            const unit = variant?.id === "dip" ? "jar" : "bottle";
                            const detail = variants && !variant ? finishSummary(variants) : `In use ${inUse} · Backstock ${spare}`;
                            // A dip count belongs to the dip-powder item; a colour with finishes is edited one finish at a time.
                            const linkTo = variant?.linkedItemId ?? (variants && !variant ? r.item.id : undefined);
                            const countClass = cx(
                                "min-h-7 px-1.5 text-xs font-medium max-lg:min-h-9",
                                edited ? "text-brand-secondary" : out ? "text-error-primary" : "text-tertiary",
                            );
                            return (
                                <li
                                    key={r.item.id}
                                    className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 gap-y-1 rounded-lg p-1.5 transition duration-100 ease-linear hover:bg-primary_hover"
                                >
                                    <Tooltip title={detail} delay={500}>
                                        <AriaLink
                                            href={ROUTES.item(r.item.id)}
                                            aria-label={`${r.item.colorCode ?? ""} ${r.item.name}${variant ? `, ${variant.label}` : ""}, ${out ? "out of stock" : plural(qty, unit)}, ${detail}${r.level.reorderRequested ? ", reorder requested" : ""}`}
                                            className="relative col-span-2 block aspect-4/3 w-full rounded-lg outline-focus-ring after:absolute after:-inset-x-1.5 after:-top-1.5 after:-bottom-12 focus-visible:outline-2 focus-visible:outline-offset-2"
                                        >
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
                                        </AriaLink>
                                    </Tooltip>
                                    <span aria-hidden="true" className="truncate text-xs font-semibold text-primary">
                                        {r.item.colorCode}
                                    </span>
                                    <span className="relative z-10 -my-1.5 -mr-1">
                                        {linkTo ? (
                                            <Tooltip
                                                title={
                                                    variant
                                                        ? "Dip powder is its own item. Open it to change the count."
                                                        : `${detail}. Open the colour to change a finish.`
                                                }
                                            >
                                                <AriaLink
                                                    href={ROUTES.item(linkTo)}
                                                    aria-label={`${r.item.name}: ${plural(qty, unit)}. ${variant ? "Open the dip powder" : "Open the colour to change a finish"}`}
                                                    className={cx(
                                                        countClass,
                                                        "inline-flex items-center rounded-md outline-focus-ring transition duration-100 ease-linear hover:bg-secondary focus-visible:outline-2",
                                                    )}
                                                >
                                                    <span className="tabular-nums">×{qty}</span>
                                                </AriaLink>
                                            </Tooltip>
                                        ) : (
                                            <QuantityEditPopover
                                                item={r.item}
                                                level={{ onHand: spare }}
                                                quantityLabel={variant ? `${variant.label} backstock` : "Backstock"}
                                                context={`In use ${inUse} · Backstock ${spare} · On hand ${qty}`}
                                                isDisabled={!canAdjust}
                                                triggerClassName={countClass}
                                                onSave={(change) => {
                                                    if (change.onHand !== undefined) setBackstock({ ...backstock, [key]: change.onHand });
                                                }}
                                            >
                                                <span className="tabular-nums">×{qty}</span>
                                            </QuantityEditPopover>
                                        )}
                                    </span>
                                    <span aria-hidden="true" className="col-span-2 truncate text-xs text-tertiary">
                                        {r.item.name}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </Card>
            )}

            <ListPagination
                page={paged.page}
                pageSize={pageSize}
                total={filtered.length}
                noun="colours"
                onPageChange={setPageNumber}
                onPageSizeChange={(size) => {
                    onPageSizeChange(size);
                    setPageNumber(1);
                }}
                scrollTo={listTop}
            />
        </div>
    );
};
