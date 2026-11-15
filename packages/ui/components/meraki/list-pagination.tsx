"use client";

import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { NativeSelect } from "@/components/base/select/select-native";
import { cx } from "@/utils/cx";

/** How many rows a list can show at once. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

/** A page size from a link or a prop, if it is one of the sizes offered. */
export const toPageSize = (value: number | string | undefined): PageSize | undefined => PAGE_SIZES.find((size) => size === Number(value));

/** One page of a list. `page` is clamped, so a link to page 9 of a list that now has 3 pages opens page 3. */
export const paginate = <T,>(rows: T[], page: number, pageSize: number) => {
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
    const start = (current - 1) * pageSize;
    return {
        rows: rows.slice(start, start + pageSize),
        page: current,
        pages,
        /** Position of the first and last row shown, counting from 1. Both 0 when the list is empty. */
        from: rows.length ? start + 1 : 0,
        to: Math.min(start + pageSize, rows.length),
    };
};

export interface ListPaginationProps {
    /** The page shown, counting from 1. */
    page: number;
    pageSize: PageSize;
    /** How many rows match the current view and filters, across every page. */
    total: number;
    /** What a row is, plural: "supplies", "colours". */
    noun?: string;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: PageSize) => void;
    /** Scrolled back into view when the page changes, so the new page starts at its first row. */
    scrollTo?: RefObject<HTMLElement | null>;
    className?: string;
}

/**
 * The foot of a list: how many rows to show, which rows are showing, and a step back or forward.
 *
 *   Items per page  [50 v]    <  51-100 of 333  >
 *
 * One line on desktop, grouped at the right. On a phone the two parts stack, each across the full
 * width, so the arrows sit at the edges where thumbs reach.
 *
 * The screen keeps `page` and `pageSize` in the URL (`?page=3&per=25`), so every page of a list has
 * an address that can be bookmarked or sent to someone. Renders nothing when the list fits within
 * the smallest page size, because there is then nothing to choose.
 */
export const ListPagination = ({ page, pageSize, total, noun = "rows", onPageChange, onPageSizeChange, scrollTo, className }: ListPaginationProps) => {
    if (total <= PAGE_SIZES[0]) return null;

    const { page: current, pages, from, to } = paginate(Array.from({ length: total }), page, pageSize);
    const goTo = (next: number) => {
        onPageChange(next);
        // After the new rows are in place, bring the top of the list back into view.
        requestAnimationFrame(() => scrollTo?.current?.scrollIntoView({ block: "start" }));
    };

    return (
        <div className={cx("flex flex-col gap-1 text-sm lg:flex-row lg:items-center lg:justify-end lg:gap-6", className)}>
            <label className="flex shrink-0 items-center justify-between gap-2 whitespace-nowrap text-tertiary lg:justify-start">
                Items per page
                <NativeSelect
                    aria-label={`${noun} per page`}
                    size="sm"
                    // As wide as its number, not the whole row.
                    className="w-auto"
                    value={String(pageSize)}
                    onChange={(event) => {
                        const next = toPageSize(event.currentTarget.value);
                        if (next) onPageSizeChange(next);
                    }}
                    options={PAGE_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
                    // Room for the dropdown arrow, which sits over the right edge of the select.
                    selectClassName="pr-8 max-lg:min-h-11 tabular-nums"
                    data-testid="page-size"
                />
            </label>

            <nav aria-label={`Pages of ${noun}`} className="flex shrink-0 items-center justify-between gap-1 lg:justify-start">
                <ButtonUtility
                    icon={ChevronLeft}
                    color="tertiary"
                    size="sm"
                    tooltip="Previous page"
                    aria-label="Previous page"
                    isDisabled={current <= 1}
                    onPress={() => goTo(current - 1)}
                    className="max-lg:size-11"
                    data-testid="page-prev"
                />
                <p aria-live="polite" className="min-w-0 px-1 font-medium whitespace-nowrap text-secondary tabular-nums" data-testid="page-range">
                    {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} <span className="font-normal text-tertiary">of</span>{" "}
                    {total.toLocaleString("en-US")}
                    <span className="sr-only"> {noun}</span>
                </p>
                <ButtonUtility
                    icon={ChevronRight}
                    color="tertiary"
                    size="sm"
                    tooltip="Next page"
                    aria-label="Next page"
                    isDisabled={current >= pages}
                    onPress={() => goTo(current + 1)}
                    className="max-lg:size-11"
                    data-testid="page-next"
                />
            </nav>
        </div>
    );
};
