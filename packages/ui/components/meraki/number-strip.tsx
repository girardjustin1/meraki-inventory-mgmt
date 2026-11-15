import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

export type NumberNoteTone = "neutral" | "warning" | "bad";

export interface NumberStripItem {
    label: string;
    value: ReactNode;
    /** A short qualifier beside the number: "4 out", "10 high". The only place the tone shows. */
    note?: string;
    noteTone?: NumberNoteTone;
    /** Makes the cell a link to the list behind the number. */
    href?: string;
}

const NOTE_TONE: Record<NumberNoteTone, string> = {
    neutral: "text-tertiary",
    warning: "text-warning-primary",
    bad: "text-error-primary",
};

const spoken = (item: NumberStripItem) => `${item.label}: ${String(item.value)}${item.note ? `, ${item.note}` : ""}`;

const Note = ({ item, className }: { item: NumberStripItem; className?: string }) =>
    item.note ? <span className={cx("font-medium", NOTE_TONE[item.noteTone ?? "neutral"], className)}>{item.note}</span> : null;

export interface NumberStripProps {
    items: NumberStripItem[];
    /** Names the group for screen readers, e.g. "Lynnfield, numbers that need action". */
    "aria-label"?: string;
    className?: string;
}

/**
 * A few numbers in one compact row, each a link to the list behind it. Quieter than a row of
 * stat cards: no icons, no coloured totals. On a phone it is a single row of small tiles.
 */
export const NumberStrip = ({ items, className, ...props }: NumberStripProps) => (
    <ul
        aria-label={props["aria-label"]}
        className={cx("grid divide-x divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset", className)}
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
    >
        {items.map((item) => {
            const body = (
                <>
                    <span className="text-xs font-medium text-tertiary lg:text-sm">{item.label}</span>
                    <span className="flex flex-col gap-x-2 lg:flex-row lg:items-baseline">
                        <span className="text-xl font-semibold text-primary tabular-nums lg:text-display-xs">{item.value}</span>
                        <Note item={item} className="text-xs lg:text-sm" />
                    </span>
                </>
            );
            const cell = "flex h-full min-h-16 flex-col gap-0.5 px-3 py-2.5 lg:px-5 lg:py-3.5";
            return (
                <li key={item.label} className="min-w-0">
                    {item.href ? (
                        <a
                            href={item.href}
                            aria-label={spoken(item)}
                            className={cx(
                                cell,
                                "outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2",
                            )}
                        >
                            {body}
                        </a>
                    ) : (
                        <div className={cell}>{body}</div>
                    )}
                </li>
            );
        })}
    </ul>
);

export interface NumberComparisonRow {
    id: string;
    label: string;
    /** The row the rest of the page is about. */
    current?: boolean;
    /** One cell per column, in column order. `label` is ignored: the column header names it. */
    cells: Omit<NumberStripItem, "label">[];
    /** Shown at the end of the row: a "Viewing" marker or a switch button. */
    action?: ReactNode;
}

export interface NumberComparisonProps {
    /** Header of the first column, e.g. "Location". */
    rowHeader: string;
    columns: string[];
    rows: NumberComparisonRow[];
    "aria-label"?: string;
    className?: string;
}

/** The same numbers for several places, one slim row each, so one glance says which needs attention. */
export const NumberComparison = ({ rowHeader, columns, rows, className, ...props }: NumberComparisonProps) => (
    <div className={cx("overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset", className)}>
        <table aria-label={props["aria-label"]} className="w-full table-fixed border-collapse text-left">
            <thead>
                <tr className="border-b border-secondary">
                    <th scope="col" className="w-1/4 px-5 py-2 text-xs font-medium text-tertiary">
                        {rowHeader}
                    </th>
                    {columns.map((c) => (
                        <th key={c} scope="col" className="px-3 py-2 text-xs font-medium text-tertiary">
                            {c}
                        </th>
                    ))}
                    <th scope="col" className="w-40 px-5 py-2">
                        <span className="sr-only">Actions</span>
                    </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-secondary">
                {rows.map((row) => (
                    <tr key={row.id} aria-current={row.current ? "true" : undefined}>
                        <th scope="row" className={cx("truncate px-5 py-2.5 text-sm text-primary", row.current ? "font-semibold" : "font-medium")}>
                            {row.label}
                        </th>
                        {row.cells.map((cell, i) => {
                            const label = columns[i] ?? "";
                            const body = (
                                <>
                                    <span className="min-w-10 text-lg font-semibold text-primary tabular-nums">{cell.value}</span>
                                    <Note item={{ ...cell, label }} className="truncate text-sm" />
                                </>
                            );
                            return (
                                <td key={label} className="px-3 py-1">
                                    {cell.href ? (
                                        <a
                                            href={cell.href}
                                            aria-label={spoken({ ...cell, label: `${row.label}, ${label}` })}
                                            className="-mx-2 flex min-h-9 items-baseline gap-2 rounded-md px-2 py-1 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                        >
                                            {body}
                                        </a>
                                    ) : (
                                        <span className="flex min-h-9 items-baseline gap-2 py-1">{body}</span>
                                    )}
                                </td>
                            );
                        })}
                        <td className="px-5 py-1">
                            <div className="flex justify-end">{row.action}</div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);
