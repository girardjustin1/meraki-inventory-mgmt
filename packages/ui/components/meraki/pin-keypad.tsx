"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, Lock01 } from "@untitledui/icons";
import { motion } from "motion/react";
import { cx } from "@/utils/cx";

export interface PinKeypadProps {
    /** Called with the digits as soon as the last one is entered. There is no submit button. */
    onComplete: (pin: string) => void;
    /** Number of digits. Staff PINs are four. */
    length?: number;
    /** Shown in red under the dots, with a shake. Set it when the PIN was wrong. */
    error?: string;
    /** Neutral helper line under the dots when there is no error. */
    hint?: ReactNode;
    /** When set, the keypad is locked and this line is shown, e.g. "Try again in 42 seconds". */
    lockedLabel?: string;
    /** Disables every key without the locked message (e.g. while checking the PIN). */
    isDisabled?: boolean;
    /** Accessible name for the group of dots. */
    label?: string;
    /** Listen for digit and Backspace keys on the window, for desktop keyboards. */
    captureKeyboard?: boolean;
    className?: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const keyClass =
    "flex size-18 touch-manipulation items-center justify-center rounded-full bg-primary text-display-xs font-medium text-primary tabular-nums shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear select-none ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 active:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary";

/**
 * Numeric keypad with PIN dots. Fills the lower half of a phone screen so it is reachable with
 * one thumb, submits on the last digit, shakes and clears when the parent reports an error,
 * and locks with a countdown line after too many misses.
 */
export const PinKeypad = ({
    onComplete,
    length = 4,
    error,
    hint,
    lockedLabel,
    isDisabled,
    label = "PIN",
    captureKeyboard = true,
    className,
}: PinKeypadProps) => {
    const [digits, setDigits] = useState("");
    const [attempt, setAttempt] = useState(0);
    const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const locked = Boolean(lockedLabel);
    const blocked = locked || Boolean(isDisabled);

    // A lock clears whatever was half-typed (state adjusted during render, not in an effect).
    const [wasLocked, setWasLocked] = useState(locked);
    if (wasLocked !== locked) {
        setWasLocked(locked);
        if (locked) setDigits("");
    }

    // Clicks and key presses are discrete events, so `digits` is always current when the next one arrives.
    const press = useCallback(
        (digit: string) => {
            if (blocked || pending.current || digits.length >= length) return;
            const next = digits + digit;
            setDigits(next);
            if (next.length === length) {
                // Leave the last dot filled for a beat so the entry reads as complete, then hand it over.
                pending.current = setTimeout(() => {
                    pending.current = undefined;
                    setDigits("");
                    setAttempt((n) => n + 1);
                    onComplete(next);
                }, 160);
            }
        },
        [blocked, digits, length, onComplete],
    );

    const remove = useCallback(() => {
        if (blocked || pending.current) return;
        setDigits((current) => current.slice(0, -1));
    }, [blocked]);

    useEffect(
        () => () => {
            clearTimeout(pending.current);
            pending.current = undefined;
        },
        [],
    );

    useEffect(() => {
        if (!captureKeyboard) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            const target = event.target as HTMLElement | null;
            if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
            if (/^\d$/.test(event.key)) {
                event.preventDefault();
                press(event.key);
            } else if (event.key === "Backspace") {
                event.preventDefault();
                remove();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [captureKeyboard, press, remove]);

    const showError = Boolean(error) && !locked && digits.length === 0;

    return (
        <div className={cx("flex w-full flex-col items-center gap-6", className)}>
            <div className="flex flex-col items-center gap-3">
                <motion.div
                    key={attempt}
                    role="img"
                    aria-label={`${label}: ${digits.length} of ${length} digits entered`}
                    className="flex items-center gap-4"
                    animate={showError ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.45, ease: "easeInOut" }}
                >
                    {Array.from({ length }, (_, i) => (
                        <span
                            key={i}
                            className={cx(
                                "size-3.5 rounded-full transition duration-100 ease-linear",
                                i < digits.length
                                    ? "bg-fg-brand-primary"
                                    : showError
                                      ? "bg-primary ring-2 ring-error ring-inset"
                                      : "bg-primary ring-2 ring-primary ring-inset",
                                locked && "opacity-50",
                            )}
                        />
                    ))}
                </motion.div>

                <div aria-live="polite" className="flex min-h-10 items-start justify-center px-2 text-center text-sm">
                    {locked ? (
                        <p className="flex items-center gap-1.5 font-medium text-secondary">
                            <Lock01 className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            {lockedLabel}
                        </p>
                    ) : showError ? (
                        <p role="alert" className="font-medium text-error-primary">
                            {error}
                        </p>
                    ) : (
                        hint && <p className="text-tertiary">{hint}</p>
                    )}
                </div>
            </div>

            <div role="group" aria-label="Number pad" className="grid grid-cols-3 gap-x-6 gap-y-4">
                {KEYS.map((key) => (
                    <button key={key} type="button" disabled={blocked} onClick={() => press(key)} className={keyClass}>
                        {key}
                    </button>
                ))}
                <span aria-hidden="true" />
                <button type="button" disabled={blocked} onClick={() => press("0")} className={keyClass}>
                    0
                </button>
                <button
                    type="button"
                    disabled={blocked || digits.length === 0}
                    onClick={remove}
                    aria-label="Delete last digit"
                    className={cx(keyClass, "bg-transparent shadow-none ring-0 hover:bg-secondary disabled:hover:bg-transparent")}
                >
                    <Delete className="size-7 text-fg-secondary" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};
