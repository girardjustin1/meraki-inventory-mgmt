"use client";

import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import { ArrowLeft, ReverseLeft, ReverseRight } from "@untitledui/icons";
import { Button as AriaButton, Dialog as AriaDialog, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { ADJUST_REASONS } from "@/components/meraki/quantity-edit-popover";
import { unitWord } from "@/components/meraki/quantity-stepper";
import type { FillLevel, Item, ReasonCode } from "@/data/types";
import { REASONS_NEEDING_NOTE, REASON_LABEL } from "@/engine/reasons";
import { FILL_LABEL } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

export interface BulkEditRow {
    id: string;
    item: Pick<Item, "name" | "imageUrl" | "swatch" | "kind" | "unit">;
    /** Shelf or area label: "1A". */
    shelf?: string;
    onHand: number;
    /** Items tracked by eye are shown but their quantity is not edited in the grid. */
    fillLevel?: FillLevel;
    par?: number;
    paused: boolean;
}

/** What changed on one row. `par: null` means the par level was cleared. */
export interface BulkEditChange {
    id: string;
    onHand?: number;
    par?: number | null;
    paused?: boolean;
}

export interface BulkEditResult {
    changes: BulkEditChange[];
    /** Applies to every quantity change. Set when at least one quantity changed. */
    reason?: ReasonCode;
    note?: string;
}

export interface BulkQuantityEditorProps {
    rows: BulkEditRow[];
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    onSave: (result: BulkEditResult) => void;
    /** Singular noun in the title: "Editing 12 items". */
    noun?: string;
}

/**
 * Spreadsheet-style editor for several items at once, opened full screen from the bulk bar.
 * Arrow keys, Tab and Enter move between cells; changed cells are tinted; one reason covers every
 * quantity change; edits can be undone and redone before saving.
 */
export const BulkQuantityEditor = ({ rows, isOpen, onOpenChange, onSave, noun = "item" }: BulkQuantityEditorProps) => (
    <AriaModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isKeyboardDismissDisabled
        className={({ isEntering, isExiting }) =>
            cx(
                "fixed inset-0 z-50 bg-overlay/60 outline-hidden",
                isEntering && "duration-200 ease-out animate-in fade-in",
                isExiting && "duration-150 ease-in animate-out fade-out",
            )
        }
    >
        <AriaModal className="h-(--visual-viewport-height) w-full outline-hidden">
            <AriaDialog aria-label={`Editing ${rows.length} ${rows.length === 1 ? noun : `${noun}s`}`} className="h-full outline-hidden">
                <Grid rows={rows} noun={noun} onClose={() => onOpenChange(false)} onSave={onSave} />
            </AriaDialog>
        </AriaModal>
    </AriaModalOverlay>
);

type Field = "onHand" | "par" | "paused";
type CellValue = number | boolean | undefined;
interface RowValues {
    onHand: number;
    par: number | undefined;
    paused: boolean;
}
interface Edit {
    id: string;
    field: Field;
    prev: CellValue;
    next: CellValue;
}

const COLUMNS: Field[] = ["onHand", "par", "paused"];
const FIELD_LABEL: Record<Field, string> = { onHand: "On hand", par: "Par", paused: "Reorder paused" };

const valuesOf = (row: BulkEditRow): RowValues => ({ onHand: row.onHand, par: row.par, paused: row.paused });

// Mounted only while the editor is open, so every opening starts from the current quantities.
const Grid = ({ rows, noun, onClose, onSave }: { rows: BulkEditRow[]; noun: string; onClose: () => void; onSave: (result: BulkEditResult) => void }) => {
    const isDesktop = useBreakpoint("lg");
    const gridRef = useRef<HTMLTableElement>(null);
    const [values, setValues] = useState<Record<string, RowValues>>(() => Object.fromEntries(rows.map((r) => [r.id, valuesOf(r)])));
    const [history, setHistory] = useState<Edit[]>([]);
    const [future, setFuture] = useState<Edit[]>([]);
    const [reason, setReason] = useState<ReasonCode | null>(null);
    const [note, setNote] = useState("");
    const [tried, setTried] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);

    const write = (id: string, field: Field, value: CellValue) =>
        setValues((current) => ({ ...current, [id]: { ...(current[id] as RowValues), [field]: value } }));

    const commit = (id: string, field: Field, next: CellValue) => {
        const prev = values[id]?.[field];
        if (prev === next) return;
        write(id, field, next);
        setHistory((h) => [...h, { id, field, prev, next }]);
        setFuture([]);
    };

    const undo = () => {
        const last = history[history.length - 1];
        if (!last) return;
        write(last.id, last.field, last.prev);
        setHistory((h) => h.slice(0, -1));
        setFuture((f) => [...f, last]);
    };

    const redo = () => {
        const last = future[future.length - 1];
        if (!last) return;
        write(last.id, last.field, last.next);
        setFuture((f) => f.slice(0, -1));
        setHistory((h) => [...h, last]);
    };

    const changes: BulkEditChange[] = rows.flatMap((row) => {
        const v = values[row.id];
        if (!v) return [];
        const change: BulkEditChange = { id: row.id };
        if (v.onHand !== row.onHand) change.onHand = v.onHand;
        if (v.par !== row.par) change.par = v.par ?? null;
        if (v.paused !== row.paused) change.paused = v.paused;
        return Object.keys(change).length > 1 ? [change] : [];
    });
    const changedCells = changes.reduce((n, c) => n + Object.keys(c).length - 1, 0);
    const quantityChanges = changes.filter((c) => c.onHand !== undefined).length;
    const dirty = changedCells > 0;
    const needsNote = quantityChanges > 0 && reason !== null && REASONS_NEEDING_NOTE.includes(reason);
    const reasonMissing = quantityChanges > 0 && reason === null;
    const noteMissing = needsNote && !note.trim();

    const discard = () => {
        setValues(Object.fromEntries(rows.map((r) => [r.id, valuesOf(r)])));
        setHistory([]);
        setFuture([]);
        setTried(false);
        setConfirmClose(false);
    };

    const save = () => {
        setTried(true);
        if (!dirty || reasonMissing || noteMissing) return;
        onSave({ changes, reason: quantityChanges > 0 ? (reason ?? undefined) : undefined, note: quantityChanges > 0 ? note.trim() || undefined : undefined });
    };

    /** Move focus to the nearest editable cell in a direction, skipping cells that cannot be edited. */
    const move = (rowIndex: number, col: number, dRow: number, dCol: number) => {
        let r = rowIndex + dRow;
        let c = col + dCol;
        for (let i = 0; i < rows.length * COLUMNS.length; i++) {
            if (c >= COLUMNS.length) {
                c = 0;
                r += 1;
            } else if (c < 0) {
                c = COLUMNS.length - 1;
                r -= 1;
            }
            if (r < 0 || r >= rows.length) return;
            const target = gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
            if (target) {
                // The switch keeps its focusable input inside the cell.
                (target.matches("input") ? target : (target.querySelector<HTMLElement>("input") ?? target)).focus();
                return;
            }
            r += dRow;
            c += dCol;
        }
    };

    const onGridKey = (event: KeyboardEvent) => {
        const key = event.key.toLowerCase();
        if ((event.metaKey || event.ctrlKey) && key === "z") {
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        } else if ((event.metaKey || event.ctrlKey) && key === "y") {
            event.preventDefault();
            redo();
        }
    };

    const title = `Editing ${rows.length} ${rows.length === 1 ? noun : `${noun}s`}`;

    const saveCluster = (
        <div className="flex items-center gap-2" data-testid="bulk-save-bar">
            {confirmClose ? (
                <>
                    <p role="alert" className="mr-1 text-sm font-medium text-secondary">
                        Discard {changedCells} unsaved {changedCells === 1 ? "change" : "changes"}?
                    </p>
                    <Button color="secondary" size="sm" className="max-lg:min-h-11" onClick={() => setConfirmClose(false)}>
                        Keep editing
                    </Button>
                    <Button color="primary-destructive" size="sm" className="max-lg:min-h-11" onClick={onClose}>
                        Discard and close
                    </Button>
                </>
            ) : (
                <>
                    <p aria-live="polite" className={cx("mr-1 text-sm whitespace-nowrap", dirty ? "font-semibold text-primary" : "text-tertiary")}>
                        {dirty ? `Unsaved changes · ${changedCells}` : "No changes yet"}
                    </p>
                    <Button color="secondary" size="sm" className="max-lg:min-h-11" isDisabled={!dirty} onClick={discard} data-bulk-discard>
                        Discard
                    </Button>
                    <Button size="sm" className="max-lg:min-h-11 max-lg:min-w-24" isDisabled={!dirty} onClick={save} data-bulk-save>
                        Save
                    </Button>
                </>
            )}
        </div>
    );

    const headCell = "border-b border-secondary bg-secondary px-3 py-2 text-xs font-semibold whitespace-nowrap text-quaternary";

    return (
        // Keyboard shortcuts for the whole grid (undo, redo) are handled on the wrapper; the cells themselves are real inputs.
        <div className="flex h-full flex-col bg-secondary_alt" onKeyDown={onGridKey}>
            <header className="flex min-h-14 items-center gap-2 border-b border-secondary bg-primary px-2 py-2 lg:px-4">
                <AriaButton
                    aria-label="Close the editor"
                    onPress={() => (dirty ? setConfirmClose(true) : onClose())}
                    data-bulk-close
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 max-lg:size-11"
                >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                </AriaButton>
                <h2 className="min-w-0 truncate text-md font-semibold text-primary">{title}</h2>
                <div className="ml-auto flex items-center gap-1">
                    <AriaButton
                        aria-label="Undo"
                        isDisabled={history.length === 0}
                        onPress={undo}
                        data-bulk-undo
                        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40 max-lg:size-11"
                    >
                        <ReverseLeft className="size-5" aria-hidden="true" />
                    </AriaButton>
                    <AriaButton
                        aria-label="Redo"
                        isDisabled={future.length === 0}
                        onPress={redo}
                        data-bulk-redo
                        className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-fg-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40 max-lg:size-11"
                    >
                        <ReverseRight className="size-5" aria-hidden="true" />
                    </AriaButton>
                    {isDesktop && (
                        <>
                            <span aria-hidden="true" className="mx-2 h-6 w-px bg-border-secondary" />
                            {saveCluster}
                        </>
                    )}
                </div>
            </header>

            <div className="grid gap-3 border-b border-secondary bg-primary px-4 py-3 lg:grid-cols-[18rem_minmax(0,28rem)] lg:px-6">
                <Select
                    label="Reason for the quantity changes"
                    size="sm"
                    placeholder={quantityChanges > 0 ? "Choose a reason" : "Needed once a quantity changes"}
                    isDisabled={quantityChanges === 0}
                    isRequired={quantityChanges > 0}
                    hideRequiredIndicator
                    items={ADJUST_REASONS.map((r) => ({ id: r, label: REASON_LABEL[r] }))}
                    value={reason}
                    onChange={(key) => setReason(key ? (String(key) as ReasonCode) : null)}
                    isInvalid={tried && reasonMissing}
                    hint={
                        tried && reasonMissing
                            ? "Choose a reason before saving."
                            : quantityChanges > 0
                              ? `Applies to ${quantityChanges} quantity ${quantityChanges === 1 ? "change" : "changes"}.`
                              : undefined
                    }
                >
                    {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
                </Select>
                <Input
                    label={needsNote ? "Note" : "Note (optional)"}
                    size="sm"
                    placeholder="What happened?"
                    isDisabled={quantityChanges === 0}
                    isRequired={needsNote}
                    value={note}
                    onChange={setNote}
                    isInvalid={tried && noteMissing}
                    hint={tried && noteMissing ? "This reason needs a note." : undefined}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-auto lg:p-6">
                <table
                    ref={gridRef}
                    role="grid"
                    aria-label={title}
                    aria-rowcount={rows.length + 1}
                    className="w-full border-separate border-spacing-0 bg-primary text-sm lg:max-w-4xl lg:rounded-xl lg:shadow-xs lg:ring-1 lg:ring-secondary"
                >
                    <thead className="sticky top-0 z-10">
                        <tr>
                            <th scope="col" className={cx(headCell, "text-left lg:rounded-tl-xl lg:pl-4")}>
                                Item
                            </th>
                            <th scope="col" className={cx(headCell, "border-l text-left max-sm:hidden")}>
                                Shelf
                            </th>
                            <th scope="col" className={cx(headCell, "border-l text-right")}>
                                On hand
                            </th>
                            <th scope="col" className={cx(headCell, "border-l text-right")}>
                                Par
                            </th>
                            <th scope="col" className={cx(headCell, "border-l text-center lg:rounded-tr-xl")}>
                                <span className="max-sm:hidden">Reorder paused</span>
                                <span className="sm:hidden">Paused</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => {
                            const v = values[row.id] ?? valuesOf(row);
                            const last = rowIndex === rows.length - 1;
                            const border = cx("border-secondary", !last && "border-b");
                            return (
                                <tr key={row.id} data-bulk-row={row.id}>
                                    <th scope="row" className={cx("px-3 py-1.5 text-left font-normal lg:pl-4", border)}>
                                        <div className="flex items-center gap-2.5">
                                            <ItemThumb item={row.item} size="sm" className="max-sm:hidden" />
                                            <div className="min-w-0">
                                                <p className="line-clamp-2 text-sm font-medium text-primary sm:line-clamp-1">{row.item.name}</p>
                                                <p className="truncate text-xs text-tertiary">
                                                    {row.fillLevel ? "Tracked by fill level" : unitWord(2, row.item.unit)}
                                                    {row.shelf && <span className="sm:hidden"> · {row.shelf}</span>}
                                                </p>
                                            </div>
                                        </div>
                                    </th>
                                    <td className={cx("border-l px-3 whitespace-nowrap text-secondary max-sm:hidden", border)}>{row.shelf ?? "–"}</td>
                                    <td className={cx("border-l p-0", border)}>
                                        {row.fillLevel ? (
                                            <p
                                                className="px-3 text-right text-sm text-quaternary"
                                                title="Tracked by fill level. Change it from the stock list."
                                            >
                                                {FILL_LABEL[row.fillLevel]}
                                            </p>
                                        ) : (
                                            <NumberCell
                                                label={`On hand for ${row.item.name}`}
                                                address={`${rowIndex}:0`}
                                                value={v.onHand}
                                                original={row.onHand}
                                                onCommit={(next) => commit(row.id, "onHand", next ?? row.onHand)}
                                                onMove={(dRow, dCol) => move(rowIndex, 0, dRow, dCol)}
                                            />
                                        )}
                                    </td>
                                    <td className={cx("border-l p-0", border)}>
                                        <NumberCell
                                            label={`Par for ${row.item.name}`}
                                            address={`${rowIndex}:1`}
                                            value={v.par}
                                            original={row.par}
                                            allowEmpty
                                            onCommit={(next) => commit(row.id, "par", next)}
                                            onMove={(dRow, dCol) => move(rowIndex, 1, dRow, dCol)}
                                        />
                                    </td>
                                    <td className={cx("border-l p-0", border, v.paused !== row.paused && "bg-brand-primary_alt")}>
                                        {/* Arrow keys leave the switch for the neighbouring cell, like the number cells. */}
                                        <div
                                            data-cell={`${rowIndex}:2`}
                                            className="flex min-h-11 items-center justify-center"
                                            onKeyDown={(event) => {
                                                const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
                                                if (!step) return;
                                                event.preventDefault();
                                                move(rowIndex, 2, step[0] ?? 0, step[1] ?? 0);
                                            }}
                                        >
                                            <Toggle
                                                size="sm"
                                                aria-label={`${FIELD_LABEL.paused} for ${row.item.name}`}
                                                isSelected={v.paused}
                                                onChange={(on) => commit(row.id, "paused", on)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="px-4 py-3 text-xs text-tertiary lg:px-1">Arrow keys, Tab and Enter move between cells. Nothing changes until you save.</p>
            </div>

            {!isDesktop && (
                <footer className="flex justify-end border-t border-secondary bg-primary px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]">
                    {saveCluster}
                </footer>
            )}
        </div>
    );
};

interface NumberCellProps {
    label: string;
    /** "row:column", used to move focus between cells. */
    address: string;
    value: number | undefined;
    original: number | undefined;
    /** An empty cell clears the value (par can be unset; on hand cannot). */
    allowEmpty?: boolean;
    onCommit: (next: number | undefined) => void;
    onMove: (dRow: number, dCol: number) => void;
}

const NumberCell = ({ label, address, value, original, allowEmpty, onCommit, onMove }: NumberCellProps) => {
    // While the cell is being typed in it holds the draft; the value is committed on leaving the cell.
    const [draft, setDraft] = useState<string | null>(null);
    const changed = value !== original;
    const shown = draft ?? (value === undefined ? "" : String(value));

    const commit = () => {
        if (draft === null) return;
        const parsed = Number.parseInt(draft, 10);
        if (!Number.isNaN(parsed)) onCommit(Math.max(0, parsed));
        else if (allowEmpty && draft.trim() === "") onCommit(undefined);
        setDraft(null);
    };

    return (
        <div className={cx("relative flex items-center", changed && "bg-brand-primary_alt")}>
            {changed && (
                <span aria-hidden="true" className="pointer-events-none absolute left-2 text-xs text-tertiary tabular-nums line-through">
                    {original ?? "–"}
                </span>
            )}
            <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={changed ? `${label}, changed from ${original ?? "not set"}` : label}
                data-cell={address}
                data-changed={changed || undefined}
                placeholder={allowEmpty ? "–" : undefined}
                value={shown}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => {
                    const raw = e.currentTarget.value;
                    if (/^\d{0,5}$/.test(raw)) setDraft(raw);
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                    const input = event.currentTarget;
                    const all = input.selectionStart === 0 && input.selectionEnd === input.value.length;
                    if (event.key === "Enter") {
                        event.preventDefault();
                        commit();
                        onMove(event.shiftKey ? -1 : 1, 0);
                    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        commit();
                        onMove(event.key === "ArrowDown" ? 1 : -1, 0);
                    } else if (event.key === "ArrowRight" && (all || input.selectionStart === input.value.length)) {
                        event.preventDefault();
                        commit();
                        onMove(0, 1);
                    } else if (event.key === "ArrowLeft" && (all || input.selectionEnd === 0)) {
                        event.preventDefault();
                        commit();
                        onMove(0, -1);
                    } else if (draft !== null && (event.key === "Escape" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z"))) {
                        // Escape, or undo while typing, puts back what the cell held.
                        event.preventDefault();
                        event.stopPropagation();
                        setDraft(null);
                    }
                }}
                className={cx(
                    "min-h-11 w-full min-w-16 bg-transparent px-3 text-right text-sm text-primary tabular-nums outline-hidden placeholder:text-quaternary focus:ring-2 focus:ring-brand focus:ring-inset",
                    changed && "font-semibold",
                )}
            />
        </div>
    );
};
