"use client";

import { useState } from "react";
import { Check, Copy01, Printer } from "@untitledui/icons";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { getItem, getStock, locations } from "@/data/inventory";
import type { LocationId, PurchaseOrder, PurchaseOrderLine, Vendor } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { draftPickList } from "@/engine/order-send";
import { formatCount } from "@/engine/stock";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";

/**
 * Printing: drop everything that is not the list or one of its ancestors, so the list flows from
 * the top of the sheet and across pages. Scoped to the `data-pick-list` attribute so nothing else
 * is affected. This belongs in a print stylesheet once the app has one.
 */
const PRINT_CSS = `@media print {
  body *:not(:has([data-pick-list])):not([data-pick-list]):not([data-pick-list] *) { display: none !important; }
}`;

interface PickRow {
    line: PurchaseOrderLine;
    detail: string;
    quantity: string;
    /** Where the item lives at this location, when it is in the catalogue. */
    place?: string;
}

const rowsFor = (po: PurchaseOrder, locationId: LocationId): PickRow[] =>
    po.lines
        .filter((l) => l.qtyOrdered > 0)
        .map((line) => {
            const item = line.itemId ? getItem(line.itemId) : undefined;
            const level = line.itemId ? getStock(line.itemId, locationId) : undefined;
            return {
                line,
                detail: [line.colorCode ?? line.sku ?? item?.sku, line.variant].filter(Boolean).join(" · "),
                quantity: item?.unit ? formatCount(line.qtyOrdered, item.unit) : String(line.qtyOrdered),
                place: level ? [level.area, level.shelf && `shelf ${level.shelf}`].filter(Boolean).join(", ") : undefined,
            };
        })
        // Shelf order, so the list reads the way the storeroom is laid out. Lines with no shelf go last.
        .sort((a, b) => (a.place === undefined ? 1 : 0) - (b.place === undefined ? 1 : 0) || (a.place ?? "").localeCompare(b.place ?? ""));

interface PickListProps {
    po: PurchaseOrder;
    vendor: Vendor;
    /** The location the order is for. Defaults to the order's own. */
    locationId?: LocationId;
    className?: string;
}

/**
 * Checklist for an in-store run: one row per line with a box to tick as it goes in the cart.
 * Prints on its own (the rest of the page is hidden) and copies as plain text.
 */
export const PickList = ({ po, vendor, locationId = po.locationId, className }: PickListProps) => {
    const [picked, setPicked] = useState<string[]>([]);
    const { copied, copy } = useClipboard();
    const place = locations.find((l) => l.id === locationId)?.name ?? locationId;
    const rows = rowsFor(po, locationId);
    const done = rows.filter((r) => picked.includes(r.line.id)).length;
    const hasPlaces = rows.some((r) => r.place);
    const sub = (r: PickRow) => [r.detail, r.place ?? (hasPlaces ? "Not in the catalogue" : "")].filter(Boolean).join(" · ");

    return (
        <div data-pick-list className={cx("flex flex-col gap-3 print:gap-4 print:p-6", className)}>
            <style>{PRINT_CSS}</style>

            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 className="text-md font-semibold text-primary">{vendor.name} pick list</h3>
                    <p className="text-sm text-tertiary">
                        {po.number} · {place} · {formatDate(po.createdAt, true)}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <Button color="secondary" size="md" iconLeading={Printer} onClick={() => window.print()}>
                        Print
                    </Button>
                    <Button
                        color="tertiary"
                        size="md"
                        iconLeading={copied === "pick-list" ? Check : Copy01}
                        onClick={() => copy(draftPickList(po, vendor, place), "pick-list")}
                    >
                        {copied === "pick-list" ? "Copied" : "Copy as text"}
                    </Button>
                </div>
            </div>

            <p role="status" className="text-sm font-medium text-secondary tabular-nums print:hidden">
                {done} of {rows.length} picked
            </p>

            <ul className="divide-y divide-secondary overflow-hidden rounded-lg ring-1 ring-secondary ring-inset print:overflow-visible print:rounded-none print:ring-0">
                {rows.map((r) => {
                    const on = picked.includes(r.line.id);
                    return (
                        <li key={r.line.id} className="break-inside-avoid">
                            <AriaCheckbox
                                isSelected={on}
                                onChange={(v) => setPicked((prev) => (v ? [...prev, r.line.id] : prev.filter((id) => id !== r.line.id)))}
                                className={cx(
                                    "flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5 transition duration-100 ease-linear hover:bg-primary_hover print:px-0 print:py-2",
                                    on && "bg-secondary print:bg-transparent",
                                )}
                            >
                                {({ isSelected, isFocusVisible }) => (
                                    <>
                                        <CheckboxBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} className="print:hidden" />
                                        {/* Rings do not print, so the sheet gets a plain bordered box to tick with a pen. */}
                                        <span aria-hidden="true" className="hidden size-4 shrink-0 rounded-xs border border-primary print:block" />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span
                                                className={cx(
                                                    "text-sm font-semibold text-primary",
                                                    on && "text-tertiary line-through print:text-primary print:no-underline",
                                                )}
                                            >
                                                {r.line.name}
                                            </span>
                                            {sub(r) && <span className="text-xs text-tertiary">{sub(r)}</span>}
                                        </span>
                                        <span className="shrink-0 text-right text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
                                            {r.quantity}
                                        </span>
                                    </>
                                )}
                            </AriaCheckbox>
                        </li>
                    );
                })}
            </ul>

            <p className="text-xs text-tertiary print:hidden">
                Ticks stay on this screen only. The shelf is where each item is kept at {place.replace(/^Meraki /, "")}, for putting the order away.
            </p>
        </div>
    );
};
