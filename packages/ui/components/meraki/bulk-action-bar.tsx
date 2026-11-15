"use client";

import type { FC } from "react";
import { DotsHorizontal, XClose } from "@untitledui/icons";
import { Button as AriaButton } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

export interface BulkAction {
    id: string;
    label: string;
    icon?: FC<{ className?: string }>;
    onAction: () => void;
    isDisabled?: boolean;
}

export interface BulkActionBarProps {
    /** How many rows are selected. The bar renders nothing at zero. */
    count: number;
    /** Singular noun for what is selected: "item". */
    noun?: string;
    /** How many rows match the current view and filters. When more match than are selected, "Select all N" is offered. */
    totalMatching?: number;
    onSelectAll?: () => void;
    onClear: () => void;
    /** In order of importance. The first few are buttons; the rest go under "More". */
    actions: BulkAction[];
    /** How many actions are shown as buttons. Defaults to 4 on desktop and 2 on a phone. */
    maxVisible?: number;
    /** Show a select-all checkbox at the start, lined up with the table's checkbox column (desktop only). */
    onToggleAll?: () => void;
    className?: string;
}

/**
 * Appears when rows are selected: the count, "Select all", "Clear", then what can be done with
 * them. On desktop it is a slim strip meant to sit over the table header; on a phone it docks above
 * the tab bar.
 */
export const BulkActionBar = ({
    count,
    noun = "item",
    totalMatching,
    onSelectAll,
    onClear,
    actions,
    maxVisible,
    onToggleAll,
    className,
}: BulkActionBarProps) => {
    const isDesktop = useBreakpoint("lg");
    if (count <= 0) return null;

    const limit = maxVisible ?? (isDesktop ? 4 : 2);
    const shown = actions.length <= limit + 1 && isDesktop ? actions : actions.slice(0, limit);
    const overflow = actions.slice(shown.length);
    const canSelectAll = onSelectAll && totalMatching !== undefined && totalMatching > count;
    const allSelected = totalMatching !== undefined && count >= totalMatching;

    const more = overflow.length > 0 && (
        <Dropdown.Root>
            <Button
                color="secondary"
                size={isDesktop ? "xs" : "md"}
                iconLeading={DotsHorizontal}
                aria-label="More actions for the selection"
                data-bulk-more
                className={cx(!isDesktop && "min-h-11 shrink-0")}
            >
                {isDesktop ? "More" : undefined}
            </Button>
            <Dropdown.Popover placement={isDesktop ? "bottom right" : "top right"} className="w-60">
                <Dropdown.Menu
                    aria-label="More actions"
                    selectionMode="none"
                    disabledKeys={overflow.filter((a) => a.isDisabled).map((a) => a.id)}
                    onAction={(key) => overflow.find((a) => a.id === key)?.onAction()}
                >
                    {overflow.map((a) => (
                        <Dropdown.Item key={a.id} id={a.id} textValue={a.label} label={a.label} icon={a.icon} />
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const countText = (
        <p aria-live="polite" className="shrink-0 text-sm font-semibold whitespace-nowrap text-primary tabular-nums">
            {count.toLocaleString("en-US")} selected
            <span className="sr-only"> {count === 1 ? noun : `${noun}s`}</span>
        </p>
    );

    const selectAll = canSelectAll && (
        <Button color="link-color" size="sm" className="shrink-0 max-lg:min-h-11" onClick={onSelectAll} data-bulk-select-all>
            Select all {totalMatching.toLocaleString("en-US")}
        </Button>
    );

    if (!isDesktop) {
        return (
            <div
                role="toolbar"
                aria-label={`Actions for the selected ${noun}s`}
                data-bulk-bar
                className={cx(
                    "fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col gap-2 rounded-2xl bg-primary p-2.5 shadow-xl ring-1 ring-secondary",
                    className,
                )}
            >
                <div className="flex items-center gap-3 pl-1.5">
                    {countText}
                    {selectAll}
                    <AriaButton
                        aria-label="Clear selection"
                        onPress={onClear}
                        data-bulk-clear
                        className="-my-1 ml-auto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring focus-visible:outline-2"
                    >
                        <XClose className="size-5" aria-hidden="true" />
                    </AriaButton>
                </div>
                <div className="flex items-center gap-2">
                    {shown.map((a, i) => (
                        <Button
                            key={a.id}
                            color={i === 0 ? "primary" : "secondary"}
                            size="md"
                            className="min-h-11 min-w-0 flex-1"
                            isDisabled={a.isDisabled}
                            onClick={a.onAction}
                            data-bulk-action={a.id}
                        >
                            {a.label}
                        </Button>
                    ))}
                    {more}
                </div>
            </div>
        );
    }

    return (
        <div
            role="toolbar"
            aria-label={`Actions for the selected ${noun}s`}
            data-bulk-bar
            className={cx("flex min-h-10 items-center gap-3 bg-secondary px-5 py-1", className)}
        >
            {onToggleAll && (
                <Checkbox
                    size="md"
                    aria-label={allSelected ? "Clear selection" : "Select all"}
                    isSelected={allSelected}
                    isIndeterminate={!allSelected}
                    onChange={onToggleAll}
                />
            )}
            {countText}
            {selectAll}
            <Button color="link-gray" size="sm" className="shrink-0" onClick={onClear} data-bulk-clear>
                Clear
            </Button>
            <div className="ml-auto flex items-center gap-2">
                {shown.map((a) => (
                    <Button key={a.id} color="secondary" size="xs" iconLeading={a.icon} isDisabled={a.isDisabled} onClick={a.onAction} data-bulk-action={a.id}>
                        {a.label}
                    </Button>
                ))}
                {more}
            </div>
        </div>
    );
};
