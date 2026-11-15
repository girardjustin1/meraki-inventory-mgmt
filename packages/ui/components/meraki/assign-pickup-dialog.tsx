"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, CheckCircle, XClose } from "@untitledui/icons";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import { initials } from "@/components/meraki/app-shell";
import { MentionInput } from "@/components/meraki/mention-input";
import { NOTHING_SENT, NOTIFY_HOW, listNames, nowIso } from "@/components/meraki/note-body";
import { ROLE_LABEL, TODAY, locationName, userById, users } from "@/data/inventory";
import type { LocationId, PickupLine, PurchaseOrder, Task, User, Vendor } from "@/data/types";
import { addDays, formatDate, formatTime } from "@/engine/dates";
import { mentionedIds } from "@/engine/mentions";
import { cx } from "@/utils/cx";

export const PAY_OPTIONS = ["Salon card", "Reimburse", "Account"] as const;

const PAY_HINT: Record<(typeof PAY_OPTIONS)[number], string> = {
    "Salon card": "They take the salon's card with them.",
    Reimburse: "They pay and are paid back. Ask them to keep the receipt.",
    Account: "It goes on the salon's account with the store.",
};

/** The pick list for a run: every line with a quantity, with the same item on two orders added together. */
export const pickupLinesFor = (orders: PurchaseOrder[]): PickupLine[] => {
    const byKey = new Map<string, PickupLine>();
    for (const line of orders.flatMap((o) => o.lines.filter((l) => l.qtyOrdered > 0))) {
        const key = line.itemId ?? line.name;
        const existing = byKey.get(key);
        if (existing) existing.qty += line.qtyOrdered;
        else byKey.set(key, { name: line.name, itemId: line.itemId, qty: line.qtyOrdered });
    }
    return [...byKey.values()];
};

export interface AssignPickupDialogProps {
    /** One or more orders for the same vendor. Their lines become the pick list. */
    orders: PurchaseOrder[];
    vendor: Vendor;
    location: LocationId;
    /** The person asking. */
    user: User;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    /** Called with the new pickup-run task as soon as it is assigned. The dialog then shows who will be notified. */
    onAssign: (task: Task) => void;
}

/**
 * Send someone to a store for an order.
 * A dialog on desktop and a full-screen sheet on a phone. It builds a pickup-run task; it does not
 * change the order or the stock.
 */
export const AssignPickupDialog = ({ isOpen, onOpenChange, ...props }: AssignPickupDialogProps) => (
    <ModalOverlay
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        isDismissable
        className="max-sm:items-stretch max-sm:px-0 max-sm:[--modal-pb:0px] max-sm:[--modal-pt:0px]"
    >
        <Modal className="max-sm:rounded-none sm:max-w-xl">
            <Dialog aria-label={`Send someone to ${props.vendor.name}`} className="max-sm:h-(--visual-viewport-height)">
                <AssignPickupForm {...props} onClose={() => onOpenChange(false)} />
            </Dialog>
        </Modal>
    </ModalOverlay>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
    <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-secondary">{title}</h3>
            {hint && <p className="text-sm text-tertiary">{hint}</p>}
        </div>
        {children}
    </section>
);

type FormProps = Omit<AssignPickupDialogProps, "isOpen" | "onOpenChange"> & { onClose: () => void };

