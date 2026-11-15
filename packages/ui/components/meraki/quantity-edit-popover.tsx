"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { ArrowRight, Minus, Plus } from "@untitledui/icons";
import {
    Button as AriaButton,
    Dialog as AriaDialog,
    DialogTrigger as AriaDialogTrigger,
    Modal as AriaModal,
    ModalOverlay as AriaModalOverlay,
    Popover as AriaPopover,
    Radio as AriaRadio,
    RadioGroup as AriaRadioGroup,
} from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { FillLevelPicker } from "@/components/meraki/fill-level-picker";
import { quantityText, unitWord } from "@/components/meraki/quantity-stepper";
import type { FillLevel, Item, ReasonCode, StockLevel } from "@/data/types";
import { REASONS_NEEDING_NOTE, REASON_CODES, REASON_LABEL } from "@/engine/reasons";
import { FILL_FRACTION, FILL_LABEL } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

/** Reasons a person can pick. Counts and deliveries write their own movements, so they are not offered here. */
export const ADJUST_REASONS: ReasonCode[] = REASON_CODES.filter((r) => r !== "cycle-count" && r !== "received-order");

/** A change of this many units or more needs a note, whatever the reason. */
export const NOTE_REQUIRED_FROM = 3;

export const noteRequired = (delta: number, reason: ReasonCode | null) =>
    Math.abs(delta) >= NOTE_REQUIRED_FROM || (reason !== null && REASONS_NEEDING_NOTE.includes(reason));

export interface QuantityChange {
    /** New quantity, for counted items. */
    onHand?: number;
    /** New fill level, for items tracked by eye. */
    fillLevel?: FillLevel;
    /** Signed change. For fill levels it is the change in fraction of a container. */
    delta: number;
    reason: ReasonCode;
    note?: string;
}

export interface QuantityEditPopoverProps {
    item: Pick<Item, "name" | "unit">;
    level: Pick<StockLevel, "onHand" | "fillLevel"> & { isSample?: boolean };
    onSave: (change: QuantityChange) => void;
    /** Renders the quantity as plain text. Use it for people who cannot adjust stock. */
    isDisabled?: boolean;
    /** Why editing is off, shown on hover. */
    disabledReason?: string;
    /** What the number is. Shown in the editor heading and the accessible name. */
    quantityLabel?: string;
    /** Extra line under the heading, for example "In use 1 · Backstock 2". */
    context?: ReactNode;
    /** Trigger content. Defaults to the quantity with its unit: "6 bottles". */
    children?: ReactNode;
    triggerClassName?: string;
    /** Open on first render. For stories and for returning to a row that was being edited. */
    defaultOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
}

const currentText = (level: QuantityEditPopoverProps["level"], unit: string) =>
    level.fillLevel ? FILL_LABEL[level.fillLevel] : quantityText(level.onHand, unit);

/**
 * A quantity that can be changed where it is shown.
 * The trigger is the number itself. It opens a small editor (a popover on desktop, a bottom sheet
 * on a phone) that asks for the change, a reason and, for bigger changes, a note. Nothing is saved
 * here: `onSave` hands the change to the screen.
 */
