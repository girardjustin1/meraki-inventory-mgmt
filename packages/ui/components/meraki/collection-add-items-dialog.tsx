"use client";

import { useMemo, useState } from "react";
import { SearchLg, XClose } from "@untitledui/icons";
import { Checkbox as AriaCheckbox } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { ItemThumb } from "@/components/meraki/item-thumb";
import type { StockRow } from "@/data/inventory";
import type { ItemKind } from "@/data/types";
import { formatQty } from "@/engine/stock";
import { cx } from "@/utils/cx";

const PAGE = 60;

const KIND_LABEL: Record<ItemKind, string> = { supply: "Supplies", polish: "Polish", tips: "Gel-X tips" };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const haystack = (r: StockRow) =>
    [r.item.name, r.item.brand, r.item.colorCode, r.item.sku, r.item.category, r.level.area, r.level.shelf].filter(Boolean).join(" ").toLowerCase();

/** Where the item lives, in a couple of words: the shelf when it has one, the area otherwise. */
const placeOf = (r: StockRow) => (r.item.kind === "polish" ? (r.item.colorCode ?? r.level.shelf) : r.level.shelf ? `Shelf ${r.level.shelf}` : r.level.area);

export interface CollectionAddItemsDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    /** What can be added: the stock rows at this location, without the items already in the collection. */
    rows: StockRow[];
    /** Called with the chosen item ids, in the order they were ticked. The dialog then closes. */
    onAdd: (itemIds: string[]) => void;
    /** Completes the title: "Add items to Pedicure station". */
    collectionName?: string;
}

/**
 * Pick items to add to a manual collection: search, tick, and a footer that keeps count.
 * A dialog on desktop and a full-screen sheet on a phone. Renders at most 60 rows at a time.
 */
export const CollectionAddItemsDialog = ({ isOpen, onOpenChange, ...props }: CollectionAddItemsDialogProps) => (
    <ModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        className="max-sm:items-stretch max-sm:px-0 max-sm:[--modal-pb:0px] max-sm:[--modal-pt:0px]"
    >
        <Modal className="max-sm:rounded-none sm:max-w-xl">
            <Dialog aria-label={props.collectionName ? `Add items to ${props.collectionName}` : "Add items"} className="max-sm:h-(--visual-viewport-height)">
                <AddItemsForm {...props} onClose={() => onOpenChange(false)} />
            </Dialog>
        </Modal>
    </ModalOverlay>
);

