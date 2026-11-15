"use client";

import type { ReactNode } from "react";
import { CheckCircle, XClose } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { vendors } from "@/data/inventory";
import { POLISH_LINE_LABEL } from "@/data/labels";
import type { Collection, CollectionPurpose, CollectionRule, ItemKind, PolishLine, StockStatus } from "@/data/types";
import { describeRule } from "@/engine/collections";
import { STATUS_LABEL } from "@/engine/stock";

/** Display order for the four purposes, used by pickers and the list views. */
export const PURPOSE_ORDER: CollectionPurpose[] = ["shelf", "service-kit", "count-list", "general"];

export const PURPOSE_LABEL: Record<CollectionPurpose, string> = {
    shelf: "Shelf",
    "service-kit": "Service kit",
    "count-list": "Count list",
    general: "General",
};

export const PURPOSE_HINT: Record<CollectionPurpose, string> = {
    shelf: "A room, closet or shelf. Use it to see and count one place.",
    "service-kit": "What one service uses. Use it to restock a station.",
    "count-list": "Items counted together on a schedule.",
    general: "Any other set you want to come back to.",
};

export const KIND_LABEL: Record<Collection["kind"], string> = { manual: "Manual", smart: "Smart" };

export const KIND_HINT: Record<Collection["kind"], string> = {
    manual: "You pick the items and set their order.",
    smart: "Rules choose the items and keep the list up to date.",
};

const PURPOSE_COLOR: Record<CollectionPurpose, "gray" | "brand" | "blue"> = { shelf: "gray", "service-kit": "brand", "count-list": "blue", general: "gray" };

/** Small chip saying what a collection is for. */
export const CollectionPurposeChip = ({ purpose, size = "sm" }: { purpose: CollectionPurpose; size?: "sm" | "md" }) => (
    <Badge type="pill-color" color={PURPOSE_COLOR[purpose]} size={size}>
        {PURPOSE_LABEL[purpose]}
    </Badge>
);

const KIND_OF_ITEM_LABEL: Record<ItemKind, string> = { supply: "Supply", polish: "Polish", tips: "Gel-X tips" };

/** The readable form of a rule value: a vendor's name for its id, "Low" for "low", and so on. */
export const ruleValueLabel = (field: CollectionRule["field"], value: string): string => {
    switch (field) {
        case "vendor":
            return vendors.find((v) => v.id === value)?.name ?? value;
        case "line":
            return POLISH_LINE_LABEL[value as PolishLine] ?? value;
        case "kind":
            return KIND_OF_ITEM_LABEL[value as ItemKind] ?? value;
        case "status":
            return STATUS_LABEL[value as StockStatus] ?? value;
        case "abc":
            return `Class ${value}`;
        default:
            return value;
    }
};

/** "Area is Wax Room", with ids turned into names. */
export const ruleText = (rule: CollectionRule) => describeRule(rule, ruleValueLabel(rule.field, rule.value));

/** The short form used where the field is obvious from the value: "Wax Room", "not OPI". */
const ruleShort = (rule: CollectionRule) => `${rule.op === "is-not" ? "not " : ""}${ruleValueLabel(rule.field, rule.value)}`;

/**
 * A few words describing what a smart collection holds: "Area is Wax Room", or
 * "OPI and Pinks" for two rules. Longer rule sets end with "+2 more".
 */
export const summariseRules = (collection: Pick<Collection, "rules" | "match">, max = 2): string => {
    const rules = collection.rules ?? [];
    if (rules.length === 0) return "No rules yet";
    if (rules.length === 1) return ruleText(rules[0] as CollectionRule);
    const joiner = collection.match === "any" ? " or " : " and ";
    const shown = rules.slice(0, max).map(ruleShort).join(joiner);
    return rules.length > max ? `${shown}, +${rules.length - max} more` : shown;
};

/** A column header that needs a definition: dotted underline, the definition on hover or focus. */
export const ColumnHint = ({ label, hint }: { label: ReactNode; hint: string }) => (
    <Tooltip title={hint} placement="top">
        <TooltipTrigger className="cursor-help rounded-xs text-left underline decoration-fg-quaternary decoration-dotted underline-offset-4 outline-focus-ring focus-visible:outline-2">
            {label}
        </TooltipTrigger>
    </Tooltip>
);

/** One quiet line confirming what just happened, with a way to dismiss it. */
export const InlineNotice = ({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) => (
    <div
        role="status"
        data-testid="notice"
        className="flex items-start gap-2.5 rounded-lg bg-primary py-1.5 pr-1.5 pl-3 text-sm text-secondary shadow-xs ring-1 ring-secondary ring-inset"
    >
        <CheckCircle className="mt-1.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 py-1">{children}</p>
        {onDismiss && (
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 max-lg:size-11"
            >
                <XClose className="size-4" aria-hidden="true" />
            </button>
        )}
    </div>
);
