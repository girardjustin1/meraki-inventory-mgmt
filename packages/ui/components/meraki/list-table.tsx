"use client";

import type { FC, MouseEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { CheckCircle, SearchLg, XClose } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Button } from "@/components/base/buttons/button";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";

/**
 * The pieces a list screen shares, so every list reads the same way: one-line table rows with a
 * checkbox column on desktop, compact cards on a phone, selection that survives Shift-click, an
 * empty state with a way back, and one confirmation strip.
 *
 * Put a `DataTableToolbar` above and pass a `BulkActionBar` as `bulkBar`.
 */

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Lower-case letters and digits only, so a search ignores spaces, dashes and case. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

// ------------------------------------------------------------------------------------ selection

export interface ListSelection {
    /** Selected ids that are in the list now. Rows filtered out of sight are never acted on. */
    ids: string[];
    count: number;
    has: (id: string) => boolean;
    /** Tick or untick one row. With `range`, everything between the last row touched and this one is ticked. */
    toggle: (id: string, range?: boolean) => void;
    allSelected: boolean;
    toggleAll: () => void;
    selectAll: () => void;
    clear: () => void;
    /** Replace the selection (a long press on a phone starts with one row). */
    set: (ids: string[]) => void;
}

/** Row selection for a list. `listed` is every row id on screen now, in order. */
export const useListSelection = (listed: string[], initial: string[] = []): ListSelection => {
    const [picked, setPicked] = useState<Set<string>>(() => new Set(initial));
    // Shift-click range selection: where the last click landed.
    const anchor = useRef<string | null>(null);
    const ids = listed.filter((id) => picked.has(id));
    const allSelected = listed.length > 0 && ids.length === listed.length;

    return {
        ids,
        count: ids.length,
        has: (id) => picked.has(id),
        toggle: (id, range = false) => {
            const next = new Set(ids);
            const from = anchor.current ? listed.indexOf(anchor.current) : -1;
            const to = listed.indexOf(id);
            if (range && from >= 0 && to >= 0 && from !== to) {
                for (const key of listed.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(key);
            } else if (next.has(id)) next.delete(id);
            else next.add(id);
            setPicked(next);
            anchor.current = id;
        },
        allSelected,
        toggleAll: () => setPicked(allSelected ? new Set() : new Set(listed)),
        selectAll: () => setPicked(new Set(listed)),
        clear: () => {
            setPicked(new Set());
            anchor.current = null;
        },
        set: (next) => {
            setPicked(new Set(next));
            anchor.current = next[0] ?? null;
        },
    };
};

interface SelectBoxProps {
    label: string;
    checked: boolean;
    indeterminate?: boolean;
    onChange: () => void;
    /** Shift-click handler. Browsers do not pass a Shift-click on a label through to its checkbox, so the label handles it. */
    onRange?: () => void;
}

/** A checkbox with a 36px hit area, for the first column of a table. */
export const SelectBox = ({ label, checked, indeterminate, onChange, onRange }: SelectBoxProps) => (
    <label
        className="flex size-9 cursor-pointer items-center justify-center select-none"
        onMouseDown={(event) => {
            // Keeps Shift-click from selecting the text between the two rows.
            if (onRange && event.shiftKey) event.preventDefault();
        }}
        onClick={(event) => {
            if (!onRange || !event.shiftKey) return;
            event.preventDefault();
            onRange();
        }}
    >
        <input type="checkbox" className="peer sr-only" aria-label={label} checked={checked} onChange={onChange} />
        <CheckboxBase
            size="md"
            isSelected={checked}
            isIndeterminate={indeterminate}
            className="peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring"
        />
    </label>
);

// ------------------------------------------------------------------------------------ desktop table

export interface ListColumn<T> {
    id: string;
    label: string;
    /** Definition shown when the header is hovered or focused. The header gets a dotted underline. */
    tooltip?: string;
    /** Right-align and use tabular figures: for numbers. */
    align?: "right";
    /** The column that takes the spare width. Its cell should hold the row's `RowLink`. */
    primary?: boolean;
    /** Nice to have: only shown when the window is at least 1400px wide, where the table has room beside the sidebar. */
    wideOnly?: boolean;
    cell: (row: T) => ReactNode;
}

/** Column header with an optional definition: dotted underline, tooltip on hover and focus. */
export const ColumnLabel = ({ label, tooltip }: { label: string; tooltip?: string }) =>
    tooltip ? (
        <Tooltip title={tooltip} placement="top">
            <TooltipTrigger className="cursor-help rounded-xs text-xs font-semibold whitespace-nowrap text-quaternary underline decoration-fg-quaternary decoration-dotted underline-offset-4 outline-focus-ring focus-visible:outline-2">
                {label}
            </TooltipTrigger>
        </Tooltip>
    ) : (
        <span className="text-xs font-semibold whitespace-nowrap text-quaternary">{label}</span>
    );

/** The real link in a row: keyboard and screen readers use it, and a click anywhere on the row follows it. */
export const RowLink = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a
        data-row-link
        href={href}
        className={cx(
            "min-w-0 truncate rounded-xs text-sm font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
            className,
        )}
    >
        {children}
    </a>
);