// Mounted only while the dialog is open, so every opening starts from a clean form.
const AssignPickupForm = ({ orders, vendor, location, user, onAssign, onClose }: FormProps) => {
    const people = users.filter((u) => u.locations.includes(location));
    const lines = pickupLinesFor(orders);
    const units = lines.reduce((n, l) => n + l.qty, 0);

    const [assigneeId, setAssigneeId] = useState<string | null>(null);
    const [date, setDate] = useState(addDays(TODAY, 1));
    const [time, setTime] = useState("09:00");
    const [place, setPlace] = useState(vendor.name);
    const [paidWith, setPaidWith] = useState<string | null>(null);
    const [note, setNote] = useState("");
    const [showAll, setShowAll] = useState(false);
    const [tried, setTried] = useState(false);
    const [assigned, setAssigned] = useState<Task | null>(null);

    const assignee = userById(assigneeId ?? undefined);
    const createdTheOrder = Boolean(assignee) && orders.some((o) => o.createdBy === assignee?.id);
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= TODAY;
    const timeOk = /^\d{2}:\d{2}$/.test(time);
    const placeOk = place.trim().length > 0;
    const ok = Boolean(assignee) && dateOk && timeOk && placeOk && lines.length > 0;

    const assign = () => {
        setTried(true);
        if (!ok || !assignee) return;
        const createdAt = nowIso();
        const task: Task = {
            id: `task-pickup-${vendor.id}-${createdAt.replace(/\D/g, "")}`,
            type: "pickup-run",
            title: `${vendor.name} pickup for ${locationName(location)}`,
            locationId: location,
            assigneeId: assignee.id,
            createdBy: user.id,
            createdAt,
            dueAt: `${date}T${time}:00Z`,
            status: "assigned",
            note: note.trim() || undefined,
            orderIds: orders.map((o) => o.id),
            vendorId: vendor.id,
            place: place.trim(),
            lines,
            paidWith: paidWith ?? undefined,
        };
        setAssigned(task);
        onAssign(task);
    };

    if (assigned && assignee) {
        const alsoMentioned = mentionedIds(assigned.note ?? "")
            .filter((id) => id !== assignee.id && id !== user.id)
            .map((id) => userById(id)?.name)
            .filter((n): n is string => Boolean(n));
        return (
            <div data-testid="pickup-assigned" className="flex min-h-full w-full flex-col items-center justify-center gap-5 p-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-success-secondary text-fg-success-primary">
                    <CheckCircle className="size-6" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-1.5" role="status">
                    <h2 className="text-lg font-semibold text-primary">Pickup run assigned to {assignee.id === user.id ? "you" : assignee.name}</h2>
                    <p className="text-sm text-secondary">
                        {assigned.place}, {formatDate(assigned.dueAt.slice(0, 10))} at {formatTime(assigned.dueAt)}. {lines.length}{" "}
                        {lines.length === 1 ? "line" : "lines"} on the pick list.
                    </p>
                    <p className="text-sm text-tertiary">
                        {assignee.id === user.id ? "It is on your task list." : `${assignee.name} will be notified ${NOTIFY_HOW}.`}
                        {alsoMentioned.length > 0 && ` ${listNames(alsoMentioned)}, mentioned in your note, will be notified too.`} {NOTHING_SENT}
                    </p>
                    <p className="text-sm text-tertiary">
                        Picking the items up does not change stock. Stock changes when the delivery is received at the front desk.
                    </p>
                </div>
                <Button color="primary" size="md" className="w-full sm:w-auto sm:min-w-32" onClick={onClose}>
                    Done
                </Button>
            </div>
        );
    }

    const shown = showAll ? lines : lines.slice(0, 6);

    return (
        <div className="flex min-h-full w-full flex-col">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-secondary bg-primary px-4 py-3 sm:px-6 sm:py-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-lg font-semibold text-primary">Send someone to {vendor.name}</h2>
                    <p className="text-sm text-tertiary">
                        {orders.map((o) => o.number).join(", ")} · {lines.length} {lines.length === 1 ? "line" : "lines"}, {units}{" "}
                        {units === 1 ? "unit" : "units"} · {locationName(location)}
                    </p>
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

            <div className="flex flex-1 flex-col gap-6 px-4 py-5 sm:px-6">
                <Section title="Who is going" hint={`People at ${locationName(location)}.`}>
                    <AriaRadioGroup aria-label="Who is going" value={assigneeId} onChange={setAssigneeId} isRequired className="flex flex-col gap-2">
                        {people.map((p) => (
                            <AriaRadio
                                key={p.id}
                                value={p.id}
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
                                        <Avatar size="sm" initials={initials(p.name)} />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm font-semibold text-primary">
                                                {p.name}
                                                {p.id === user.id && <span className="font-medium text-tertiary"> (you)</span>}
                                            </span>
                                            <span className="truncate text-sm text-tertiary">{ROLE_LABEL[p.role]}</span>
                                        </span>
                                        <RadioButtonBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} />
                                    </>
                                )}
                            </AriaRadio>
                        ))}
                    </AriaRadioGroup>
                    {tried && !assignee && <p className="text-sm text-error-primary">Choose who is going.</p>}
                    {createdTheOrder && assignee && (
                        <p data-testid="creator-warning" className="flex items-start gap-2 rounded-lg bg-warning-primary px-3 py-2.5 text-sm text-secondary">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                            <span>
                                <span className="font-semibold">{assignee.id === user.id ? "You" : assignee.name} created this order.</span>{" "}
                                {assignee.id === user.id ? "You" : "They"} can pick it up, but someone else has to receive it: the person who creates an order
                                does not also receive it.
                            </span>
                        </p>
                    )}
                </Section>

                <Section title="When">
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Date"
                            type="date"
                            size="md"
                            value={date}
                            onChange={setDate}
                            isRequired
                            hideRequiredIndicator
                            isInvalid={tried && !dateOk}
                            hint={tried && !dateOk ? "Choose today or later." : undefined}
                            inputClassName="min-h-11"
                        />
                        <Input
                            label="Time"
                            type="time"
                            size="md"
                            value={time}
                            onChange={setTime}
                            isRequired
                            hideRequiredIndicator
                            isInvalid={tried && !timeOk}
                            hint={tried && !timeOk ? "Set a time." : undefined}
                            inputClassName="min-h-11"
                        />
                    </div>
                </Section>

                <Input
                    label="Where"
                    size="md"
                    value={place}
                    onChange={setPlace}
                    isRequired
                    hideRequiredIndicator
                    isInvalid={tried && !placeOk}
                    placeholder="Store name or address"
                    hint={tried && !placeOk ? "Say where they should go." : "Store name or address. Starts as the vendor's name."}
                    inputClassName="min-h-11"
                />

                <Section title="How to pay" hint="Optional. Leave it blank if they already know.">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="How to pay">
                        {PAY_OPTIONS.map((option) => {
                            const selected = paidWith === option;
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => setPaidWith(selected ? null : option)}
                                    className={cx(
                                        "inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                                        selected
                                            ? "bg-brand-primary_alt text-brand-secondary ring-brand"
                                            : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                                    )}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    {paidWith && <p className="text-sm text-tertiary">{PAY_HINT[paidWith as (typeof PAY_OPTIONS)[number]]}</p>}
                </Section>

                <MentionInput
                    label="Note"
                    users={users}
                    location={location}
                    authorId={user.id}
                    value={note}
                    onChange={setNote}
                    placeholder="Anything they should know. Type @ to mention someone"
                    hint="Optional. The person going always sees this note."
                />

                <Section
                    title="Pick list"
                    hint={`${lines.length} ${lines.length === 1 ? "line" : "lines"}, ${units} ${units === 1 ? "unit" : "units"}. They tick these off in the store.`}
                >
                    {lines.length > 0 ? (
                        <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                            {shown.map((l) => (
                                <li key={l.itemId ?? l.name} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <span className="min-w-0 text-sm text-secondary">{l.name}</span>
                                    <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">× {l.qty}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-error-primary">These orders have no lines with a quantity, so there is nothing to pick up.</p>
                    )}
                    {lines.length > 6 && (
                        <Button color="link-color" size="sm" className="self-start" onClick={() => setShowAll((v) => !v)}>
                            {showAll ? "Show fewer" : `Show all ${lines.length} lines`}
                        </Button>
                    )}
                </Section>
            </div>

            <footer className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-secondary bg-primary px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
                {tried && !ok && (
                    <p role="alert" className="text-sm text-error-primary">
                        Some details are missing above.
                    </p>
                )}
                <div className="flex gap-3 sm:justify-end">
                    <Button color="secondary" size="md" className="min-h-11 shrink-0" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color="primary" size="md" className="min-h-11 max-sm:flex-1" onClick={assign}>
                        {assignee && assignee.id !== user.id ? `Assign to ${assignee.name.split(" ")[0]}` : "Assign pickup"}
                    </Button>
                </div>
            </footer>
        </div>
    );
};