export const QuantityEditPopover = ({
    item,
    level,
    onSave,
    isDisabled,
    disabledReason,
    quantityLabel = "On hand",
    context,
    children,
    triggerClassName,
    defaultOpen,
    onOpenChange,
}: QuantityEditPopoverProps) => {
    const isDesktop = useBreakpoint("lg");
    const text = currentText(level, item.unit);
    const content = children ?? <span className="tabular-nums">{text}</span>;

    if (isDisabled) {
        return (
            <span title={disabledReason} className={cx("inline-flex items-center text-sm font-medium text-primary", triggerClassName)}>
                {content}
                {level.isSample && <span className="sr-only">, sample count</span>}
            </span>
        );
    }

    const form = (close: () => void) => (
        <QuantityEditForm
            item={item}
            level={level}
            quantityLabel={quantityLabel}
            context={context}
            roomy={!isDesktop}
            onCancel={close}
            onSave={(change) => {
                onSave(change);
                close();
            }}
        />
    );

    return (
        <AriaDialogTrigger defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
            <AriaButton
                aria-label={`${quantityLabel} for ${item.name}: ${text}${level.isSample ? ", sample count" : ""}. Change`}
                data-quantity-trigger
                className={({ isHovered, isPressed, isFocusVisible }) =>
                    cx(
                        "inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm font-medium text-primary underline decoration-transparent decoration-dotted underline-offset-4 outline-focus-ring transition duration-100 ease-linear max-lg:min-h-11",
                        (isHovered || isPressed) && "bg-primary_hover decoration-fg-quaternary",
                        isFocusVisible && "outline-2 outline-offset-1",
                        triggerClassName,
                    )
                }
            >
                {content}
            </AriaButton>

            {isDesktop ? (
                <AriaPopover
                    placement="bottom end"
                    offset={6}
                    className={({ isEntering, isExiting }) =>
                        cx(
                            "w-84 max-w-[calc(100vw-2rem)] origin-(--trigger-anchor-point) rounded-xl bg-primary shadow-xl ring-1 ring-secondary_alt will-change-transform",
                            isEntering &&
                                "duration-150 ease-out animate-in fade-in placement-top:slide-in-from-bottom-0.5 placement-bottom:slide-in-from-top-0.5",
                            isExiting && "duration-100 ease-in animate-out fade-out",
                        )
                    }
                >
                    <AriaDialog aria-label={`Change ${quantityLabel.toLowerCase()} for ${item.name}`} className="outline-hidden">
                        {({ close }) => form(close)}
                    </AriaDialog>
                </AriaPopover>
            ) : (
                <AriaModalOverlay
                    isDismissable
                    className={({ isEntering, isExiting }) =>
                        cx(
                            "fixed inset-0 z-50 flex items-end bg-overlay/60 outline-hidden",
                            isEntering && "duration-200 ease-out animate-in fade-in",
                            isExiting && "duration-150 ease-in animate-out fade-out",
                        )
                    }
                >
                    <AriaModal
                        className={({ isEntering, isExiting }) =>
                            cx(
                                "mx-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-primary pb-[env(safe-area-inset-bottom)] shadow-xl outline-hidden",
                                isEntering && "duration-200 ease-out animate-in slide-in-from-bottom-8",
                                isExiting && "duration-150 ease-in animate-out slide-out-to-bottom-8",
                            )
                        }
                    >
                        <AriaDialog aria-label={`Change ${quantityLabel.toLowerCase()} for ${item.name}`} className="outline-hidden">
                            {({ close }) => (
                                <>
                                    <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-9 rounded-full bg-quaternary" />
                                    {form(close)}
                                </>
                            )}
                        </AriaDialog>
                    </AriaModal>
                </AriaModalOverlay>
            )}
        </AriaDialogTrigger>
    );
};

type Mode = "adjust" | "set";

