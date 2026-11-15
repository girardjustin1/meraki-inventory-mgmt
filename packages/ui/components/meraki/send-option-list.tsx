"use client";

import type { FC } from "react";
import { ClipboardCheck, InfoCircle, Mail01, ShoppingCart01, SwitchHorizontal01, Zap } from "@untitledui/icons";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Badge } from "@/components/base/badges/badges";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import type { Vendor } from "@/data/types";
import type { SendMethod, SendOption } from "@/engine/order-send";
import { sendOptions } from "@/engine/order-send";
import { cx } from "@/utils/cx";

export const SEND_METHOD_ICON: Record<SendMethod, FC<{ className?: string }>> = {
    email: Mail01,
    "cart-link": ShoppingCart01,
    "pick-list": ClipboardCheck,
    api: Zap,
    transfer: SwitchHorizontal01,
};

/** The first way of sending that is ready to use for this vendor. Email is always available, so there is always one. */
export const bestSendOption = (vendor: Vendor): SendOption => {
    const options = sendOptions(vendor);
    return options.find((o) => o.available) ?? (options[options.length - 1] as SendOption);
};

/** Short badge text for an option that cannot be used yet. The full reason is the engine's note. */
const unavailableLabel = (method: SendMethod) => (method === "api" ? "Not connected" : "Not set up yet");

interface SendOptionListProps {
    vendor: Vendor;
    /** The chosen method. */
    value: SendMethod;
    onChange?: (method: SendMethod) => void;
    /** Show the options without letting them be changed, for example before an order is approved. */
    isDisabled?: boolean;
    /** Accessible name of the group. */
    label?: string;
    className?: string;
}

/**
 * The ways an order can reach this vendor, best first, as a single-choice list.
 * Options the vendor record is not ready for stay in the list, greyed out, with the reason.
 */
export const SendOptionList = ({ vendor, value, onChange, isDisabled, label = "How to send this order", className }: SendOptionListProps) => {
    const options = sendOptions(vendor);
    const suggested = options.find((o) => o.available)?.method;

    return (
        <AriaRadioGroup
            aria-label={label}
            value={value}
            onChange={(v) => onChange?.(v as SendMethod)}
            isDisabled={isDisabled}
            className={cx("flex flex-col gap-2", className)}
        >
            {options.map((o) => {
                const Icon = SEND_METHOD_ICON[o.method];
                return (
                    <AriaRadio
                        key={o.method}
                        value={o.method}
                        isDisabled={!o.available}
                        className={({ isSelected, isFocusVisible, isHovered }) =>
                            cx(
                                "flex min-h-11 items-start gap-3 rounded-xl p-3 ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset lg:p-3.5",
                                o.available ? "bg-primary ring-secondary" : "cursor-not-allowed bg-secondary ring-secondary",
                                o.available && !isDisabled && "cursor-pointer",
                                o.available && !isDisabled && isHovered && !isSelected && "bg-primary_hover",
                                isSelected && "bg-brand-primary_alt ring-2 ring-brand",
                                isFocusVisible && "outline-2 outline-offset-2",
                            )
                        }
                    >
                        {({ isSelected }) => (
                            <>
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                                        o.available ? "bg-brand-secondary text-fg-brand-primary" : "bg-tertiary text-fg-quaternary",
                                    )}
                                >
                                    <Icon className="size-4.5" />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className={cx("text-sm font-semibold", o.available ? "text-primary" : "text-tertiary")}>{o.label}</span>
                                        {o.method === suggested && (
                                            <Badge type="color" color="brand" size="sm">
                                                Suggested
                                            </Badge>
                                        )}
                                        {!o.available && (
                                            <Badge type="color" color="warning" size="sm">
                                                {unavailableLabel(o.method)}
                                            </Badge>
                                        )}
                                    </span>
                                    <span className="text-sm text-tertiary">{o.description}</span>
                                    {o.note && (
                                        <span className={cx("flex items-start gap-1.5 text-xs", o.available ? "text-tertiary" : "font-medium text-secondary")}>
                                            <InfoCircle className="mt-px size-3.5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                            <span>{o.note}</span>
                                        </span>
                                    )}
                                </span>
                                {o.available && <RadioButtonBase size="md" isSelected={isSelected} isDisabled={isDisabled} className="mt-0.5" />}
                            </>
                        )}
                    </AriaRadio>
                );
            })}
        </AriaRadioGroup>
    );
};
