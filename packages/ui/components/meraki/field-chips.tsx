"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown } from "@untitledui/icons";
import { cx } from "@/utils/cx";

export interface FieldChip {
    id: string;
    label: string;
    /** Shown inside the chip when the field has a value. */
    value?: ReactNode;
    /** The field itself, shown when the chip is opened. Leave out for a chip that only states a value. */
    field?: ReactNode;
    /** Makes the chip a link instead, for a field that is filled in somewhere else ("Scan to link"). */
    href?: string;
    /** The opened field takes the full width (a description, a note). */
    wide?: boolean;
}

interface FieldChipsProps {
    /** Names the row for screen readers: "More details". */
    label: string;
    fields: FieldChip[];
    /** Chips that start opened. */
    defaultOpen?: string[];
    className?: string;
}

const chip =
    "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-sm font-medium text-secondary ring-1 ring-secondary ring-inset max-lg:min-h-11";
const pressable =
    "cursor-pointer outline-focus-ring transition duration-100 ease-linear hover:bg-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2";

const ChipValue = ({ children }: { children: ReactNode }) => (
    <span className="inline-flex min-w-0 items-center gap-1 truncate rounded bg-primary px-1.5 py-px text-xs text-secondary ring-1 ring-secondary ring-inset">
        {children}
    </span>
);

/**
 * Progressive disclosure for optional fields. Each field is a small chip in a card footer: an
 * empty one shows only its name, a filled one shows its value, and clicking it opens the field
 * above the row. The page stays short until someone needs the field.
 */
export const FieldChips = ({ label, fields, defaultOpen = [], className }: FieldChipsProps) => {
    const [open, setOpen] = useState<string[]>(defaultOpen);
    const openable = fields.filter((f) => f.field);
    const opened = openable.filter((f) => open.includes(f.id));
    const allOpen = openable.length > 0 && opened.length === openable.length;
    const toggle = (id: string) => setOpen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

    return (
        <div className={cx("flex flex-col", className)}>
            {opened.length > 0 && (
                <div className="grid gap-4 border-b border-secondary px-4 py-4 sm:grid-cols-2 lg:px-5">
                    {opened.map((f) => (
                        <div key={f.id} id={`field-${f.id}`} className={cx("min-w-0", f.wide && "sm:col-span-2")}>
                            {f.field}
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-start gap-2 px-4 py-3 lg:px-5">
                <ul aria-label={label} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {fields.map((f) => {
                        const isOpen = open.includes(f.id);
                        const body = (
                            <>
                                <span className="shrink-0">{f.label}</span>
                                {f.value !== undefined && f.value !== null && f.value !== "" && <ChipValue>{f.value}</ChipValue>}
                            </>
                        );
                        return (
                            <li key={f.id} className="max-w-full min-w-0">
                                {f.field ? (
                                    <button
                                        type="button"
                                        aria-expanded={isOpen}
                                        aria-controls={isOpen ? `field-${f.id}` : undefined}
                                        onClick={() => toggle(f.id)}
                                        className={cx(chip, pressable, isOpen && "bg-brand-50 text-brand-secondary ring-utility-brand-200 hover:bg-brand-100")}
                                    >
                                        {body}
                                    </button>
                                ) : f.href ? (
                                    <a href={f.href} className={cx(chip, pressable)}>
                                        {body}
                                    </a>
                                ) : (
                                    <span className={chip}>{body}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {openable.length > 1 && (
                    <button
                        type="button"
                        aria-label={allOpen ? "Close all fields" : "Open all fields"}
                        aria-expanded={allOpen}
                        onClick={() => setOpen(allOpen ? [] : openable.map((f) => f.id))}
                        className={cx(
                            // Phones need the width for the chips themselves.
                            "flex size-8 shrink-0 items-center justify-center rounded-md text-fg-quaternary hover:bg-primary_hover hover:text-fg-quaternary_hover max-sm:hidden",
                            pressable,
                        )}
                    >
                        <ChevronDown className={cx("size-4 transition duration-100 ease-linear", allOpen && "rotate-180")} aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
};