interface FormProps {
    item: Pick<Item, "name" | "unit">;
    level: QuantityEditPopoverProps["level"];
    quantityLabel: string;
    context?: ReactNode;
    /** Larger touch targets, for the bottom sheet. */
    roomy?: boolean;
    onCancel: () => void;
    onSave: (change: QuantityChange) => void;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The editor itself. Exported so it can be shown without a trigger (stories, other dialogs). */
export const QuantityEditForm = ({ item, level, quantityLabel, context, roomy, onCancel, onSave }: FormProps) => {
    const tracksFill = Boolean(level.fillLevel);
    const [mode, setMode] = useState<Mode>("adjust");
    const [text, setText] = useState("");
    const [fill, setFill] = useState<FillLevel | undefined>(level.fillLevel);
    const [reason, setReason] = useState<ReasonCode | null>(null);
    const [note, setNote] = useState("");
    const [tried, setTried] = useState(false);

    const parsed = Number.parseInt(text, 10);
    const hasNumber = !Number.isNaN(parsed);
    const next = tracksFill ? level.onHand : !hasNumber ? level.onHand : mode === "adjust" ? level.onHand + parsed : parsed;
    const delta = tracksFill && fill && level.fillLevel ? FILL_FRACTION[fill] - FILL_FRACTION[level.fillLevel] : next - level.onHand;
    const belowZero = !tracksFill && next < 0;
    const changed = tracksFill ? fill !== level.fillLevel : hasNumber && delta !== 0;
    const needsNote = !tracksFill ? noteRequired(delta, reason) : reason !== null && REASONS_NEEDING_NOTE.includes(reason);
    const noteOk = !needsNote || note.trim().length > 0;
    const ok = changed && !belowZero && reason !== null && noteOk;

    const switchMode = (to: Mode) => {
        if (to === mode) return;
        // Carry the change across, so switching never loses what was typed.
        setText(!hasNumber ? "" : to === "set" ? String(Math.max(0, next)) : signed(delta));
        setMode(to);
    };

    const step = (by: 1 | -1) => {
        const base = hasNumber ? parsed : mode === "set" ? level.onHand : 0;
        const value = mode === "set" ? Math.max(0, base + by) : Math.max(-level.onHand, base + by);
        setText(mode === "set" ? String(value) : signed(value));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setTried(true);
        if (!ok || reason === null) return;
        onSave({
            ...(tracksFill ? { fillLevel: fill } : { onHand: next }),
            delta,
            reason,
            note: note.trim() || undefined,
        });
    };

    const stepButton = cx(
        "flex shrink-0 cursor-pointer items-center justify-center text-fg-secondary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
        roomy ? "size-12" : "size-10",
    );

    return (
        <form onSubmit={submit} noValidate className={cx("flex flex-col gap-4", roomy ? "px-4 pt-3 pb-4" : "p-4")} data-testid="quantity-edit-form">
            <div className="flex flex-col gap-0.5">
                <p className="line-clamp-2 text-sm font-semibold text-primary">{item.name}</p>
                <p className="text-sm text-tertiary">
                    {quantityLabel} now: <span className="font-medium text-secondary tabular-nums">{currentText(level, item.unit)}</span>
                    {level.isSample && " (sample count)"}
                </p>
                {context && <p className="text-sm text-tertiary">{context}</p>}
            </div>

            {tracksFill ? (
                <FillLevelPicker label={`Fill level for ${item.name}`} value={fill} onChange={setFill} size={roomy ? "lg" : "md"} />
            ) : (
                <div className="flex flex-col gap-3">
                    <AriaRadioGroup
                        aria-label="How to change it"
                        orientation="horizontal"
                        value={mode}
                        onChange={(value) => switchMode(value as Mode)}
                        className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 ring-1 ring-secondary ring-inset"
                    >
                        {(
                            [
                                { id: "adjust", label: "Adjust by" },
                                { id: "set", label: "New quantity" },
                            ] as const
                        ).map((option) => (
                            <AriaRadio
                                key={option.id}
                                value={option.id}
                                className={({ isSelected, isFocusVisible, isHovered }) =>
                                    cx(
                                        "flex cursor-pointer items-center justify-center rounded-md px-2 text-sm font-semibold outline-focus-ring transition duration-100 ease-linear select-none",
                                        roomy ? "min-h-11" : "min-h-8",
                                        isSelected ? "bg-primary text-brand-secondary shadow-xs ring-1 ring-secondary ring-inset" : "text-tertiary",
                                        !isSelected && isHovered && "text-secondary",
                                        isFocusVisible && "outline-2 outline-offset-1",
                                    )
                                }
                            >
                                {option.label}
                            </AriaRadio>
                        ))}
                    </AriaRadioGroup>

                    <div
                        role="group"
                        aria-label={mode === "adjust" ? "Adjust by" : "New quantity"}
                        className={cx(
                            "flex items-stretch overflow-hidden rounded-lg bg-primary shadow-xs ring-1 ring-inset focus-within:ring-2 focus-within:ring-brand",
                            belowZero ? "ring-error_subtle" : "ring-primary",
                        )}
                    >
                        <AriaButton
                            aria-label="Decrease"
                            onPress={() => step(-1)}
                            isDisabled={next <= 0}
                            className={cx(stepButton, "border-r border-secondary")}
                        >
                            <Minus className="size-4" aria-hidden="true" />
                        </AriaButton>
                        <input
                            type="text"
                            inputMode={mode === "adjust" ? "text" : "numeric"}
                            enterKeyHint="done"
                            autoComplete="off"
                            // The editor opens on the number so a change can be typed straight away.
                            autoFocus
                            aria-label={mode === "adjust" ? `Adjust ${quantityLabel.toLowerCase()} by` : `New ${quantityLabel.toLowerCase()} quantity`}
                            aria-invalid={belowZero || undefined}
                            placeholder={mode === "adjust" ? "0" : String(level.onHand)}
                            value={text}
                            onChange={(e) => {
                                const raw = e.currentTarget.value.replace(/\s/g, "");
                                if ((mode === "adjust" ? /^[+-]?\d{0,5}$/ : /^\d{0,5}$/).test(raw)) setText(raw);
                            }}
                            className="w-full min-w-0 bg-transparent px-2 text-center text-lg font-semibold text-primary tabular-nums outline-hidden placeholder:text-placeholder"
                        />
                        <AriaButton aria-label="Increase" onPress={() => step(1)} className={cx(stepButton, "border-l border-secondary")}>
                            <Plus className="size-4" aria-hidden="true" />
                        </AriaButton>
                    </div>
                </div>
            )}

            <p
                aria-live="polite"
                data-testid="quantity-preview"
                className="flex min-h-9 items-center justify-center gap-2 rounded-lg bg-secondary px-3 text-sm ring-1 ring-secondary ring-inset"
            >
                {belowZero ? (
                    <span className="font-medium text-error-primary">That would take it below zero.</span>
                ) : !changed ? (
                    <span className="text-tertiary">No change yet</span>
                ) : tracksFill && fill && level.fillLevel ? (
                    <>
                        <span className="text-tertiary">{FILL_LABEL[level.fillLevel]}</span>
                        <ArrowRight className="size-4 text-fg-quaternary" aria-label="becomes" />
                        <span className="font-semibold text-primary">{FILL_LABEL[fill]}</span>
                    </>
                ) : (
                    <>
                        <span className="text-tertiary tabular-nums">{level.onHand}</span>
                        <ArrowRight className="size-4 text-fg-quaternary" aria-label="becomes" />
                        <span className="font-semibold text-primary tabular-nums">
                            {next} {unitWord(next, item.unit)}
                        </span>
                        <span className="text-tertiary tabular-nums">({signed(delta)})</span>
                    </>
                )}
            </p>

            <Select
                label="Reason"
                size={roomy ? "md" : "sm"}
                placeholder="Choose a reason"
                isRequired
                hideRequiredIndicator
                items={ADJUST_REASONS.map((r) => ({ id: r, label: REASON_LABEL[r] }))}
                value={reason}
                onChange={(key) => setReason(key ? (String(key) as ReasonCode) : null)}
                isInvalid={tried && reason === null}
                hint={tried && reason === null ? "Choose a reason." : undefined}
            >
                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
            </Select>

            <Input
                label={needsNote ? "Note" : "Note (optional)"}
                size={roomy ? "md" : "sm"}
                placeholder="What happened?"
                value={note}
                onChange={setNote}
                isRequired={needsNote}
                isInvalid={tried && !noteOk}
                hint={
                    needsNote
                        ? Math.abs(delta) >= NOTE_REQUIRED_FROM && !tracksFill
                            ? `Needed for a change of ${NOTE_REQUIRED_FROM} or more.`
                            : "Needed for this reason."
                        : undefined
                }
            />

            <div className="flex gap-2">
                <Button color="secondary" size={roomy ? "md" : "sm"} className={cx("flex-1", roomy && "min-h-11")} onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" size={roomy ? "md" : "sm"} className={cx("flex-1", roomy && "min-h-11")} isDisabled={!changed || belowZero}>
                    Save
                </Button>
            </div>
        </form>
    );
};
