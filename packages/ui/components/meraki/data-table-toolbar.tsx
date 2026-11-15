"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronSelectorVertical, Columns03, FilterLines, Plus, SearchLg, SwitchVertical01, XClose } from "@untitledui/icons";
import type { Selection } from "react-aria-components";
import {
    Button as AriaButton,
    Dialog as AriaDialog,
    DialogTrigger as AriaDialogTrigger,
    Modal as AriaModal,
    ModalOverlay as AriaModalOverlay,
    Popover as AriaPopover,
    SubmenuTrigger as AriaSubmenuTrigger,
} from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

/** A saved way of looking at the list: "All", "Low", "Out". The count sits beside the label. */
export interface ToolbarView {
    id: string;
    label: string;
    count?: number;
}

export interface ToolbarFilterOption {
    id: string;
    label: string;
    count?: number;
}

/** One thing the list can be narrowed by. Picking values adds a removable chip to the bar. */
export interface ToolbarFilter {
    id: string;
    label: string;
    options: ToolbarFilterOption[];
    /** Allow more than one value at a time (they are OR-ed). Defaults to true. */
    multiple?: boolean;
}

/** Filter id → the option ids picked for it. A filter with nothing picked is left out. */
export type ActiveFilters = Record<string, string[]>;

export interface ToolbarSort {
    id: string;
    label: string;
}

export interface ToolbarColumn {
    id: string;
    label: string;
    /** Always shown: the checkbox is ticked and disabled. */
    locked?: boolean;
}

export interface DataTableToolbarProps {
    /** What the list holds, for accessible names: "supplies". */
    label: string;
    views?: ToolbarView[];
    view?: string;
    onViewChange?: (id: string) => void;
    query: string;
    onQueryChange: (query: string) => void;
    searchPlaceholder?: string;
    /** Shorter placeholder for a phone, where the search field is narrow. */
    compactSearchPlaceholder?: string;
    filters?: ToolbarFilter[];
    activeFilters?: ActiveFilters;
    onFiltersChange?: (next: ActiveFilters) => void;
    sorts?: ToolbarSort[];
    sort?: string;
    onSortChange?: (id: string) => void;
    /** Optional columns. Only offered on desktop, where there is a table to put them in. */
    columns?: ToolbarColumn[];
    visibleColumns?: string[];
    onColumnsChange?: (ids: string[]) => void;
    /** Short result line shown beside the chips: "36 of 145 supplies". */
    summary?: ReactNode;
    /** Extra control at the end of the bar (for example a "Select" button on a phone). */
    trailing?: ReactNode;
    /** Open the columns popover on first render. For stories. */
    defaultColumnsOpen?: boolean;
    className?: string;
}

const setOf = (selection: Selection, all: string[]) => (selection === "all" ? all : [...selection].map(String));

const withFilter = (active: ActiveFilters, id: string, values: string[]): ActiveFilters => {
    const next = { ...active };
    if (values.length) next[id] = values;
    else delete next[id];
    return next;
};

const chipValue = (filter: ToolbarFilter, values: string[]) => {
    const labels = values.map((v) => filter.options.find((o) => o.id === v)?.label ?? v);
    return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
};

const barButton =
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-secondary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 min-h-9 max-lg:min-h-11";

/**
 * The one control bar above a list: a view picker with counts, search, "Add filter" chips, sort
 * and a columns button. On a phone it collapses to the view picker, search and a single Filters
 * button that opens a sheet.
 */