// Mounted only while the dialog is open, so every opening starts with nothing ticked.
const AddItemsForm = ({ rows, onAdd, collectionName, onClose }: Omit<CollectionAddItemsDialogProps, "isOpen" | "onOpenChange"> & { onClose: () => void }) => {
    const [query, setQuery] = useState("");
    const [kind, setKind] = useState<ItemKind | "all">("all");
    const [selected, setSelected] = useState<string[]>([]);
    const [limit, setLimit] = useState(PAGE);

    const kinds = useMemo(() => (["supply", "polish", "tips"] as const).filter((k) => rows.some((r) => r.item.kind === k)), [rows]);
    const indexed = useMemo(() => rows.map((row) => ({ row, text: haystack(row) })), [rows]);
    const matches = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        return indexed.filter(({ row, text }) => (kind === "all" || row.item.kind === kind) && words.every((w) => text.includes(w))).map(({ row }) => row);
    }, [indexed, query, kind]);
    const shown = matches.slice(0, limit);

    const toggle = (id: string, on: boolean) => setSelected((ids) => (on ? [...ids.filter((x) => x !== id), id] : ids.filter((x) => x !== id)));

    return (
        <div className="flex min-h-full w-full flex-col sm:min-h-[min(40rem,80dvh)]">
            <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-secondary bg-primary px-4 pt-3 pb-3 sm:px-6 sm:pt-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="min-w-0 truncate text-lg font-semibold text-primary">{collectionName ? `Add items to ${collectionName}` : "Add items"}</h2>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className="-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                    >
                        <XClose className="size-5" aria-hidden="true" />
                    </button>
                </div>
                <div className="flex gap-2">
                    <Input
                        aria-label="Search items"
                        placeholder="Search items"
                        icon={SearchLg}
                        size="md"
                        value={query}
                        onChange={(next) => {
                            setQuery(next);
                            setLimit(PAGE);
                        }}
                        autoFocus
                        className="min-w-0 flex-1"
                        inputClassName="min-h-11 sm:min-h-0"
                        data-testid="add-items-search"
                    />
                    {kinds.length > 1 && (
                        <NativeSelect
                            aria-label="Type of item"
                            size="md"
                            value={kind}
                            onChange={(event) => {
                                setKind(event.currentTarget.value as ItemKind | "all");
                                setLimit(PAGE);
                            }}
                            options={[{ label: "All types", value: "all" }, ...kinds.map((k) => ({ label: KIND_LABEL[k], value: k }))]}
                            className="w-36 shrink-0"
                            selectClassName="min-h-11 sm:min-h-0 pr-8"
                        />
                    )}
                </div>
            </header>

            <div className="flex flex-1 flex-col">
                {shown.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-tertiary sm:px-6" role="status">
                        {rows.length === 0
                            ? "Every item at this location is already in the collection."
                            : query.trim()
                              ? `No items match "${query.trim()}". Check the spelling or search by colour code.`
                              : "No items of this type to add."}
                    </p>
                ) : (
                    <ul className="divide-y divide-secondary" aria-label="Items you can add">
                        {shown.map((r) => (
                            <li key={r.item.id}>
                                <AriaCheckbox
                                    isSelected={selected.includes(r.item.id)}
                                    onChange={(on) => toggle(r.item.id, on)}
                                    data-testid="add-items-row"
                                    className={({ isSelected, isHovered }) =>
                                        cx(
                                            "flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 transition duration-100 ease-linear sm:px-6",
                                            isSelected ? "bg-brand-primary_alt" : isHovered && "bg-primary_hover",
                                        )
                                    }
                                >
                                    {({ isSelected, isFocusVisible }) => (
                                        <>
                                            <CheckboxBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} />
                                            <ItemThumb item={r.item} size="md" />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="truncate text-sm font-medium text-primary">{r.item.name}</span>
                                                <span className="truncate text-xs text-tertiary">{[r.item.brand, placeOf(r)].filter(Boolean).join(" · ")}</span>
                                            </span>
                                            <span className="shrink-0 text-sm text-tertiary tabular-nums">{formatQty(r.level, r.item.unit)}</span>
                                        </>
                                    )}
                                </AriaCheckbox>
                            </li>
                        ))}
                    </ul>
                )}
                {matches.length > shown.length && (
                    <div className="flex flex-col items-center gap-1 border-t border-secondary px-4 py-3">
                        <Button size="sm" color="link-color" onClick={() => setLimit((n) => n + PAGE)} className="min-h-11 sm:min-h-0">
                            Show more
                        </Button>
                        <p className="text-xs text-tertiary">
                            Showing {shown.length.toLocaleString("en-US")} of {matches.length.toLocaleString("en-US")}. Search to narrow the list.
                        </p>
                    </div>
                )}
            </div>

            <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-secondary bg-primary px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
                <span
                    data-testid="add-items-count"
                    aria-live="polite"
                    className={cx(
                        "rounded-full px-2.5 py-1 text-sm font-medium tabular-nums",
                        selected.length ? "bg-brand-primary_alt text-brand-secondary" : "bg-secondary text-quaternary",
                    )}
                >
                    {plural(selected.length, "item")} selected
                </span>
                <div className="flex gap-2">
                    <Button size="md" color="secondary" onClick={onClose} className="max-sm:min-h-11">
                        Cancel
                    </Button>
                    <Button
                        size="md"
                        color="primary"
                        isDisabled={selected.length === 0}
                        onClick={() => {
                            onAdd(selected);
                            onClose();
                        }}
                        data-testid="add-items-confirm"
                        className="max-sm:min-h-11"
                    >
                        Add
                    </Button>
                </div>
            </footer>
        </div>
    );
};
