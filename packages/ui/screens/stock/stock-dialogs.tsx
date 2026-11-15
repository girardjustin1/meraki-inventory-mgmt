"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle, XClose } from "@untitledui/icons";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import { Select } from "@/components/base/select/select";
import { Toggle } from "@/components/base/toggle/toggle";
import { ROUTES } from "@/components/meraki/app-shell";
import { quantityText } from "@/components/meraki/quantity-stepper";
import type { StockRow } from "@/data/inventory";
import { ROLE_LABEL, TODAY, locationName, users, vendors } from "@/data/inventory";
import type { LocationId, User, VendorId } from "@/data/types";
import { addDays, formatDate } from "@/engine/dates";
import { can } from "@/engine/permissions";
import { cx } from "@/utils/cx";
import { plural } from "./stock-shared";

interface FrameProps {
    title: string;
    description?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
}

/** Header, scrolling body and a footer of actions. Shared by the small bulk-action dialogs. */
const Frame = ({ title, description, onClose, children, footer }: FrameProps) => (
    <div className="flex max-h-[inherit] w-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-secondary px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="text-lg font-semibold text-primary">{title}</h2>
                {description && <p className="text-sm text-tertiary">{description}</p>}
            </div>
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
            >
                <XClose className="size-5" aria-hidden="true" />
            </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        <footer className="flex gap-3 border-t border-secondary px-4 py-3 sm:justify-end sm:px-6">{footer}</footer>
    </div>
);

/** What a dialog shows once its action has gone through: what happened, in plain words, and where to look. */
const Done = ({ title, children, href, linkLabel, onClose }: { title: string; children: ReactNode; href: string; linkLabel: string; onClose: () => void }) => (
    <div data-testid="bulk-done" className="flex w-full flex-col items-center gap-5 p-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-secondary text-fg-success-primary">
            <CheckCircle className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5" role="status">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            <div className="flex flex-col gap-1 text-sm text-tertiary">{children}</div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button color="secondary" size="md" className="min-h-11" href={href}>
                {linkLabel}
            </Button>
            <Button size="md" className="min-h-11 sm:min-w-28" onClick={onClose}>
                Done
            </Button>
        </div>
    </div>
);

const Shell = ({ label, isOpen, onClose, children }: { label: string; isOpen: boolean; onClose: () => void; children: ReactNode }) => (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
        <Modal className="sm:max-w-lg">
            <Dialog aria-label={label}>{children}</Dialog>
        </Modal>
    </ModalOverlay>
);

interface BulkDialogProps {
    rows: StockRow[];
    location: LocationId;
    isOpen: boolean;
    onClose: () => void;
}

// ------------------------------------------------------------------------------------ add to order

/** Suggested quantity for a line: what the forecast suggests, and never less than one. */
export const orderQty = (row: StockRow) => Math.max(1, row.forecast?.suggestedOrderQty ?? 0);

export const AddToOrderDialog = ({ rows, location, isOpen, onClose }: BulkDialogProps) => (
    <Shell label="Add to order" isOpen={isOpen} onClose={onClose}>
        <AddToOrderBody rows={rows} location={location} onClose={onClose} />
    </Shell>
);