// The whole row opens the record, like a link. Clicks on the checkbox or any other control are left alone.
const openRow = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as HTMLElement;
    if (!event.currentTarget.contains(target) || target.closest("a, button, input, label")) return;
    event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
};

interface ListTableProps<T> {
    /** Accessible name of the table: "Orders at Lynnfield". */
    label: string;
    /** Plural noun for the select-all checkbox: "orders". */
    noun: string;
    rows: T[];
    rowId: (row: T) => string;
    /** What a row is called in its checkbox label: "Select PO-LYN-2611-S1". */
    rowName: (row: T) => string;
    columns: ListColumn<T>[];
    selection: ListSelection;
    /** The `BulkActionBar`. It lies over the column headers while rows are selected. */
    bulkBar?: ReactNode;
}

/** Desktop list: one line per row, a checkbox column, and the whole row opening the record. */
export const ListTable = <T,>({ label, noun, rows, rowId, rowName, columns, selection, bulkBar }: ListTableProps<T>) => (
    <div className="relative rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
        {selection.count > 0 && bulkBar && (
            // Zero-height sticky holder: the bar lies over the column headers and follows the page when it scrolls.
            <div className="sticky top-0 z-20 h-0">{bulkBar}</div>
        )}
        {/* relative: keeps visually hidden text inside the scroll area, so a wide table never widens the page. */}
        <div className="relative overflow-x-auto rounded-xl">
            <table className="w-full text-sm" aria-label={label}>
                <thead>
                    <tr className="h-10 bg-secondary">
                        <th scope="col" className="w-12 border-b border-secondary py-0 pr-0 pl-3 text-left">
                            <SelectBox
                                label={selection.allSelected ? "Clear selection" : `Select the ${noun} shown`}
                                checked={selection.allSelected}
                                indeterminate={selection.count > 0 && !selection.allSelected}
                                onChange={selection.toggleAll}
                            />
                        </th>
                        {columns.map((c) => (
                            <th
                                key={c.id}
                                scope="col"
                                className={cx(
                                    "border-b border-secondary px-3 last:pr-5",
                                    c.primary && "w-full",
                                    c.wideOnly && "max-[1399px]:hidden",
                                    c.align === "right" ? "text-right" : "text-left",
                                )}
                            >
                                <ColumnLabel label={c.label} tooltip={c.tooltip} />
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const id = rowId(row);
                        const isSelected = selection.has(id);
                        return (
                            <tr
                                key={id}
                                data-row={id}
                                onClick={openRow}
                                className={cx(
                                    "h-12 cursor-pointer transition duration-100 ease-linear [&:not(:last-child)>td]:border-b [&>td]:border-secondary",
                                    isSelected ? "bg-brand-primary_alt" : "hover:bg-primary_hover",
                                )}
                            >
                                <td className="py-0 pr-0 pl-3">
                                    <SelectBox
                                        label={`Select ${rowName(row)}`}
                                        checked={isSelected}
                                        onChange={() => selection.toggle(id)}
                                        onRange={() => selection.toggle(id, true)}
                                    />
                                </td>
                                {columns.map((c) => (
                                    <td
                                        key={c.id}
                                        className={cx(
                                            "px-3 whitespace-nowrap text-secondary last:pr-5",
                                            // Takes the spare width and truncates before the table has to scroll, but never below 11rem.
                                            c.primary && "w-full max-w-0 min-w-44 py-1.5",
                                            c.wideOnly && "max-[1399px]:hidden",
                                            c.align === "right" && "text-right tabular-nums",
                                        )}
                                    >
                                        {c.primary ? <div className="flex items-center gap-2.5">{c.cell(row)}</div> : c.cell(row)}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

/** The `className` a `BulkActionBar` needs to sit over a `ListTable` header. */
export const BULK_BAR_OVER_HEADER = "absolute inset-x-0 top-0 rounded-t-xl border-b border-secondary shadow-xs";

// ------------------------------------------------------------------------------------ phone cards

interface ListCardsProps<T> {
    label: string;
    rows: T[];
    rowId: (row: T) => string;
    href: (row: T) => string;
    selection: ListSelection;
    /** Selecting: a tap ticks the row. Otherwise a tap opens it and a long press starts selecting. */
    selectMode: boolean;
    onSelectMode: (on: boolean) => void;
    /** One or two lines for the row. Not interactive: the whole card is the link (or the checkbox). */
    card: (row: T) => ReactNode;
}

/** Phone list: one compact card per row. */
export const ListCards = <T,>({ label, rows, rowId, href, selection, selectMode, onSelectMode, card }: ListCardsProps<T>) => {
    // A long press starts selecting; the tap that ends it must not open the row.
    const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const swallowUntil = useRef(0);
    const endPress = () => {
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = null;
    };
    const rowClass =
        "flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left outline-focus-ring select-none [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:-outline-offset-2";

    return (
        <ul aria-label={label} className="divide-y divide-secondary rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
            {rows.map((row) => {
                const id = rowId(row);
                const isSelected = selection.has(id);
                return (
                    <li key={id} data-row={id} className={cx("flex items-stretch first:rounded-t-xl last:rounded-b-xl", isSelected && "bg-brand-primary_alt")}>
                        {selectMode ? (
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={isSelected}
                                onClick={() => {
                                    // The finger lifting after a long press is not a second tap.
                                    if (Date.now() > swallowUntil.current) selection.toggle(id);
                                }}
                                className={cx(rowClass, "cursor-pointer")}
                            >
                                <CheckboxBase size="md" isSelected={isSelected} />
                                <span className="min-w-0 flex-1">{card(row)}</span>
                            </button>
                        ) : (
                            <a
                                href={href(row)}
                                className={rowClass}
                                onPointerDown={() => {
                                    pressTimer.current = setTimeout(() => {
                                        swallowUntil.current = Date.now() + 700;
                                        onSelectMode(true);
                                        selection.set([id]);
                                    }, 500);
                                }}
                                onPointerUp={endPress}
                                onPointerLeave={endPress}
                                onPointerCancel={endPress}
                                onContextMenu={(event) => event.preventDefault()}
                                onClick={(event) => {
                                    if (Date.now() < swallowUntil.current) event.preventDefault();
                                }}
                            >
                                <span className="min-w-0 flex-1">{card(row)}</span>
                            </a>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

/** The line above the cards on a phone: how many rows, and the way into (and out of) selecting. */
export const SelectModeRow = ({ summary, selectMode, onToggle }: { summary: ReactNode; selectMode: boolean; onToggle: () => void }) => (
    <div className="-my-1 flex items-center justify-between gap-3 pl-1">
        <p className="text-sm text-tertiary" aria-live="polite">
            {summary}
        </p>
        <Button color="link-color" size="sm" className="min-h-11 px-2" data-testid="select-mode" onClick={onToggle}>
            {selectMode ? "Done" : "Select"}
        </Button>
    </div>
);

// ------------------------------------------------------------------------------------ empty and notice

/** Nothing to list: say why, and offer the way back. */
export const ListEmpty = ({
    title,
    children,
    action,
    icon = SearchLg,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
    icon?: FC<{ className?: string }>;
}) => (
    <section data-testid="list-empty" className="rounded-xl bg-primary px-4 py-10 shadow-xs ring-1 ring-secondary ring-inset lg:py-14">
        <EmptyState size="sm">
            <EmptyState.Header pattern="none">
                <EmptyState.FeaturedIcon icon={icon} color="gray" theme="modern" />
            </EmptyState.Header>
            <EmptyState.Content>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>{children}</EmptyState.Description>
            </EmptyState.Content>
            {action && <EmptyState.Footer>{action}</EmptyState.Footer>}
        </EmptyState>
    </section>
);

/** A short confirmation of something that just happened (or, in the prototype, would have). */
export interface ListNoticeContent {
    text: ReactNode;
    href?: string;
    linkLabel?: string;
    onUndo?: () => void;
}

/**
 * The page's one confirmation strip. Sits at the bottom of the content on desktop and under the
 * top bar on a phone, where the bulk bar already owns the bottom edge.
 */
export const ListNotice = ({ notice, onDismiss }: { notice: ListNoticeContent | null; onDismiss: () => void }) =>
    notice ? (
        <div
            role="status"
            data-testid="list-notice"
            className={cx(
                "z-30 flex items-center gap-3 rounded-xl bg-primary-solid py-2 pr-2 pl-3.5 text-sm text-white shadow-xl",
                "max-lg:fixed max-lg:inset-x-3 max-lg:top-[calc(4rem+env(safe-area-inset-top))]",
                "lg:sticky lg:bottom-6 lg:max-w-2xl lg:self-center",
            )}
        >
            <CheckCircle className="size-5 shrink-0 text-fg-success-secondary" aria-hidden="true" />
            <p className="min-w-0 flex-1">{notice.text}</p>
            {notice.href && (
                <a
                    href={notice.href}
                    data-notice-link
                    className="flex min-h-9 shrink-0 items-center rounded-xs font-semibold underline underline-offset-2 outline-focus-ring focus-visible:outline-2 max-lg:min-h-11"
                >
                    {notice.linkLabel ?? "Open"}
                </a>
            )}
            {notice.onUndo && (
                <button
                    type="button"
                    onClick={notice.onUndo}
                    data-notice-undo
                    className="min-h-9 shrink-0 cursor-pointer rounded-xs px-1 font-semibold underline underline-offset-2 outline-focus-ring focus-visible:outline-2 max-lg:min-h-11"
                >
                    Undo
                </button>
            )}
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 outline-focus-ring hover:text-white focus-visible:outline-2 max-lg:size-11"
            >
                <XClose className="size-4" aria-hidden="true" />
            </button>
        </div>
    ) : null;

/** "1 skipped: you created it." Empty when nothing was skipped. */
export const skipped = (n: number, why: string) => (n > 0 ? ` ${n.toLocaleString("en-US")} skipped: ${why}.` : "");