export const DataTableToolbar = ({
    label,
    views = [],
    view,
    onViewChange,
    query,
    onQueryChange,
    searchPlaceholder = "Search and filter",
    compactSearchPlaceholder,
    filters = [],
    activeFilters = {},
    onFiltersChange,
    sorts = [],
    sort,
    onSortChange,
    columns = [],
    visibleColumns = [],
    onColumnsChange,
    summary,
    trailing,
    defaultColumnsOpen,
    className,
}: DataTableToolbarProps) => {
    const isDesktop = useBreakpoint("lg");
    const [sheetOpen, setSheetOpen] = useState(false);

    const currentView = views.find((v) => v.id === view) ?? views[0];
    const active = filters.filter((f) => (activeFilters[f.id]?.length ?? 0) > 0);
    const activeCount = active.reduce((n, f) => n + (activeFilters[f.id]?.length ?? 0), 0);
    const setFilter = (id: string, values: string[]) => onFiltersChange?.(withFilter(activeFilters, id, values));

    const optionMenu = (filter: ToolbarFilter) => (
        <Dropdown.Menu
            aria-label={filter.label}
            selectionMode={filter.multiple === false ? "single" : "multiple"}
            selectedKeys={new Set(activeFilters[filter.id] ?? [])}
            onSelectionChange={(keys) =>
                setFilter(
                    filter.id,
                    setOf(
                        keys,
                        filter.options.map((o) => o.id),
                    ),
                )
            }
            className="max-h-72"
        >
            {filter.options.map((option) => (
                <Dropdown.Item
                    key={option.id}
                    id={option.id}
                    textValue={option.label}
                    label={option.label}
                    addon={option.count?.toLocaleString("en-US")}
                    selectionIndicator={filter.multiple === false ? "checkmark" : "checkbox"}
                />
            ))}
        </Dropdown.Menu>
    );

    const chips = active.map((filter) => (
        <span
            key={filter.id}
            data-filter-chip={filter.id}
            className="inline-flex shrink-0 items-center rounded-full bg-secondary text-sm text-secondary ring-1 ring-secondary ring-inset"
        >
            <Dropdown.Root>
                <AriaButton
                    className={({ isFocusVisible }) =>
                        cx(
                            "flex min-h-7 cursor-pointer items-center gap-1 rounded-l-full py-0.5 pr-1 pl-2.5 outline-focus-ring max-lg:min-h-9",
                            isFocusVisible && "outline-2",
                        )
                    }
                >
                    <span className="text-tertiary">{filter.label}:</span>
                    <span className="max-w-48 truncate font-semibold">{chipValue(filter, activeFilters[filter.id] ?? [])}</span>
                </AriaButton>
                <Dropdown.Popover placement="bottom left" className="w-60">
                    {optionMenu(filter)}
                </Dropdown.Popover>
            </Dropdown.Root>
            <AriaButton
                aria-label={`Remove ${filter.label} filter`}
                onPress={() => setFilter(filter.id, [])}
                className={({ isFocusVisible }) =>
                    cx(
                        "flex min-h-7 cursor-pointer items-center rounded-r-full pr-2 pl-1 text-fg-quaternary outline-focus-ring hover:text-fg-quaternary_hover max-lg:min-h-9 max-lg:pr-2.5",
                        isFocusVisible && "outline-2",
                    )
                }
            >
                <XClose className="size-3.5 stroke-[2.5px]" aria-hidden="true" />
            </AriaButton>
        </span>
    ));

    const viewPicker = currentView && (
        <Dropdown.Root>
            <AriaButton aria-label={`View: ${currentView.label}`} data-toolbar-view className={cx(barButton, "pr-1.5")}>
                <span className="max-w-28 truncate">{currentView.label}</span>
                {currentView.count !== undefined && (
                    <span className="font-medium text-quaternary tabular-nums">{currentView.count.toLocaleString("en-US")}</span>
                )}
                <ChevronSelectorVertical className="size-4 text-fg-quaternary" aria-hidden="true" />
            </AriaButton>
            <Dropdown.Popover placement="bottom left" className="w-56">
                <Dropdown.Menu
                    aria-label="View"
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={new Set([currentView.id])}
                    onSelectionChange={(keys) => {
                        const next = setOf(
                            keys,
                            views.map((v) => v.id),
                        )[0];
                        if (next) onViewChange?.(next);
                    }}
                >
                    {views.map((v) => (
                        <Dropdown.Item key={v.id} id={v.id} textValue={v.label} label={v.label} addon={v.count?.toLocaleString("en-US")} />
                    ))}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const search = (
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 focus-within:ring-2 focus-within:ring-brand">
            <SearchLg className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
            <span className="sr-only">Search {label}</span>
            <input
                type="text"
                role="searchbox"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(e) => onQueryChange(e.currentTarget.value)}
                placeholder={isDesktop ? searchPlaceholder : (compactSearchPlaceholder ?? searchPlaceholder)}
                className="min-h-9 w-full min-w-0 bg-transparent text-sm text-primary outline-hidden placeholder:text-placeholder max-lg:min-h-11 max-lg:text-md"
            />
            {query && (
                <AriaButton
                    aria-label="Clear search"
                    onPress={() => onQueryChange("")}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring hover:text-fg-quaternary_hover focus-visible:outline-2"
                >
                    <XClose className="size-4" aria-hidden="true" />
                </AriaButton>
            )}
        </label>
    );

    const sortMenu = (
        <Dropdown.Menu
            aria-label="Sort"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set(sort ? [sort] : [])}
            onSelectionChange={(keys) => {
                const next = setOf(
                    keys,
                    sorts.map((s) => s.id),
                )[0];
                if (next) onSortChange?.(next);
            }}
        >
            {sorts.map((s) => (
                <Dropdown.Item key={s.id} id={s.id} textValue={s.label} label={s.label} />
            ))}
        </Dropdown.Menu>
    );

    return (
        <div
            role="group"
            aria-label={`Search and filter ${label}`}
            className={cx("rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset", className)}
        >
            <div className="flex items-center gap-1 p-1.5">
                {viewPicker}
                {viewPicker && <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-secondary" />}
                {search}

                {isDesktop ? (
                    <>
                        {filters.length > 0 && (
                            <Dropdown.Root>
                                <AriaButton data-toolbar-add-filter className={barButton}>
                                    <Plus className="size-4 text-fg-quaternary" aria-hidden="true" />
                                    Add filter
                                </AriaButton>
                                <Dropdown.Popover className="w-52">
                                    <Dropdown.Menu aria-label="Add filter" selectionMode="none">
                                        {filters.map((filter) => (
                                            <AriaSubmenuTrigger key={filter.id}>
                                                <Dropdown.Item
                                                    id={filter.id}
                                                    textValue={filter.label}
                                                    label={filter.label}
                                                    addon={activeFilters[filter.id]?.length ? String(activeFilters[filter.id]?.length) : undefined}
                                                />
                                                <Dropdown.Popover placement="left top" offset={-6} className="w-60">
                                                    {optionMenu(filter)}
                                                </Dropdown.Popover>
                                            </AriaSubmenuTrigger>
                                        ))}
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown.Root>
                        )}
                        {sorts.length > 0 && (
                            <Dropdown.Root>
                                <AriaButton
                                    aria-label={`Sort: ${sorts.find((s) => s.id === sort)?.label ?? "default"}`}
                                    data-toolbar-sort
                                    className={barButton}
                                >
                                    <SwitchVertical01 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                    Sort
                                </AriaButton>
                                <Dropdown.Popover className="w-64">{sortMenu}</Dropdown.Popover>
                            </Dropdown.Root>
                        )}
                        {columns.length > 0 && (
                            <AriaDialogTrigger defaultOpen={defaultColumnsOpen}>
                                <AriaButton data-toolbar-columns className={barButton}>
                                    <Columns03 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                    Columns
                                </AriaButton>
                                <AriaPopover
                                    placement="bottom end"
                                    offset={6}
                                    className={({ isEntering, isExiting }) =>
                                        cx(
                                            "w-64 origin-(--trigger-anchor-point) overflow-auto rounded-lg bg-primary shadow-lg ring-1 ring-secondary_alt will-change-transform",
                                            isEntering && "duration-150 ease-out animate-in fade-in placement-bottom:slide-in-from-top-0.5",
                                            isExiting && "duration-100 ease-in animate-out fade-out",
                                        )
                                    }
                                >
                                    <AriaDialog aria-label="Columns" className="flex flex-col gap-1 p-3 outline-hidden">
                                        <p className="pb-1 text-xs font-semibold text-quaternary">Columns</p>
                                        {columns.map((column) => (
                                            <Checkbox
                                                key={column.id}
                                                size="sm"
                                                label={column.label}
                                                className="min-h-8 items-center"
                                                isDisabled={column.locked}
                                                isSelected={column.locked || visibleColumns.includes(column.id)}
                                                onChange={(on) =>
                                                    onColumnsChange?.(
                                                        columns
                                                            .filter((c) => !c.locked && (c.id === column.id ? on : visibleColumns.includes(c.id)))
                                                            .map((c) => c.id),
                                                    )
                                                }
                                            />
                                        ))}
                                    </AriaDialog>
                                </AriaPopover>
                            </AriaDialogTrigger>
                        )}
                    </>
                ) : (
                    (filters.length > 0 || sorts.length > 0) && (
                        <AriaButton data-toolbar-filters onPress={() => setSheetOpen(true)} className={cx(barButton, "relative")}>
                            <FilterLines className="size-5 text-fg-quaternary" aria-hidden="true" />
                            Filters
                            {activeCount > 0 && (
                                <span className="flex size-5 items-center justify-center rounded-full bg-brand-solid text-xs font-semibold text-white tabular-nums">
                                    {activeCount}
                                </span>
                            )}
                        </AriaButton>
                    )
                )}
                {trailing}
            </div>

            {(chips.length > 0 || summary) && (
                <div className="flex items-center gap-2 border-t border-secondary px-2.5 py-2 max-lg:scrollbar-hide max-lg:overflow-x-auto lg:flex-wrap">
                    {chips}
                    {chips.length > 0 && (
                        <Button color="link-gray" size="sm" className="shrink-0 max-lg:min-h-9 max-lg:px-1" onClick={() => onFiltersChange?.({})}>
                            Clear filters
                        </Button>
                    )}
                    {summary && (
                        <p aria-live="polite" className="ml-auto shrink-0 pl-2 text-sm text-tertiary">
                            {summary}
                        </p>
                    )}
                </div>
            )}

            {!isDesktop && (
                <AriaModalOverlay
                    isOpen={sheetOpen}
                    onOpenChange={setSheetOpen}
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
                                "mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl bg-primary shadow-xl outline-hidden",
                                isEntering && "duration-200 ease-out animate-in slide-in-from-bottom-8",
                                isExiting && "duration-150 ease-in animate-out slide-out-to-bottom-8",
                            )
                        }
                    >
                        <AriaDialog aria-label={`Filter and sort ${label}`} className="flex min-h-0 flex-col outline-hidden">
                            <header className="flex items-center justify-between gap-3 border-b border-secondary px-4 py-2">
                                <h2 className="text-md font-semibold text-primary">Filters</h2>
                                <AriaButton
                                    aria-label="Close"
                                    onPress={() => setSheetOpen(false)}
                                    className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring focus-visible:outline-2"
                                >
                                    <XClose className="size-5" aria-hidden="true" />
                                </AriaButton>
                            </header>
                            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
                                {sorts.length > 0 && (
                                    <SheetSection title="Sort by">
                                        {sorts.map((s) => (
                                            <SheetChip key={s.id} selected={s.id === sort} onPress={() => onSortChange?.(s.id)}>
                                                {s.label}
                                            </SheetChip>
                                        ))}
                                    </SheetSection>
                                )}
                                {filters.map((filter) => {
                                    const picked = activeFilters[filter.id] ?? [];
                                    return (
                                        <SheetSection key={filter.id} title={filter.label}>
                                            {filter.options.map((option) => {
                                                const selected = picked.includes(option.id);
                                                return (
                                                    <SheetChip
                                                        key={option.id}
                                                        selected={selected}
                                                        count={option.count}
                                                        onPress={() =>
                                                            setFilter(
                                                                filter.id,
                                                                selected
                                                                    ? picked.filter((p) => p !== option.id)
                                                                    : filter.multiple === false
                                                                      ? [option.id]
                                                                      : [...picked, option.id],
                                                            )
                                                        }
                                                    >
                                                        {option.label}
                                                    </SheetChip>
                                                );
                                            })}
                                        </SheetSection>
                                    );
                                })}
                            </div>
                            <footer className="flex gap-3 border-t border-secondary px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                                <Button
                                    color="secondary"
                                    size="md"
                                    className="min-h-11 shrink-0"
                                    isDisabled={activeCount === 0}
                                    onClick={() => onFiltersChange?.({})}
                                >
                                    Clear filters
                                </Button>
                                <Button size="md" className="min-h-11 flex-1" onClick={() => setSheetOpen(false)}>
                                    Done
                                </Button>
                            </footer>
                        </AriaDialog>
                    </AriaModal>
                </AriaModalOverlay>
            )}
        </div>
    );
};

const SheetSection = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
            {children}
        </div>
    </section>
);

const SheetChip = ({ selected, count, onPress, children }: { selected: boolean; count?: number; onPress: () => void; children: ReactNode }) => (
    <button
        type="button"
        aria-pressed={selected}
        onClick={onPress}
        className={cx(
            "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
            selected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary",
        )}
    >
        {children}
        {count !== undefined && (
            <span className={cx("tabular-nums", selected ? "text-brand-secondary" : "text-quaternary")}>{count.toLocaleString("en-US")}</span>
        )}
    </button>
);

/** Small "filter by value" helper for screens: true when the row passes every active filter. */
export const passesFilters = <T,>(row: T, active: ActiveFilters, read: Record<string, (row: T) => string | string[] | undefined>) =>
    Object.entries(active).every(([id, values]) => {
        const get = read[id];
        if (!get || values.length === 0) return true;
        const value = get(row);
        if (value === undefined) return false;
        return Array.isArray(value) ? value.some((v) => values.includes(v)) : values.includes(value);
    });