const AddToOrderBody = ({ rows, location, onClose }: Omit<BulkDialogProps, "isOpen">) => {
    const [created, setCreated] = useState(false);
    const groups = [...new Map(rows.map((r) => [r.vendor.id, r.vendor])).values()]
        .map((vendor) => ({ vendor, lines: rows.filter((r) => r.vendor.id === vendor.id) }))
        .sort((a, b) => b.lines.length - a.lines.length);
    const orders = plural(groups.length, "draft order");

    if (created) {
        return (
            <Done title={`${orders} would be created`} href={ROUTES.newOrder} linkLabel="Open the order builder" onClose={onClose}>
                <p>
                    {groups.map((g) => `${g.vendor.name} (${plural(g.lines.length, "line")})`).join(", ")}, for {locationName(location)}.
                </p>
                <p>Drafts are not sent to anyone. In the prototype nothing is saved: build the order from the order builder.</p>
            </Done>
        );
    }

    return (
        <Frame
            title="Add to order"
            description={
                <span data-testid="order-summary">
                    {plural(groups.length, "vendor")}, {plural(rows.length, "line")}. One draft order per vendor, at the suggested quantities.
                </span>
            }
            onClose={onClose}
            footer={
                <>
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="md" className="min-h-11 max-sm:flex-1" onClick={() => setCreated(true)} data-testid="create-drafts">
                        Create {orders}
                    </Button>
                </>
            }
        >
            {groups.map((g) => (
                <section key={g.vendor.id} className="flex flex-col gap-1.5">
                    <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold text-secondary">
                        {g.vendor.name}
                        <span className="text-xs font-medium text-tertiary">{plural(g.lines.length, "line")}</span>
                    </h3>
                    <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                        {g.lines.map((r) => (
                            <li key={r.item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0 truncate text-sm text-secondary">{r.item.name}</span>
                                <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{quantityText(orderQty(r), r.item.unit)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            <p className="text-xs text-tertiary">
                Quantities come from the forecast. Items with nothing suggested are added as 1 so you can set the number in the draft.
            </p>
        </Frame>
    );
};

// ------------------------------------------------------------------------------------ count these

export const CountTheseDialog = ({ rows, location, isOpen, onClose, user }: BulkDialogProps & { user: User }) => (
    <Shell label="Count these" isOpen={isOpen} onClose={onClose}>
        <CountTheseBody rows={rows} location={location} onClose={onClose} user={user} />
    </Shell>
);

const CountTheseBody = ({ rows, location, onClose, user }: Omit<BulkDialogProps, "isOpen"> & { user: User }) => {
    const people = users.filter((u) => u.locations.includes(location) && can(u, "stock.count", location));
    const [name, setName] = useState(`Spot count: ${plural(rows.length, "item")}`);
    const [assigneeId, setAssigneeId] = useState<string | null>(null);
    const [due, setDue] = useState(addDays(TODAY, 1));
    const [blind, setBlind] = useState(true);
    const [tried, setTried] = useState(false);
    const [scheduled, setScheduled] = useState(false);

    const assignee = people.find((p) => p.id === assigneeId);
    const dueOk = /^\d{4}-\d{2}-\d{2}$/.test(due) && due >= TODAY;
    const nameOk = name.trim().length > 0;

    if (scheduled && assignee) {
        return (
            <Done title={`Count scheduled: ${plural(rows.length, "item")}`} href={ROUTES.counts} linkLabel="View counts" onClose={onClose}>
                <p>
                    "{name.trim()}" is assigned to {assignee.id === user.id ? "you" : assignee.name}, due {formatDate(due)}.{" "}
                    {blind ? "It is a blind count: expected quantities stay hidden while counting." : "Expected quantities are shown while counting."}
                </p>
                <p>In the prototype the count is not saved and nobody is notified.</p>
            </Done>
        );
    }

    return (
        <Frame
            title="Count these"
            description={`Schedule a count of the ${plural(rows.length, "selected item")} at ${locationName(location)}.`}
            onClose={onClose}
            footer={
                <>
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="md"
                        className="min-h-11 max-sm:flex-1"
                        data-testid="schedule-count"
                        onClick={() => {
                            setTried(true);
                            if (assignee && dueOk && nameOk) setScheduled(true);
                        }}
                    >
                        Schedule count
                    </Button>
                </>
            }
        >
            <Input
                label="Name"
                size="md"
                value={name}
                onChange={setName}
                isRequired
                hideRequiredIndicator
                isInvalid={tried && !nameOk}
                inputClassName="min-h-11"
            />
            <Select
                label="Who counts"
                size="md"
                placeholder="Choose a person"
                isRequired
                hideRequiredIndicator
                items={people.map((p) => ({ id: p.id, label: p.id === user.id ? `${p.name} (you)` : p.name, supportingText: ROLE_LABEL[p.role] }))}
                value={assigneeId}
                onChange={(key) => setAssigneeId(key ? String(key) : null)}
                isInvalid={tried && !assignee}
                hint={tried && !assignee ? "Choose who counts." : `People who can count at ${locationName(location)}.`}
            >
                {(option) => (
                    <Select.Item id={option.id} supportingText={option.supportingText}>
                        {option.label}
                    </Select.Item>
                )}
            </Select>
            <Input
                label="Due"
                type="date"
                size="md"
                value={due}
                onChange={setDue}
                isRequired
                hideRequiredIndicator
                isInvalid={tried && !dueOk}
                hint={tried && !dueOk ? "Choose today or later." : undefined}
                inputClassName="min-h-11"
            />
            <Toggle
                size="md"
                isSelected={blind}
                onChange={setBlind}
                label="Blind count"
                hint="The counter does not see the expected quantity. Gives a more honest count."
            />
        </Frame>
    );
};

// ------------------------------------------------------------------------------------ set par level

export type ParChoice = { mode: "value"; par: number } | { mode: "on-hand" };

export const SetParDialog = ({ rows, isOpen, onClose, onApply }: BulkDialogProps & { onApply: (choice: ParChoice) => void }) => (
    <Shell label="Set par level" isOpen={isOpen} onClose={onClose}>
        <SetParBody rows={rows} onClose={onClose} onApply={onApply} />
    </Shell>
);

const SetParBody = ({ rows, onClose, onApply }: { rows: StockRow[]; onClose: () => void; onApply: (choice: ParChoice) => void }) => {
    const [mode, setMode] = useState<ParChoice["mode"]>("value");
    const [text, setText] = useState("");
    const [tried, setTried] = useState(false);
    const par = Number.parseInt(text, 10);
    const ok = mode === "on-hand" || (!Number.isNaN(par) && par >= 0);
    const byLevel = rows.filter((r) => r.level.fillLevel).length;

    const option = (id: ParChoice["mode"], title: string, hint: string) => (
        <AriaRadio
            value={id}
            className={({ isSelected, isFocusVisible }) =>
                cx(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 ring-1 transition duration-100 ease-linear ring-inset",
                    isSelected ? "bg-brand-primary_alt ring-2 ring-brand" : "bg-primary ring-secondary hover:bg-primary_hover",
                    isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring",
                )
            }
        >
            {({ isSelected, isFocusVisible }) => (
                <>
                    <RadioButtonBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} />
                    <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold text-primary">{title}</span>
                        <span className="text-sm text-tertiary">{hint}</span>
                    </span>
                </>
            )}
        </AriaRadio>
    );

    return (
        <Frame
            title="Set par level"
            description={`The quantity to keep on the shelf, for ${plural(rows.length, "selected item")}.`}
            onClose={onClose}
            footer={
                <>
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="md"
                        className="min-h-11 max-sm:flex-1"
                        data-testid="apply-par"
                        onClick={() => {
                            setTried(true);
                            if (ok) onApply(mode === "value" ? { mode, par } : { mode });
                        }}
                    >
                        Set par level
                    </Button>
                </>
            }
        >
            <AriaRadioGroup aria-label="How to set it" value={mode} onChange={(v) => setMode(v as ParChoice["mode"])} className="flex flex-col gap-2">
                {option("value", "One number for all", "Every selected item gets the same par level.")}
                {option("on-hand", "Set to current on hand", "Each item's par becomes what is on the shelf now.")}
            </AriaRadioGroup>
            {mode === "value" && (
                <Input
                    label="Par level"
                    size="md"
                    inputMode="numeric"
                    placeholder="For example 6"
                    value={text}
                    onChange={(v) => /^\d{0,4}$/.test(v) && setText(v)}
                    isRequired
                    hideRequiredIndicator
                    isInvalid={tried && !ok}
                    hint={tried && !ok ? "Enter a number." : undefined}
                    inputClassName="min-h-11"
                />
            )}
            {byLevel > 0 && (
                <p className="text-xs text-tertiary">
                    {plural(byLevel, "item is", "items are")} tracked by fill level and reordered at half: {byLevel === 1 ? "it is" : "they are"} left as is.
                </p>
            )}
        </Frame>
    );
};

// ------------------------------------------------------------------------------------ change vendor

export const ChangeVendorDialog = ({ rows, isOpen, onClose, onApply }: BulkDialogProps & { onApply: (vendorId: VendorId) => void }) => (
    <Shell label="Change vendor" isOpen={isOpen} onClose={onClose}>
        <ChangeVendorBody rows={rows} onClose={onClose} onApply={onApply} />
    </Shell>
);

const ChangeVendorBody = ({ rows, onClose, onApply }: { rows: StockRow[]; onClose: () => void; onApply: (vendorId: VendorId) => void }) => {
    const [vendorId, setVendorId] = useState<VendorId | null>(null);
    const [tried, setTried] = useState(false);
    return (
        <Frame
            title="Change vendor"
            description={`Where the ${plural(rows.length, "selected item")} will be ordered from next time.`}
            onClose={onClose}
            footer={
                <>
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="md"
                        className="min-h-11 max-sm:flex-1"
                        onClick={() => {
                            setTried(true);
                            if (vendorId) onApply(vendorId);
                        }}
                    >
                        Change vendor
                    </Button>
                </>
            }
        >
            <Select
                label="Vendor"
                size="md"
                placeholder="Choose a vendor"
                isRequired
                hideRequiredIndicator
                items={vendors.map((v) => ({ id: v.id, label: v.name, supportingText: `${v.leadTimeDays}-day lead time` }))}
                value={vendorId}
                onChange={(key) => setVendorId(key ? (String(key) as VendorId) : null)}
                isInvalid={tried && !vendorId}
                hint={tried && !vendorId ? "Choose a vendor." : "Open orders are not changed."}
            >
                {(option) => (
                    <Select.Item id={option.id} supportingText={option.supportingText}>
                        {option.label}
                    </Select.Item>
                )}
            </Select>
        </Frame>
    );
};

// ------------------------------------------------------------------------------------ move

export const MoveDialog = ({
    rows,
    areas,
    isOpen,
    onClose,
    onApply,
}: BulkDialogProps & { areas: string[]; onApply: (area: string, shelf: string | undefined) => void }) => (
    <Shell label="Move to area or shelf" isOpen={isOpen} onClose={onClose}>
        <MoveBody rows={rows} areas={areas} onClose={onClose} onApply={onApply} />
    </Shell>
);

const MoveBody = ({
    rows,
    areas,
    onClose,
    onApply,
}: {
    rows: StockRow[];
    areas: string[];
    onClose: () => void;
    onApply: (area: string, shelf: string | undefined) => void;
}) => {
    const [area, setArea] = useState<string | null>(null);
    const [shelf, setShelf] = useState("");
    const [tried, setTried] = useState(false);
    return (
        <Frame
            title="Move to area or shelf"
            description={`Where the ${plural(rows.length, "selected item")} are kept. Quantities do not change.`}
            onClose={onClose}
            footer={
                <>
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="md"
                        className="min-h-11 max-sm:flex-1"
                        onClick={() => {
                            setTried(true);
                            if (area) onApply(area, shelf.trim() || undefined);
                        }}
                    >
                        Move
                    </Button>
                </>
            }
        >
            <Select
                label="Area"
                size="md"
                placeholder="Choose an area"
                isRequired
                hideRequiredIndicator
                items={areas.map((a) => ({ id: a, label: a }))}
                value={area}
                onChange={(key) => setArea(key ? String(key) : null)}
                isInvalid={tried && !area}
                hint={tried && !area ? "Choose an area." : undefined}
            >
                {(option) => <Select.Item id={option.id}>{option.label}</Select.Item>}
            </Select>
            <Input
                label="Shelf (optional)"
                size="md"
                placeholder="For example 1A"
                value={shelf}
                onChange={setShelf}
                hint="Leave empty to keep each item's shelf label."
                inputClassName="min-h-11"
            />
        </Frame>
    );
};
