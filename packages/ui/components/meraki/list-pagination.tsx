"use client";

import type { RefObject } from "react";
import { ArrowLeft, ArrowRight } from "@untitledui/icons";
import { Pagination } from "@/components/application/pagination/pagination-base";
import { Button } from "@/components/base/buttons/button";
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

const itemClass = (isSelected: boolean) =>
    cx(
        "flex size-9 cursor-pointer items-center justify-center rounded-lg text-sm font-medium tabular-nums outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2",
        isSelected ? "bg-primary text-primary shadow-xs ring-1 ring-secondary ring-inset" : "text-tertiary",
    );

/**
 * The foot of a list: how many rows to show, which rows are showing, and the pages.
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

    const sizePicker = (
        <label className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap text-tertiary">
            Show
            <NativeSelect
                aria-label={`${noun} per page`}
                size="sm"
                value={String(pageSize)}
                onChange={(event) => {
                    const next = toPageSize(event.currentTarget.value);
                    if (next) onPageSizeChange(next);
                }}
                options={PAGE_SIZES.map((size) => ({ label: String(size), value: String(size) }))}
                selectClassName="max-lg:min-h-11 tabular-nums"
                data-testid="page-size"
            />
            per page
        </label>
    );

    const range = (
        <p aria-live="polite" className="text-sm whitespace-nowrap text-tertiary tabular-nums" data-testid="page-range">
            {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {noun}
        </p>
    );

    return (
        <Pagination.Root
            page={current}
            total={pages}
            onPageChange={goTo}
            className={cx("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6", className)}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:justify-start">
                {sizePicker}
                {range}
            </div>

            {pages > 1 && (
                <nav aria-label={`Pages of ${noun}`} className="flex items-center justify-between gap-2 lg:justify-end">
                    <Pagination.PrevTrigger asChild>
                        <Button color="secondary" size="sm" iconLeading={ArrowLeft} className="max-lg:min-h-11 max-lg:px-4" data-testid="page-prev">
                            Previous
                        </Button>
                    </Pagination.PrevTrigger>

                    <Pagination.Context>
                        {({ pages: items, currentPage, total: pageCount }) => (
                            <>
                                <div className="hidden items-center gap-0.5 lg:flex">
                                    {items.map((item, index) =>
                                        item.type === "page" ? (
                                            <Pagination.Item
                                                key={index}
                                                value={item.value}
                                                isCurrent={item.isCurrent}
                                                className={({ isSelected }) => itemClass(isSelected)}
                                            >
                                                {item.value}
                                            </Pagination.Item>
                                        ) : (
                                            <Pagination.Ellipsis key={index} className="flex size-9 shrink-0 items-center justify-center text-quaternary">
                                                &#8230;
                                            </Pagination.Ellipsis>
                                        ),
                                    )}
                                </div>
                                <p className="text-sm whitespace-nowrap text-secondary tabular-nums lg:hidden">
                                    Page <span className="font-semibold">{currentPage}</span> of <span className="font-semibold">{pageCount}</span>
                                </p>
                            </>
                        )}
                    </Pagination.Context>

                    <Pagination.NextTrigger asChild>
                        <Button color="secondary" size="sm" iconTrailing={ArrowRight} className="max-lg:min-h-11 max-lg:px-4" data-testid="page-next">
                            Next
                        </Button>
                    </Pagination.NextTrigger>
                </nav>
            )}
        </Pagination.Root>
    );
};
