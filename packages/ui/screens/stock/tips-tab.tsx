"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Card, ROUTES } from "@/components/meraki/app-shell";
import type { ActiveFilters } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar } from "@/components/meraki/data-table-toolbar";
import { locationName, stockRows, tipMatrix } from "@/data/inventory";
import type { LocationId } from "@/data/types";
import { cx } from "@/utils/cx";
import { NothingHere, norm, plural } from "./stock-shared";

const sizeOrder = (size: string) => (size.toUpperCase() === "OO" ? -1 : Number(size));
const lengthLabel = (length: string) => (/^x[\s-]?short$/i.test(length) ? "X-Short" : length);

type TipView = "all" | "gaps" | "empty";

/** Gel-X tips as a shape and length by size matrix. The matrix is unchanged; the bar above it narrows the rows. */
export const TipsTab = ({ location, onViewLynnfield }: { location: LocationId; onViewLynnfield: () => void }) => {
    const tracked = stockRows(location, "tips").length > 0;
    const sizes = useMemo(() => [...new Set(tipMatrix.flatMap((t) => Object.keys(t.bySize)))].sort((a, b) => sizeOrder(a) - sizeOrder(b)), []);
    const [view, setView] = useState<TipView>("all");
    const [query, setQuery] = useState("");
    const [filters, setFilters] = useState<ActiveFilters>({});

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

    const gapsIn = (t: (typeof tipMatrix)[number]) => sizes.filter((sz) => (t.bySize[sz] ?? 0) === 0).length;
    const inView = (t: (typeof tipMatrix)[number], v: TipView) => v === "all" || (v === "empty" ? t.total === 0 : gapsIn(t) > 0);
    const shapes = [...new Set(tipMatrix.map((t) => t.shape))];
    const picked = filters.shape ?? [];
    const q = norm(query);
    const sets = tipMatrix.filter(
        (t) =>
            inView(t, view) && (picked.length === 0 || picked.includes(t.shape)) && (!q || norm(`${t.shape} ${t.length} ${lengthLabel(t.length)}`).includes(q)),
    );

    const boxes = sets.reduce((n, t) => n + t.total, 0);
    const gaps = sets.reduce((n, t) => n + gapsIn(t), 0);
    const columnTotal = (sz: string) => sets.reduce((n, t) => n + (t.bySize[sz] ?? 0), 0);

    return (
        <div className="flex flex-col gap-3">
            <DataTableToolbar
                label="Gel-X tip sets"
                views={[
                    { id: "all", label: "All sets", count: tipMatrix.length },
                    { id: "gaps", label: "Missing a size", count: tipMatrix.filter((t) => inView(t, "gaps")).length },
                    { id: "empty", label: "None on hand", count: tipMatrix.filter((t) => inView(t, "empty")).length },
                ]}
                view={view}
                onViewChange={(id) => setView(id as TipView)}
                query={query}
                onQueryChange={setQuery}
                searchPlaceholder="Search by shape or length"
                compactSearchPlaceholder="Search tips"
                filters={[
                    { id: "shape", label: "Shape", options: shapes.map((s) => ({ id: s, label: s, count: tipMatrix.filter((t) => t.shape === s).length })) },
                ]}
                activeFilters={filters}
                onFiltersChange={setFilters}
            />

            {sets.length === 0 ? (
                <NothingHere title="No tip sets match">Try a different shape or length, or clear the view and filters.</NothingHere>
            ) : (
                <Card padded={false} className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-secondary px-4 py-3 lg:px-5">
                        <div>
                            <h2 className="text-md font-semibold text-primary">Aprés Gel-X tips by size</h2>
                            <p className="text-sm text-tertiary">
                                {plural(sets.length, "set")}, {plural(boxes, "box", "boxes")} on hand, {plural(gaps, "size")} missing. From the tip sheet.
                            </p>
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
                                {sets.map((t, i) => {
                                    const newShape = sets[i - 1]?.shape !== t.shape;
                                    const border = cx("border-secondary", i > 0 && (newShape ? "border-t-2" : "border-t"));
                                    return (
                                        <tr key={t.itemId}>
                                            <th
                                                scope="row"
                                                className={cx(
                                                    "sticky left-0 z-10 bg-primary px-4 py-0 text-left font-normal whitespace-nowrap lg:px-5",
                                                    border,
                                                )}
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
                                        {sets.length === tipMatrix.length ? "All shapes" : "Shown"}
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
            )}
        </div>
    );
};
