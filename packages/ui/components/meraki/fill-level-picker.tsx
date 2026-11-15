"use client";

import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import type { FillLevel } from "@/data/types";
import { FILL_FRACTION, FILL_LABEL } from "@/engine/stock";
import { cx } from "@/utils/cx";

/** Shelf order a person reads left to right: emptiest first. */
const LEVELS: { id: FillLevel; short: string }[] = [
    { id: "empty", short: "Empty" },
    { id: "quarter", short: "¼" },
    { id: "half", short: "Half" },
    { id: "three-quarter", short: "¾" },
    { id: "full", short: "Full" },
];

const sizes = {
    md: { option: "min-h-11 gap-1 py-1.5 text-xs", glyph: "h-4 w-3" },
    lg: { option: "min-h-16 gap-1.5 py-2 text-sm", glyph: "h-6 w-4" },
} as const;

/** A small container outline filled from the bottom to the given fraction. */
export const FillGlyph = ({ level, className }: { level: FillLevel; className?: string }) => (
    <span aria-hidden="true" className={cx("relative block shrink-0 overflow-hidden rounded-[3px] ring-[1.5px] ring-current ring-inset", className)}>
        <span className="absolute inset-x-0 bottom-0 bg-current opacity-70" style={{ height: `${FILL_FRACTION[level] * 100}%` }} />
    </span>
);

export interface FillLevelPickerProps {
    value?: FillLevel | null;
    onChange: (value: FillLevel) => void;
    /** Accessible name, for example "Fill level for Starpil Hard Wax". */
    label: string;
    size?: keyof typeof sizes;
    isDisabled?: boolean;
    className?: string;
}

/**
 * Segmented control for containers that are tracked by eye (tubs, bags, open gallons).
 * Five fixed levels give more consistent counts between people than free text.
 */
export const FillLevelPicker = ({ value, onChange, label, size = "md", isDisabled, className }: FillLevelPickerProps) => (
    <AriaRadioGroup
        aria-label={label}
        orientation="horizontal"
        value={value ?? null}
        onChange={(next) => onChange(next as FillLevel)}
        isDisabled={isDisabled}
        className={cx("grid grid-cols-5 gap-1 rounded-xl bg-secondary p-1 ring-1 ring-secondary ring-inset", isDisabled && "opacity-50", className)}
    >
        {LEVELS.map((level) => (
            <AriaRadio
                key={level.id}
                value={level.id}
                aria-label={FILL_LABEL[level.id]}
                className={({ isSelected, isFocusVisible, isHovered, isDisabled: disabled }) =>
                    cx(
                        "flex cursor-pointer flex-col items-center justify-center rounded-lg px-1 font-semibold outline-focus-ring transition duration-100 ease-linear select-none",
                        sizes[size].option,
                        isSelected ? "bg-primary text-brand-secondary shadow-xs ring-1 ring-brand ring-inset" : "text-tertiary",
                        !isSelected && isHovered && "bg-primary_hover text-secondary",
                        isFocusVisible && "outline-2 outline-offset-1",
                        disabled && "cursor-not-allowed",
                    )
                }
            >
                <FillGlyph level={level.id} className={sizes[size].glyph} />
                <span className="leading-none">{level.short}</span>
            </AriaRadio>
        ))}
    </AriaRadioGroup>
);
