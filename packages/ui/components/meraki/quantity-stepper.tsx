"use client";

import { useState } from "react";
import { Minus, Plus } from "@untitledui/icons";
import { Button as AriaButton } from "react-aria-components";
import { cx } from "@/utils/cx";

const sizes = {
    md: { button: "size-11", icon: "size-5", cell: "min-w-14 px-1", value: "text-lg", unit: "text-xs" },
    lg: { button: "size-14", icon: "size-6", cell: "min-w-20 px-2", value: "text-display-xs", unit: "text-xs" },
} as const;

export interface QuantityStepperProps {
    value: number;
    onChange: (value: number) => void;
    /** Accessible name for the group, for example "Counted quantity for CnC Acetone". */
    label: string;
    min?: number;
    max?: number;
    /** Amount added or removed per tap. Values below 1 allow decimals when typing. */
    step?: number;
    /** md has 44px buttons, lg has 56px buttons for counting at the shelf. */
    size?: keyof typeof sizes;
    /** Shown under the number: "bottles", "boxes". */
    unit?: string;
    isDisabled?: boolean;
    className?: string;
}

/**
 * "3 bottles", "1 box", and "2 units" for items sold as "Each" (which has no sensible plural).
 * Use it wherever a stepper value is written out as text.
 */
export const quantityText = (qty: number, unit?: string) => {
    const value = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/0$/, "");
    return `${value} ${unitWord(qty, unit)}`;
};

/** The unit on its own, pluralised for the quantity: "bottles", "box", "units". */
export const unitWord = (qty: number, unit?: string) => {
    const base = !unit || unit.toLowerCase() === "each" ? "unit" : unit.toLowerCase();
    if (qty === 1) return base;
    return /(x|s|ch)$/.test(base) ? `${base}es` : `${base}s`;
};

const clamp = (n: number, min: number, max?: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n));

/**
 * Large-touch minus / value / plus control.
 * Tap either side to step, or tap the number to type it. Sized for one-handed use on a phone.
 */
export const QuantityStepper = ({ value, onChange, label, min = 0, max, step = 1, size = "md", unit, isDisabled, className }: QuantityStepperProps) => {
    // While the field has focus it holds what the person typed; the value is committed on blur or Enter.
    const [draft, setDraft] = useState<string | null>(null);
    const s = sizes[size];
    const decimals = step < 1;

    const commit = (raw: string) => {
        const parsed = decimals ? Number.parseFloat(raw) : Number.parseInt(raw, 10);
        if (!Number.isNaN(parsed)) onChange(clamp(parsed, min, max));
        setDraft(null);
    };

    const bump = (direction: 1 | -1) => {
        const next = Math.round((value + direction * step) * 100) / 100;
        onChange(clamp(next, min, max));
        setDraft(null);
    };

    const buttonClass = cx(
        "flex shrink-0 cursor-pointer items-center justify-center text-fg-secondary outline-focus-ring transition duration-100 ease-linear select-none",
        "hover:bg-primary_hover focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 pressed:bg-secondary_hover",
        s.button,
    );

    return (
        <div
            role="group"
            aria-label={label}
            className={cx(
                "inline-flex items-stretch overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-primary ring-inset",
                isDisabled && "opacity-50",
                className,
            )}
        >
            <AriaButton aria-label="Decrease" isDisabled={isDisabled || value <= min} onPress={() => bump(-1)} className={cx(buttonClass, "rounded-l-xl")}>
                <Minus className={s.icon} aria-hidden="true" />
            </AriaButton>

            <label className={cx("flex flex-1 cursor-text flex-col items-center justify-center border-x border-secondary", s.cell)}>
                <span className="sr-only">{label}</span>
                <input
                    type="text"
                    inputMode={decimals ? "decimal" : "numeric"}
                    pattern={decimals ? "[0-9.]*" : "[0-9]*"}
                    enterKeyHint="done"
                    autoComplete="off"
                    disabled={isDisabled}
                    value={draft ?? String(value)}
                    onFocus={(e) => {
                        setDraft(String(value));
                        e.currentTarget.select();
                    }}
                    onChange={(e) => setDraft(e.currentTarget.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, ""))}
                    onBlur={(e) => commit(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className={cx(
                        "w-full min-w-0 bg-transparent text-center leading-none font-semibold text-primary tabular-nums outline-hidden disabled:cursor-not-allowed",
                        s.value,
                    )}
                />
                {unit && <span className={cx("mt-0.5 max-w-full truncate leading-none text-tertiary", s.unit)}>{unit}</span>}
            </label>

            <AriaButton
                aria-label="Increase"
                isDisabled={isDisabled || (max !== undefined && value >= max)}
                onPress={() => bump(1)}
                className={cx(buttonClass, "rounded-r-xl")}
            >
                <Plus className={s.icon} aria-hidden="true" />
            </AriaButton>
        </div>
    );
};
