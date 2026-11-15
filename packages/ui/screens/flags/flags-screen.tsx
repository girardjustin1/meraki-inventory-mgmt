"use client";

import type { MouseEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    CheckVerified02,
    Download01,
    HelpCircle,
    LinkExternal01,
    Lock01,
    SearchLg,
    UserPlus01,
    XCircle,
    XClose,
} from "@untitledui/icons";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { PinInput } from "@/components/base/input/pin-input";
import { RadioButton, RadioButtonBase, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import type { BulkAction } from "@/components/meraki/bulk-action-bar";
import { BulkActionBar } from "@/components/meraki/bulk-action-bar";
import { downloadCsv } from "@/components/meraki/collection-export";
import type { ActiveFilters, ToolbarFilter, ToolbarSort, ToolbarView } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar, passesFilters } from "@/components/meraki/data-table-toolbar";
import type { ListColumn, ListNoticeContent } from "@/components/meraki/list-table";
import {
    BULK_BAR_OVER_HEADER,
    ListCards,
    ListEmpty,
    ListNotice,
    ListTable,
    SelectModeRow,
    norm,
    plural,
    useListSelection,
} from "@/components/meraki/list-table";
import { unitWord } from "@/components/meraki/quantity-stepper";
import { FlagSeverityBadge, FlagStatusBadge } from "@/components/meraki/status-badges";
import { ROLE_LABEL, TODAY, flags as allFlags, getItem, getPurchaseOrder, locationName, userById, users } from "@/data/inventory";
import type { Flag, FlagSeverity, FlagType, LocationId, PurchaseOrder, User } from "@/data/types";
import { daysBetween, formatDate, formatTime, relativeDays } from "@/engine/dates";
import { FLAG_THRESHOLDS, FLAG_TYPE_LABEL } from "@/engine/flags";
import { can } from "@/engine/permissions";
import { formatCurrency } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import type { FlagAction, FlagOutcome, FlagReview } from "@/screens/flag-detail/flag-detail-screen";
import { FlagDetailBody, OUTCOMES, OUTCOME_LABEL, applyFlagAction, seedReview } from "@/screens/flag-detail/flag-detail-screen";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

/** The views of the queue. `open`, `reviewing` and `closed` are the long-standing `?tab=` values. */
export type QueueTab = "open" | "reviewing" | "closed" | "all";
export type FlagSort = "priority" | "newest" | "largest";
export type FlagSource = "real" | "sample";
type DialogId = "assign" | "resolve" | "dismiss";

const SEVERITIES: FlagSeverity[] = ["high", "medium", "low"];
const SEVERITY_LABEL: Record<FlagSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const UNASSIGNED = "unassigned";

const SORTS: ToolbarSort[] = [
    { id: "priority", label: "Most serious first" },
    { id: "newest", label: "Newest first" },
    { id: "largest", label: "Largest first" },
];

const inView = (f: Flag, view: QueueTab) => view === "all" || (view === "closed" ? f.status === "resolved" || f.status === "dismissed" : f.status === view);

// ------------------------------------------------------------------------------------ rules explainer

const T = FLAG_THRESHOLDS;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** Each rule in plain language. Numbers come from FLAG_THRESHOLDS, so this text cannot drift from the engine. */
const FLAG_RULES: { type: FlagType; when: string; severity: string }[] = [
    {
        type: "count-variance",
        when: `A count differs from what the ledger expects by ${pct(T.countVariancePct)} or more, and by at least ${T.countVarianceMinUnits} units.`,
        severity: `High when the count is short by ${pct(T.countVarianceHighPct)} or more. Medium otherwise.`,
    },
    {
        type: "unexplained-adjustment",
        when: `Stock was written off as lost or suspected theft, or outside ${hour(T.openHour)} to ${hour(T.closeHour)}, or by ${T.adjustmentNoteUnits} or more units with no note.`,
        severity: "High for suspected theft, or when it is both after hours and has no note. Medium otherwise.",
    },
    {
        type: "received-mismatch",
        when: "The quantity logged at receiving is different from the quantity ordered.",
        severity: "Any difference raises it. High when it is off by half or more, medium from a quarter.",
    },
    {
        type: "overdue-receipt",
        when: `An order was sent and some lines still have no receipt after ${T.overdueReceiptDays} days, or after twice the vendor's lead time if that is longer.`,
        severity: "High when half or more of the lines are still open, medium from a fifth.",
    },
    {
        type: "order-spike",
        when: `An order line is at least ${T.orderSpikeMultiple}× the item's usual order, and at least ${T.orderSpikeMinExtraUnits} units more.`,
        severity: "The usual order is the median of the item's other orders, and needs at least two to compare. High from 3×.",
    },
    {
        type: "stockout-risk",
        when: "Going by usage, the stock on hand will run out before a new order from the vendor could arrive.",
        severity: "High at 2 days of cover or less. Medium otherwise.",
    },
    {
        type: "missed-count",
        when: "A scheduled count is past its due date and has not been started.",
        severity: "Medium from 5 days late, high from 14.",
    },
    {
        type: "variant-mismatch",
        when: "A different type arrived than was ordered, for example Gel when Regular was asked for.",
        severity: "Always low.",
    },
    {
        type: "over-par",
        when: `More than ${T.overParMultiple}× the par level is on the shelf.`,
        severity: "Always low.",
    },
    {
        type: "repeat-out-of-stock",
        when: "The vendor could not supply the same colour in two or more order cycles.",
        severity: "Always low.",
    },
    {
        type: "data-quality",
        when: "The catalogue has a gap that hides real numbers: the same product on two rows, or an item with no par level.",
        severity: "Always low.",
    },
];

const HowFlagsWork = ({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) => (
    <SlideoutMenu isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="z-50">
        {({ close }) => (
            <>
                <SlideoutMenu.Header onClose={close}>
                    <h2 className="pr-8 text-lg font-semibold text-primary">How flags work</h2>
                    <p className="mt-1 text-sm text-tertiary">
                        Flags come from fixed rules run over counts, receipts, orders and adjustments. Every flag shows the numbers behind it. None of them says
                        why something happened: that is what the review is for.
                    </p>
                </SlideoutMenu.Header>
                <SlideoutMenu.Content>
                    <ul className="flex flex-col divide-y divide-secondary pb-6">
                        {FLAG_RULES.map((rule) => (
                            <li key={rule.type} className="flex flex-col gap-1 py-3.5 first:pt-0">
                                <h3 className="text-sm font-semibold text-primary">{FLAG_TYPE_LABEL[rule.type]}</h3>
                                <p className="text-sm text-secondary">{rule.when}</p>
                                <p className="text-xs text-tertiary">{rule.severity}</p>
                            </li>
                        ))}
                    </ul>
                </SlideoutMenu.Content>
                <SlideoutMenu.Footer className="flex items-center justify-between gap-3">
                    <p className="text-xs text-tertiary">Thresholds can be tuned for each location.</p>
                    <Button color="secondary" size="md" onClick={close}>
                        Close
                    </Button>
                </SlideoutMenu.Footer>
            </>
        )}
    </SlideoutMenu>
);

// ------------------------------------------------------------------------------------ rows

/** How far the records are out. `amount` is always positive; `sign` says which way where that means something. */
interface FlagSize {
    amount: number;
    /** "−3 boxes", "6 lines", "2 to order". */
    text: string;
    sign: "+" | "−" | "";
    /** Cost of the units involved, where the item has a unit cost. */
    dollars?: number;
}

interface FlagRow {
    /** The flag as it stands after anything done in this session. */
    flag: Flag;
    /** Position in the engine's order: severity first, then the rules closest to "is anything going missing". */
    rank: number;
    /** The title without the item or order it starts with, which has its own column. */
    what: string;
    itemName?: string;
    order?: PurchaseOrder;
    size?: FlagSize;
    /** Everything the search box looks through, already normalised. */
    haystack: string[];
}

const number = (value?: string) => {
    const n = value === undefined ? Number.NaN : Number.parseFloat(value.replace(/^\$/, ""));
    return Number.isFinite(n) ? n : undefined;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

const sizeOf = (flag: Flag): FlagSize | undefined => {
    const item = flag.itemId ? getItem(flag.itemId) : undefined;
    const evidence = (label: string) => number(flag.evidence.find((e) => e.label === label)?.value);
    const cost = (units: number) => (item?.unitCost !== undefined ? units * item.unitCost : undefined);
    const signed = (delta: number | undefined): FlagSize | undefined => {
        if (!delta) return undefined;
        const amount = round1(Math.abs(delta));
        const sign = delta > 0 ? "+" : "−";
        return { amount, sign, text: `${sign}${amount} ${unitWord(amount, item?.unit)}`, dollars: cost(amount) };
    };
    const counted = (amount: number | undefined, one: string, many = `${one}s`): FlagSize | undefined =>
        amount ? { amount, sign: "", text: `${amount.toLocaleString("en-US")} ${amount === 1 ? one : many}` } : undefined;

    switch (flag.type) {
        case "count-variance": {
            const size = signed(evidence("Variance"));
            return size && { ...size, dollars: evidence("Value") ?? size.dollars };
        }
        case "unexplained-adjustment":
            return signed(evidence("Change"));
        case "received-mismatch":
            return signed(evidence("Difference"));
        case "order-spike": {
            const ordered = evidence("This order");
            const usual = evidence("Usual order");
            return ordered === undefined || usual === undefined ? undefined : signed(ordered - usual);
        }
        case "over-par": {
            const onHand = evidence("On hand");
            const par = evidence("Par");
            return onHand === undefined || par === undefined ? undefined : signed(onHand - par);
        }
        case "stockout-risk": {
            const toOrder = evidence("Suggested order");
            return toOrder ? { amount: toOrder, sign: "", text: `${toOrder} to order`, dollars: cost(toOrder) } : undefined;
        }
        case "overdue-receipt":
            return counted(evidence("Open lines"), "line");
        case "missed-count":
            return counted(evidence("Items"), "item");
        case "repeat-out-of-stock":
            return counted(flag.evidence.find((e) => e.label === "Cycles")?.value.split(",").length, "cycle");
        case "data-quality":
            return counted(number(flag.title), "item");
        case "variant-mismatch":
            return undefined;
    }
};

const sizeText = (size: FlagSize | undefined, seesCosts: boolean) =>
    size === undefined ? undefined : seesCosts && size.dollars !== undefined ? `${size.sign}${formatCurrency(size.dollars)}` : size.text;

const sizeRank = (size: FlagSize | undefined, seesCosts: boolean) => (size === undefined ? -1 : seesCosts ? (size.dollars ?? 0) : size.amount);

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const toRow = (flag: Flag, rank: number): FlagRow => {
    const order = flag.purchaseOrderId ? getPurchaseOrder(flag.purchaseOrderId) : undefined;
    const itemName = flag.itemName ?? (flag.itemId ? getItem(flag.itemId)?.name : undefined);
    const lead = [itemName, order?.number].find((prefix) => prefix && flag.title.startsWith(`${prefix}: `));
    return {
        flag,
        rank,
        what: lead ? upperFirst(flag.title.slice(lead.length + 2)) : flag.title,
        itemName,
        order,
        size: sizeOf(flag),
        haystack: [flag.title, flag.summary, itemName ?? "", order?.number ?? "", FLAG_TYPE_LABEL[flag.type], userById(flag.assignedTo)?.name ?? ""].map(norm),
    };
};

const FILTER_READ: Record<string, (row: FlagRow) => string | undefined> = {
    severity: (r) => r.flag.severity,
    type: (r) => r.flag.type,
    assignee: (r) => r.flag.assignedTo ?? UNASSIGNED,
    source: (r) => (r.flag.fromRealData ? "real" : "sample"),
};

const day = (iso: string) => iso.slice(0, 10);
const stamp = (iso: string) => (iso.length === 10 ? `${iso}T00:00:00Z` : iso);

/** "Today", "3 days ago", then the date once it is more than a month old. */
const raisedText = (detectedAt: string) => {
    const d = day(detectedAt);
    return daysBetween(d, TODAY) <= 30 ? upperFirst(relativeDays(d, TODAY)) : formatDate(d, d.slice(0, 4) !== TODAY.slice(0, 4));
};
const raisedTitle = (detectedAt: string) => `${formatDate(day(detectedAt), true)}${detectedAt.length > 10 ? `, ${formatTime(detectedAt)}` : ""}`;

// ------------------------------------------------------------------------------------ small pieces

/** A faint dot for a flag built from generated sample activity, as on the stock list. */
const SampleDot = () => (
    <span title="Built from sample data" className="size-1 shrink-0 rounded-full bg-fg-warning-secondary opacity-60">
        <span className="sr-only">Sample data</span>
    </span>
);

const Assignee = ({ userId, short }: { userId?: string; short?: boolean }) => {
    const person = userById(userId);
    if (!person) return <span className="text-quaternary">Unassigned</span>;
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5">
            <Avatar size="xs" initials={initials(person.name)} />
            {/* The initials tell two people with the same first name apart; the full name is one hover away. */}
            {!short && (
                <span className="truncate text-secondary" title={person.name}>
                    {person.name.split(" ")[0]}
                    <span className="sr-only"> {person.name.split(" ").slice(1).join(" ")}</span>
                </span>
            )}
            {short && <span className="sr-only">Assigned to {person.name}</span>}
        </span>
    );
};

interface FrameProps {
    title: string;
    description?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    footer: ReactNode;
}

/** Header, scrolling body and a footer of actions, for the three bulk dialogs. */
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

const Shell = ({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) => (
    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
        <Modal className="sm:max-w-lg">
            <Dialog aria-label={label}>{children}</Dialog>
        </Modal>
    </ModalOverlay>
);

const CancelButton = ({ onClose }: { onClose: () => void }) => (
    <Button color="secondary" size="md" className="min-h-11 shrink-0 sm:min-h-10" onClick={onClose}>
        Cancel
    </Button>
);

/** What will be left alone, said before the action runs. */
const SkipNote = ({ skips }: { skips: string }) =>
    skips ? <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary ring-1 ring-secondary ring-inset">{skips}</p> : null;

// ------------------------------------------------------------------------------------ bulk dialogs

const AssignDialog = ({
    count,
    skips,
    people,
    user,
    onClose,
    onConfirm,
}: {
    count: number;
    skips: string;
    people: User[];
    user: User;
    onClose: () => void;
    onConfirm: (person: User) => void;
}) => {
    const [personId, setPersonId] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    const person = people.find((p) => p.id === personId);
    return (
        <Shell label="Assign flags" onClose={onClose}>
            <Frame
                title={`Assign ${plural(count, "flag")}`}
                description="People who may review flags at this location."
                onClose={onClose}
                footer={
                    <>
                        <CancelButton onClose={onClose} />
                        <Button
                            size="md"
                            className="min-h-11 max-sm:flex-1 sm:min-h-10"
                            isDisabled={count === 0}
                            data-testid="confirm-assign"
                            onClick={() => {
                                setTried(true);
                                if (person) onConfirm(person);
                            }}
                        >
                            {person ? `Assign to ${person.name.split(" ")[0]}` : "Assign"}
                        </Button>
                    </>
                }
            >
                <AriaRadioGroup aria-label="Assign to" value={personId} onChange={setPersonId} className="flex flex-col gap-2">
                    {people.map((p) => (
                        <AriaRadio
                            key={p.id}
                            value={p.id}
                            data-person={p.id}
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
                {tried && !person && (
                    <p role="alert" className="text-sm text-error-primary">
                        Choose who should review these.
                    </p>
                )}
                <SkipNote skips={skips} />
            </Frame>
        </Shell>
    );
};

const ResolveDialog = ({
    count,
    highCount,
    skips,
    onClose,
    onConfirm,
}: {
    count: number;
    /** How many of them are high severity. Closing those asks for a PIN, as it does on the flag's own page. */
    highCount: number;
    skips: string;
    onClose: () => void;
    onConfirm: (outcome: FlagOutcome, note: string) => void;
}) => {
    const [outcome, setOutcome] = useState<FlagOutcome | null>(null);
    const [note, setNote] = useState("");
    const [tried, setTried] = useState(false);
    const [step, setStep] = useState<"form" | "pin">("form");
    const [pin, setPin] = useState("");
    const noteOk = note.trim().length >= 3;
    const needsPin = highCount > 0;

    if (step === "pin" && outcome) {
        return (
            <Shell label="Confirm with your PIN" onClose={onClose}>
                <div className="flex w-full flex-col items-center gap-5 p-4 text-center sm:p-6">
                    <span className="flex size-12 items-center justify-center rounded-full bg-brand-secondary text-fg-brand-primary">
                        <Lock01 className="size-6" aria-hidden="true" />
                    </span>
                    <div className="flex flex-col gap-1">
                        <h2 className="text-lg font-semibold text-primary">Confirm with your PIN</h2>
                        <p className="text-sm text-tertiary">
                            {highCount} of the {plural(count, "flag")} {highCount === 1 ? "is" : "are"} high severity. Those need a PIN to close, so the record
                            shows who made the call. Outcome: {OUTCOME_LABEL[outcome]}.
                        </p>
                    </div>
                    <PinInput size="sm" className="items-center">
                        <PinInput.Group maxLength={4} pattern={REGEXP_ONLY_DIGITS} value={pin} onChange={setPin} autoFocus inputMode="numeric">
                            <PinInput.Slot index={0} />
                            <PinInput.Slot index={1} />
                            <PinInput.Slot index={2} />
                            <PinInput.Slot index={3} />
                        </PinInput.Group>
                    </PinInput>
                    <p className="text-xs text-quaternary">Prototype: any four digits are accepted. The live app checks the PIN you unlock the device with.</p>
                    <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
                        <Button color="secondary" size="md" className="min-h-11 flex-1 sm:min-h-10" onClick={() => setStep("form")}>
                            Back
                        </Button>
                        <Button
                            size="md"
                            className="min-h-11 flex-1 sm:min-h-10"
                            isDisabled={pin.length < 4}
                            data-testid="confirm-pin"
                            onClick={() => onConfirm(outcome, note.trim())}
                        >
                            Confirm and resolve
                        </Button>
                    </div>
                </div>
            </Shell>
        );
    }

    return (
        <Shell label="Resolve flags" onClose={onClose}>
            <Frame
                title={`Resolve ${plural(count, "flag")}`}
                description="One outcome and one note, recorded on each flag with your name and the time."
                onClose={onClose}
                footer={
                    <>
                        <CancelButton onClose={onClose} />
                        <Button
                            size="md"
                            className="min-h-11 max-sm:flex-1 sm:min-h-10"
                            isDisabled={count === 0}
                            iconTrailing={needsPin ? Lock01 : undefined}
                            data-testid="confirm-resolve"
                            onClick={() => {
                                setTried(true);
                                if (!outcome || !noteOk) return;
                                if (needsPin) setStep("pin");
                                else onConfirm(outcome, note.trim());
                            }}
                        >
                            {needsPin ? "Continue to PIN" : `Resolve ${plural(count, "flag")}`}
                        </Button>
                    </>
                }
            >
                <RadioGroup aria-label="What was found" size="sm" value={outcome} onChange={(value) => setOutcome(value as FlagOutcome)} className="gap-1">
                    {OUTCOMES.map((o) => (
                        <RadioButton key={o.id} value={o.id} label={o.label} hint={o.hint} data-outcome={o.id} className="min-h-11 cursor-pointer py-1.5" />
                    ))}
                </RadioGroup>
                {tried && !outcome && (
                    <p role="alert" className="text-sm text-error-primary">
                        Choose what was found.
                    </p>
                )}
                <TextArea
                    label="Note"
                    isRequired
                    rows={3}
                    value={note}
                    onChange={setNote}
                    isInvalid={tried && !noteOk}
                    hint={tried && !noteOk ? "A note is required." : "What you checked and what you found. The person on the record can read this."}
                />
                <SkipNote skips={skips} />
            </Frame>
        </Shell>
    );
};

const DISMISS_REASONS = [
    { id: "duplicate", label: "Duplicate of another flag" },
    { id: "accounted-for", label: "Known and already accounted for" },
    { id: "entry-error", label: "Data entry or import error" },
    { id: "too-sensitive", label: "The rule is too sensitive here" },
    { id: "other", label: "Other" },
] as const;
type DismissReason = (typeof DISMISS_REASONS)[number]["id"];

const DismissDialog = ({
    rows,
    skips,
    onClose,
    onConfirm,
}: {
    /** The selected flags that can be dismissed by this person. */
    rows: FlagRow[];
    skips: string;
    onClose: () => void;
    onConfirm: (reason: string, includeHigh: boolean) => void;
}) => {
    const [reason, setReason] = useState<DismissReason | null>(null);
    const [note, setNote] = useState("");
    const [includeHigh, setIncludeHigh] = useState(false);
    const [tried, setTried] = useState(false);

    const high = rows.filter((r) => r.flag.severity === "high");
    const count = includeHigh ? rows.length : rows.length - high.length;
    // A high-severity flag is never closed on a menu choice alone.
    const noteNeeded = reason === "other" || (includeHigh && high.length > 0);
    const noteOk = !noteNeeded || note.trim().length >= 3;
    const label = DISMISS_REASONS.find((r) => r.id === reason)?.label;

    return (
        <Shell label="Dismiss flags" onClose={onClose}>
            <Frame
                title={count ? `Dismiss ${plural(count, "flag")}` : "Dismiss flags"}
                description="For flags that should not have been raised. Each one moves to Closed and keeps your name, the reason and the time."
                onClose={onClose}
                footer={
                    <>
                        <CancelButton onClose={onClose} />
                        <Button
                            size="md"
                            color={includeHigh && high.length > 0 ? "primary-destructive" : "primary"}
                            className="min-h-11 max-sm:flex-1 sm:min-h-10"
                            isDisabled={count === 0}
                            data-testid="confirm-dismiss"
                            onClick={() => {
                                setTried(true);
                                if (label && noteOk) onConfirm(note.trim() ? `${label}: ${note.trim()}` : label, includeHigh);
                            }}
                        >
                            {count ? `Dismiss ${plural(count, "flag")}` : "Nothing to dismiss"}
                        </Button>
                    </>
                }
            >
                {high.length > 0 && (
                    <div
                        data-testid="high-severity-warning"
                        className="flex flex-col gap-3 rounded-xl bg-error-primary p-3.5 ring-1 ring-error_subtle ring-inset"
                    >
                        <div className="flex items-start gap-2.5">
                            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-fg-error-primary" aria-hidden="true" />
                            <div className="flex min-w-0 flex-col gap-1">
                                <p className="text-sm font-semibold text-primary">
                                    {high.length} of the {rows.length} selected {high.length === 1 ? "is" : "are"} high severity
                                </p>
                                <ul className="flex flex-col gap-0.5 text-sm text-secondary">
                                    {high.slice(0, 4).map((r) => (
                                        <li key={r.flag.id} className="truncate">
                                            {r.flag.title}
                                        </li>
                                    ))}
                                    {high.length > 4 && <li className="text-tertiary">and {high.length - 4} more</li>}
                                </ul>
                                <p className="text-sm text-tertiary">
                                    {high.length === 1 ? "It stays" : "They stay"} in the queue unless you tick the box. Dismissing{" "}
                                    {high.length === 1 ? "it" : "them"} needs a note.
                                </p>
                            </div>
                        </div>
                        <Checkbox
                            size="md"
                            isSelected={includeHigh}
                            onChange={setIncludeHigh}
                            data-testid="include-high"
                            className="min-h-11 items-center"
                            label={`Also dismiss ${high.length === 1 ? "the high-severity flag" : `the ${high.length} high-severity flags`}`}
                        />
                    </div>
                )}
                <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-medium text-secondary">
                        Reason <span className="text-brand-tertiary">*</span>
                    </p>
                    <RadioGroup
                        aria-label="Reason for dismissing"
                        size="sm"
                        value={reason}
                        onChange={(value) => setReason(value as DismissReason)}
                        className="gap-0"
                    >
                        {DISMISS_REASONS.map((r) => (
                            <RadioButton
                                key={r.id}
                                value={r.id}
                                label={r.label}
                                data-reason={r.id}
                                className="min-h-11 cursor-pointer items-center lg:min-h-9"
                            />
                        ))}
                    </RadioGroup>
                    {tried && !reason && (
                        <p role="alert" className="text-sm text-error-primary">
                            Choose a reason.
                        </p>
                    )}
                </div>
                <TextArea
                    label="Note"
                    isRequired={noteNeeded}
                    rows={2}
                    value={note}
                    onChange={setNote}
                    isInvalid={tried && !noteOk}
                    hint={
                        tried && !noteOk
                            ? "A note is required."
                            : noteNeeded
                              ? "Say what you checked. It is recorded on each flag."
                              : "Optional. It is recorded on each flag after the reason."
                    }
                />
                <SkipNote skips={skips} />
            </Frame>
        </Shell>
    );
};

// ------------------------------------------------------------------------------------ screen

interface FlagsScreenProps {
    location?: LocationId;
    /** Who is looking. Defaults to the person using the app; stories pass a sample person. */
    user?: User;
    /** View to open on (deep link `?tab=`). */
    tab?: QueueTab;
    /** Severity filter to start with (deep link `?severity=high,medium`). */
    severity?: FlagSeverity[];
    /** Flag type filter to start with (deep link `?type=`, one or several). */
    initialTypes?: FlagType[];
    /** Assignee filter to start with: user ids, or `unassigned` (deep link `?assignee=`). */
    initialAssignees?: string[];
    /** Source filter to start with (deep link `?source=`). */
    initialSources?: FlagSource[];
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Sort to start with (deep link `?sort=`). */
    initialSort?: FlagSort;
    /** Flag to open in the side panel (deep link `?flag=`). */
    initialFlagId?: string;
    /** Flag ids selected on first render, which brings up the bulk bar. */
    initialSelected?: string[];
    /** Open one of the bulk dialogs for the initial selection. */
    initialDialog?: DialogId;
    /** Replace the flag list (used for the empty state). */
    flags?: Flag[];
}

export const FlagsScreen = ({
    location: initialLocation = "lynnfield",
    user: userProp,
    tab: initialTab = "open",
    severity: initialSeverity = [],
    initialTypes = [],
    initialAssignees = [],
    initialSources = [],
    initialQuery = "",
    initialSort = "priority",
    initialFlagId,
    initialSelected = [],
    initialDialog,
    flags: source = allFlags,
}: FlagsScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const isDesktop = useBreakpoint("lg");

    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [view, setView] = useState<QueueTab>(initialTab);
    const [filters, setFilters] = useState<ActiveFilters>(() => {
        const start: ActiveFilters = {};
        if (initialSeverity.length) start.severity = initialSeverity;
        if (initialTypes.length) start.type = initialTypes;
        if (initialAssignees.length) start.assignee = initialAssignees;
        if (initialSources.length) start.source = initialSources;
        return start;
    });
    const [query, setQuery] = useState(initialQuery);
    const [sort, setSort] = useState<FlagSort>(initialSort);
    const [activeId, setActiveId] = useState<string | null>(initialFlagId ?? null);
    const [selectMode, setSelectMode] = useState(initialSelected.length > 0);
    const [dialog, setDialog] = useState<DialogId | null>(initialDialog ?? null);
    const [howOpen, setHowOpen] = useState(false);
    const [notice, setNotice] = useState<ListNoticeContent | null>(null);
    // Review actions live in this session only. The first confirmation says so; later ones do not repeat it.
    const [reviews, setReviews] = useState<Record<string, FlagReview>>({});
    const told = useRef(false);

    useUrlSync({
        tab: view === "open" ? null : view,
        severity: (filters.severity ?? []).join(",") || null,
        type: (filters.type ?? []).join(",") || null,
        assignee: (filters.assignee ?? []).join(",") || null,
        source: (filters.source ?? []).join(",") || null,
        q: query || null,
        sort: sort === "priority" ? null : sort,
        flag: activeId,
    });

    const canView = can(user, "flags.view");
    const canAct = can(user, "flags.resolve", location);
    const seesCosts = can(user, "costs.view", location);
    const seesOrders = can(user, "orders.view", location);

    const sourceById = useMemo(() => new Map(source.map((f) => [f.id, f])), [source]);
    const reviewOf = (flag: Flag) => reviews[flag.id] ?? seedReview(flag);

    const rows = useMemo(
        () =>
            source.flatMap((flag, rank) => {
                if (flag.locationId !== location) return [];
                const review = reviews[flag.id];
                return [toRow(review ? { ...flag, status: review.status, assignedTo: review.assignedTo, resolutionNote: review.resolutionNote } : flag, rank)];
            }),
        [source, location, reviews],
    );

    const inThisView = rows.filter((r) => inView(r.flag, view));
    const matches = (r: FlagRow, q: string) => passesFilters(r, filters, FILTER_READ) && (!q || r.haystack.some((field) => field.includes(q)));

    const filtered = useMemo(() => {
        const q = norm(query);
        const out = rows.filter((r) => inView(r.flag, view) && passesFilters(r, filters, FILTER_READ) && (!q || r.haystack.some((field) => field.includes(q))));
        const compare: Record<FlagSort, (a: FlagRow, b: FlagRow) => number> = {
            priority: (a, b) => a.rank - b.rank,
            newest: (a, b) => stamp(b.flag.detectedAt).localeCompare(stamp(a.flag.detectedAt)) || a.rank - b.rank,
            largest: (a, b) => sizeRank(b.size, seesCosts) - sizeRank(a.size, seesCosts) || (b.size?.amount ?? 0) - (a.size?.amount ?? 0) || a.rank - b.rank,
        };
        return out.sort(compare[sort]);
    }, [rows, view, filters, query, sort, seesCosts]);

    const selection = useListSelection(
        filtered.map((r) => r.flag.id),
        initialSelected,
    );
    const selectedRows = filtered.filter((r) => selection.has(r.flag.id));
    const narrowed = filtered.length !== inThisView.length;
    const elsewhere = narrowed && view !== "all" ? rows.filter((r) => !inView(r.flag, view) && matches(r, norm(query))).length : 0;

    const views: ToolbarView[] = [
        { id: "open", label: "Open", count: rows.filter((r) => inView(r.flag, "open")).length },
        { id: "reviewing", label: "Reviewing", count: rows.filter((r) => inView(r.flag, "reviewing")).length },
        { id: "closed", label: "Closed", count: rows.filter((r) => inView(r.flag, "closed")).length },
        { id: "all", label: "All", count: rows.length },
    ];

    const reviewers = useMemo(() => users.filter((u) => can(u, "flags.resolve", location)), [location]);

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const inScope = rows.filter((r) => inView(r.flag, view));
        const tally = (read: (r: FlagRow) => string) => {
            const counts = new Map<string, number>();
            for (const r of inScope) counts.set(read(r), (counts.get(read(r)) ?? 0) + 1);
            return counts;
        };
        const bySeverity = tally((r) => r.flag.severity);
        const byType = tally((r) => r.flag.type);
        const byAssignee = tally((r) => r.flag.assignedTo ?? UNASSIGNED);
        const bySource = tally((r) => (r.flag.fromRealData ? "real" : "sample"));
        // Everyone who may review here, plus anyone a flag is already assigned to.
        const people = [...new Set([...reviewers.map((u) => u.id), ...rows.flatMap((r) => r.flag.assignedTo ?? [])])];
        const types = [...new Set(rows.map((r) => r.flag.type))].sort((a, b) => FLAG_TYPE_LABEL[a].localeCompare(FLAG_TYPE_LABEL[b]));
        return [
            { id: "severity", label: "Severity", options: SEVERITIES.map((s) => ({ id: s, label: SEVERITY_LABEL[s], count: bySeverity.get(s) ?? 0 })) },
            { id: "type", label: "Type", options: types.map((t) => ({ id: t, label: FLAG_TYPE_LABEL[t], count: byType.get(t) ?? 0 })) },
            {
                id: "assignee",
                label: "Assigned to",
                options: [
                    { id: UNASSIGNED, label: "Unassigned", count: byAssignee.get(UNASSIGNED) ?? 0 },
                    ...people.map((id) => ({
                        id,
                        label: `${userById(id)?.name ?? id}${id === user.id ? " (you)" : ""}`,
                        count: byAssignee.get(id) ?? 0,
                    })),
                ],
            },
            {
                id: "source",
                label: "Source",
                options: [
                    { id: "real", label: "From your sheets", count: bySource.get("real") ?? 0 },
                    { id: "sample", label: "Sample data", count: bySource.get("sample") ?? 0 },
                ],
            },
        ];
    }, [rows, view, reviewers, user.id]);

    // Changing what is listed drops the selection, so actions never hit rows that are out of sight.
    const relist = () => selection.clear();
    const clearAll = () => {
        setQuery("");
        setFilters({});
        relist();
    };

    // ---------------------------------------------------------------- actions

    /** Say what happened. The first time something changes, add that the prototype does not keep it. */
    const say = (text: string, onUndo?: () => void) => {
        const first = onUndo !== undefined && !told.current;
        if (first) told.current = true;
        setNotice({ text: first ? `${text} The prototype keeps changes until this page is reloaded.` : text, onUndo });
    };

    type Decision = { action: FlagAction } | { skip: string };
    /** Stands for "this row can take the action" where the action itself is not chosen yet (the dialog is still open). */
    const applies: Decision = { action: { type: "start" } };
    const closedSkip = (r: FlagRow): Decision | undefined =>
        r.flag.status === "resolved" || r.flag.status === "dismissed" ? { skip: "already closed" } : undefined;
    // Separation of duties: nobody closes a flag raised about something they logged themselves.
    const ownSkip = (r: FlagRow): Decision | undefined =>
        r.flag.userId === user.id ? { skip: "about your own entry, so someone else has to close it" } : undefined;

    const decideAssign =
        (person: User) =>
        (r: FlagRow): Decision =>
            closedSkip(r) ??
            (r.flag.assignedTo === person.id
                ? { skip: `already assigned to ${person.name}` }
                : r.flag.userId === person.id
                  ? { skip: `about ${person.id === user.id ? "your" : `${person.name}'s`} own entry` }
                  : { action: { type: "assign", userId: person.id } });
    const decideStart = (r: FlagRow): Decision =>
        closedSkip(r) ?? (r.flag.status === "reviewing" ? { skip: "already in review" } : { action: { type: "start" } });
    const decideClose =
        (action: FlagAction, includeHigh = true) =>
        (r: FlagRow): Decision =>
            closedSkip(r) ?? ownSkip(r) ?? (!includeHigh && r.flag.severity === "high" ? { skip: "high severity, left in the queue" } : { action });
    const canAssign = (r: FlagRow): Decision => closedSkip(r) ?? applies;
    const canClose = (r: FlagRow): Decision => closedSkip(r) ?? ownSkip(r) ?? applies;

    const tallySkips = (targets: FlagRow[], decide: (r: FlagRow) => Decision) => {
        const skips = new Map<string, number>();
        for (const r of targets) {
            const d = decide(r);
            if ("skip" in d) skips.set(d.skip, (skips.get(d.skip) ?? 0) + 1);
        }
        return skips;
    };
    /** "3 skipped: already closed." With more than one reason, each gets its count. */
    const skipText = (skips: Map<string, number>, tense: "will be" | "") => {
        const total = [...skips.values()].reduce((n, c) => n + c, 0);
        if (total === 0) return "";
        const why = skips.size === 1 ? [...skips.keys()][0] : [...skips].map(([reason, n]) => `${n} ${reason}`).join("; ");
        return `${total} ${tense ? `${tense} ` : ""}skipped: ${why}.`;
    };

    /** Run one action over the selection: the rows it applies to change, the rest are named with the reason. */
    const runBulk = (decide: (r: FlagRow) => Decision, done: (count: number, changed: FlagRow[]) => string) => {
        const before = reviews;
        const next = { ...reviews };
        const changed: FlagRow[] = [];
        for (const r of selectedRows) {
            const d = decide(r);
            const flag = sourceById.get(r.flag.id);
            if ("skip" in d || !flag) continue;
            next[r.flag.id] = applyFlagAction(before[r.flag.id] ?? seedReview(flag), d.action, user);
            changed.push(r);
        }
        if (changed.length) setReviews(next);
        const skippedText = skipText(tallySkips(selectedRows, decide), "");
        setDialog(null);
        selection.clear();
        setSelectMode(false);
        say(
            [changed.length ? done(changed.length, changed) : "Nothing changed.", skippedText].filter(Boolean).join(" "),
            changed.length
                ? () => {
                      setReviews(before);
                      setNotice(null);
                  }
                : undefined,
        );
    };

    /** Open a bulk dialog, unless the action applies to none of the selection: then say why and stop there. */
    const ask = (id: DialogId) => {
        const decide = id === "assign" ? canAssign : canClose;
        if (selectedRows.every((r) => "skip" in decide(r))) runBulk(decide, () => "");
        else setDialog(id);
    };

    const exportSelected = () => {
        const name = `flags-${location}-${TODAY}.csv`;
        downloadCsv(
            name,
            [
                "Severity",
                "Flag",
                "Type",
                "Item",
                "Order",
                "Size",
                ...(seesCosts ? ["Value"] : []),
                "Raised",
                "Assigned to",
                "Status",
                "Location",
                "What was observed",
            ],
            selectedRows.map((r) => [
                SEVERITY_LABEL[r.flag.severity],
                r.flag.title,
                FLAG_TYPE_LABEL[r.flag.type],
                r.itemName,
                r.order?.number,
                r.size?.text,
                ...(seesCosts ? [r.size?.dollars !== undefined ? `${r.size.sign}${r.size.dollars.toFixed(2)}` : undefined] : []),
                day(r.flag.detectedAt),
                userById(r.flag.assignedTo)?.name,
                r.flag.status,
                locationName(r.flag.locationId),
                r.flag.summary,
            ]),
        );
        say(`${plural(selectedRows.length, "flag")} exported as ${name}.`);
    };

    const actions: BulkAction[] = [
        ...(canAct
            ? [
                  { id: "assign", label: "Assign to…", icon: UserPlus01, onAction: () => ask("assign") },
                  {
                      id: "start",
                      label: "Start review",
                      icon: SearchLg,
                      onAction: () => runBulk(decideStart, (n) => `${plural(n, "flag")} moved to Reviewing.`),
                  },
                  { id: "resolve", label: "Resolve", icon: CheckCircle, onAction: () => ask("resolve") },
                  { id: "dismiss", label: "Dismiss", icon: XCircle, onAction: () => ask("dismiss") },
              ]
            : []),
        { id: "export", label: "Export CSV", icon: Download01, onAction: exportSelected },
    ];

    // ---------------------------------------------------------------- the open flag

    const openFlag = (id: string | null) => {
        setActiveId(id);
        if (id) setNotice(null);
    };
    const activeFlag = activeId ? sourceById.get(activeId) : undefined;
    const actOnActive = (action: FlagAction) => {
        if (!activeFlag) return;
        setReviews((prev) => ({ ...prev, [activeFlag.id]: applyFlagAction(prev[activeFlag.id] ?? seedReview(activeFlag), action, user) }));
    };

    const title = (
        <>
            Review <em>queue</em>
        </>
    );

    // ---------------------------------------------------------------- no access

    if (!canView) {
        return (
            <AppShell activeUrl={ROUTES.flags} location={location} onLocationChange={setLocation} user={userProp}>
                <PageContent>
                    <PageHeader title={title} />
                    <ListEmpty
                        icon={Lock01}
                        title="Flags are reviewed by managers and owners"
                        action={
                            <Button color="secondary" size="md" href={ROUTES.home} className="max-lg:min-h-11">
                                Back to home
                            </Button>
                        }
                    >
                        Your role ({ROLE_LABEL[user.role]}) does not include the review queue. If something looks wrong on a shelf or an order, tell your
                        manager.
                    </ListEmpty>
                </PageContent>
            </AppShell>
        );
    }

    // ---------------------------------------------------------------- phone: the flag opens as its own page

    if (!isDesktop && activeFlag) {
        return (
            <AppShell activeUrl={ROUTES.flags} location={location} onLocationChange={setLocation} user={userProp}>
                <PageContent>
                    <PageHeader
                        eyebrow={
                            <button
                                type="button"
                                data-testid="back-to-queue"
                                onClick={() => openFlag(null)}
                                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring focus-visible:outline-2"
                            >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Review queue
                            </button>
                        }
                        title={activeFlag.title}
                        description={`${FLAG_TYPE_LABEL[activeFlag.type]} · ${locationName(activeFlag.locationId)}`}
                    />
                    <FlagDetailBody
                        key={activeFlag.id}
                        flag={activeFlag}
                        review={reviewOf(activeFlag)}
                        user={user}
                        onAction={actOnActive}
                        layout="panel"
                        showTitle={false}
                    />
                </PageContent>
            </AppShell>
        );
    }

    // ---------------------------------------------------------------- cells

    // Status only varies in the views that mix statuses. Under Open and Reviewing the view picker already says it.
    const showStatus = view === "closed" || view === "all";

    // A plain click opens the flag here, beside the list, where what is done to it shows in the table straight
    // away. A modified click follows the link to the flag's own page.
    const plainClick = (event: MouseEvent) => !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);

    const subject = (r: FlagRow) => {
        const link = "truncate rounded-xs underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2";
        if (!r.itemName && !r.order) return <span className="text-quaternary">–</span>;
        return (
            // Narrower while the Status column is showing, so the table still fits beside the sidebar.
            <span className={cx("flex max-w-46 min-w-0 items-baseline gap-2 2xl:max-w-66", !showStatus && "xl:max-w-64")}>
                {r.itemName &&
                    (r.flag.itemId ? (
                        <a href={ROUTES.item(r.flag.itemId)} className={cx(link, "text-secondary")}>
                            {r.itemName}
                        </a>
                    ) : (
                        <span className="truncate">{r.itemName}</span>
                    ))}
                {r.order &&
                    (seesOrders ? (
                        <a href={ROUTES.order(r.order.id)} className={cx(link, "shrink-0", r.itemName ? "text-xs text-tertiary" : "text-secondary")}>
                            {r.order.number}
                        </a>
                    ) : (
                        <span className={cx("shrink-0", r.itemName && "text-xs text-tertiary")}>{r.order.number}</span>
                    ))}
            </span>
        );
    };

    const columns: ListColumn<FlagRow>[] = [
        {
            id: "severity",
            label: "Severity",
            tooltip: "Set by the rule that raised the flag. High means look today.",
            cell: (r) => <FlagSeverityBadge severity={r.flag.severity} />,
        },
        {
            id: "what",
            label: "What was flagged",
            primary: true,
            cell: (r) => (
                <>
                    <a
                        data-row-link
                        href={ROUTES.flag(r.flag.id)}
                        title={r.flag.summary}
                        onClick={(event) => {
                            if (!plainClick(event)) return;
                            event.preventDefault();
                            openFlag(r.flag.id);
                        }}
                        className="min-w-0 truncate rounded-xs text-sm font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        {r.what}
                    </a>
                    {!r.flag.fromRealData && <SampleDot />}
                </>
            ),
        },
        { id: "subject", label: "Item or order", cell: subject },
        {
            id: "type",
            label: "Type",
            tooltip: "The rule that raised it. “How flags work” lists every rule.",
            wideOnly: true,
            cell: (r) => FLAG_TYPE_LABEL[r.flag.type],
        },
        {
            id: "size",
            label: "Size",
            align: "right",
            tooltip: seesCosts
                ? "How far the records are out: the cost of the units involved, or units, order lines or items where there is no cost. Hover a dollar figure for the units."
                : "How far the records are out, in units, order lines or items.",
            cell: (r) => {
                const text = sizeText(r.size, seesCosts);
                if (!text || !r.size) return <span className="text-quaternary">–</span>;
                return (
                    <span className="font-medium text-primary" title={seesCosts && r.size.dollars !== undefined ? r.size.text : undefined}>
                        {text}
                    </span>
                );
            },
        },
        { id: "raised", label: "Raised", cell: (r) => <span title={raisedTitle(r.flag.detectedAt)}>{raisedText(r.flag.detectedAt)}</span> },
        { id: "assignee", label: "Assigned to", cell: (r) => <Assignee userId={r.flag.assignedTo} /> },
        ...(showStatus ? [{ id: "status", label: "Status", cell: (r: FlagRow) => <FlagStatusBadge status={r.flag.status} /> }] : []),
    ];

    const card = (r: FlagRow) => {
        const size = sizeText(r.size, seesCosts);
        const about = r.itemName ?? r.order?.number;
        return (
            <span className="flex min-w-0 flex-col gap-1">
                <span className="flex items-center gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-primary">{r.what}</span>
                        {!r.flag.fromRealData && <SampleDot />}
                    </span>
                    {size && <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{size}</span>}
                </span>
                <span className="flex min-w-0 items-center gap-2 text-xs text-tertiary">
                    <FlagSeverityBadge severity={r.flag.severity} />
                    <span className="min-w-0 flex-1 truncate">
                        {about ? `${about} · ` : ""}
                        {raisedText(r.flag.detectedAt)}
                    </span>
                    {showStatus ? <FlagStatusBadge status={r.flag.status} /> : r.flag.assignedTo && <Assignee userId={r.flag.assignedTo} short />}
                </span>
            </span>
        );
    };

    const bulkBar = (className?: string) => (
        <BulkActionBar
            count={selection.count}
            noun="flag"
            totalMatching={filtered.length}
            onSelectAll={selection.selectAll}
            onClear={() => {
                selection.clear();
                setSelectMode(false);
            }}
            onToggleAll={isDesktop ? selection.toggleAll : undefined}
            actions={actions}
            maxVisible={isDesktop ? 5 : undefined}
            className={className}
        />
    );

    const high = inThisView.filter((r) => r.flag.severity === "high").length;
    const summaryText = narrowed ? `${filtered.length.toLocaleString("en-US")} of ${plural(inThisView.length, "flag")}` : undefined;
    const filtersOn = query !== "" || Object.keys(filters).length > 0;
    const closable = selectedRows.filter((r) => "action" in canClose(r));
    const place = locationName(location);

    const empty = filtersOn ? (
        <ListEmpty
            title="No flags match"
            action={
                <>
                    <Button color="secondary" size="md" className="max-lg:min-h-11" data-testid="clear-all" onClick={clearAll}>
                        Clear search and filters
                    </Button>
                    {elsewhere > 0 && (
                        <Button
                            size="md"
                            className="max-lg:min-h-11"
                            data-testid="show-all-views"
                            onClick={() => {
                                setView("all");
                                relist();
                            }}
                        >
                            Show all {filtered.length + elsewhere} matching
                        </Button>
                    )}
                </>
            }
        >
            Nothing under {views.find((v) => v.id === view)?.label} at {place} fits this search and these filters.
            {elsewhere > 0 && ` ${plural(elsewhere, "flag")} in other views ${elsewhere === 1 ? "does" : "do"}.`}
        </ListEmpty>
    ) : (
        <ListEmpty
            icon={CheckVerified02}
            title={
                view === "open"
                    ? "Nothing waiting for review"
                    : view === "reviewing"
                      ? "Nothing in review"
                      : view === "closed"
                        ? "No closed flags yet"
                        : "No flags yet"
            }
            action={
                <Button color="secondary" size="md" className="max-lg:min-h-11" iconLeading={HelpCircle} onClick={() => setHowOpen(true)}>
                    How flags work
                </Button>
            }
        >
            {view === "reviewing"
                ? "Flags move here when someone starts a review."
                : view === "closed"
                  ? "Resolved and dismissed flags are kept here with their outcome and notes."
                  : `No ${view === "open" ? "open " : ""}flags at ${place}. New ones appear here when a count, receipt, order or adjustment falls outside the rules.`}
        </ListEmpty>
    );

    return (
        <AppShell
            activeUrl={ROUTES.flags}
            location={location}
            onLocationChange={(next) => {
                setLocation(next);
                relist();
            }}
            user={userProp}
        >
            <PageContent className="gap-4 lg:gap-5">
                <div className="flex flex-col gap-2.5">
                    <PageHeader
                        title={title}
                        description={
                            inThisView.length > 0 && view !== "closed"
                                ? `${high} of ${plural(inThisView.length, `${view === "open" ? "open " : ""}flag`)}${view === "reviewing" ? " in review" : ""} at ${place} ${high === 1 ? "is" : "are"} high severity.`
                                : undefined
                        }
                        actions={
                            <Button color="secondary" size="md" className="max-lg:min-h-11" iconLeading={HelpCircle} onClick={() => setHowOpen(true)}>
                                How flags work
                            </Button>
                        }
                    />
                    <SampleDataNote>
                        Flags found in Meraki&apos;s 2026 order and stock spreadsheets are real. A faint dot marks a flag built from generated counts and
                        adjustments, which shows how those rules will read once real counts exist. Dollar sizes use sample costs, and staff names are sample
                        values.
                    </SampleDataNote>
                </div>

                <div className={cx("flex flex-col gap-3", !isDesktop && selection.count > 0 && "pb-28")}>
                    <DataTableToolbar
                        label={`flags at ${place}`}
                        views={views}
                        view={view}
                        onViewChange={(id) => {
                            setView(id as QueueTab);
                            relist();
                        }}
                        query={query}
                        onQueryChange={(value) => {
                            setQuery(value);
                            relist();
                        }}
                        searchPlaceholder="Search by item, order, person or what was flagged"
                        compactSearchPlaceholder="Search flags"
                        filters={filterDefs}
                        activeFilters={filters}
                        onFiltersChange={(next) => {
                            setFilters(next);
                            relist();
                        }}
                        sorts={SORTS}
                        sort={sort}
                        onSortChange={(id) => setSort(id as FlagSort)}
                        summary={isDesktop ? summaryText : undefined}
                    />

                    {!isDesktop && filtered.length > 0 && (
                        <SelectModeRow
                            summary={summaryText ?? plural(inThisView.length, "flag")}
                            selectMode={selectMode}
                            onToggle={() => {
                                if (selectMode) selection.clear();
                                setSelectMode(!selectMode);
                            }}
                        />
                    )}

                    {filtered.length === 0 ? (
                        empty
                    ) : isDesktop ? (
                        <ListTable
                            label={`Flags at ${place}`}
                            noun="flags"
                            rows={filtered}
                            rowId={(r) => r.flag.id}
                            rowName={(r) => r.flag.title}
                            columns={columns}
                            selection={selection}
                            bulkBar={bulkBar(BULK_BAR_OVER_HEADER)}
                        />
                    ) : (
                        // The cards link to each flag's own page. A plain tap opens the flag in this screen instead,
                        // so the review state made here carries over; the shared list has no tap handler to pass.
                        <div
                            role="presentation"
                            onClickCapture={(event) => {
                                const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("li[data-row] > a");
                                const id = link?.closest<HTMLElement>("li[data-row]")?.dataset.row;
                                if (!id || !plainClick(event)) return;
                                event.preventDefault();
                                openFlag(id);
                            }}
                        >
                            <ListCards
                                label={`Flags at ${place}`}
                                rows={filtered}
                                rowId={(r) => r.flag.id}
                                href={(r) => ROUTES.flag(r.flag.id)}
                                selection={selection}
                                selectMode={selectMode}
                                onSelectMode={setSelectMode}
                                card={card}
                            />
                        </div>
                    )}

                    {!isDesktop && bulkBar()}
                </div>

                <ListNotice notice={notice} onDismiss={() => setNotice(null)} />
            </PageContent>

            <HowFlagsWork isOpen={howOpen} onOpenChange={setHowOpen} />

            {/* Desktop: the flag opens beside the list, so what is done there shows in the table straight away. */}
            {/* The slideout hands `className` to its overlay and its panel alike, so the wider panel is set from the overlay (`*:`). */}
            <SlideoutMenu isOpen={isDesktop && Boolean(activeFlag)} onOpenChange={(open) => !open && openFlag(null)} isDismissable className="z-40 *:max-w-160">
                {({ close }) =>
                    activeFlag && (
                        <>
                            <SlideoutMenu.Header onClose={close} className="flex items-center justify-between gap-3 pr-14 md:pr-14">
                                <h2 className="text-sm font-semibold text-secondary">Flag</h2>
                                <Button href={ROUTES.flag(activeFlag.id)} color="link-color" size="sm" iconTrailing={LinkExternal01}>
                                    Open full page
                                </Button>
                            </SlideoutMenu.Header>
                            <SlideoutMenu.Content className="pb-6" data-testid="flag-panel">
                                <FlagDetailBody
                                    key={activeFlag.id}
                                    flag={activeFlag}
                                    review={reviewOf(activeFlag)}
                                    user={user}
                                    onAction={actOnActive}
                                    layout="panel"
                                />
                            </SlideoutMenu.Content>
                        </>
                    )
                }
            </SlideoutMenu>

            {dialog === "assign" && (
                <AssignDialog
                    count={selectedRows.filter((r) => "action" in canAssign(r)).length}
                    skips={skipText(tallySkips(selectedRows, canAssign), "will be")}
                    people={reviewers}
                    user={user}
                    onClose={() => setDialog(null)}
                    onConfirm={(person) =>
                        runBulk(decideAssign(person), (n) => `${plural(n, "flag")} assigned to ${person.id === user.id ? "you" : person.name}.`)
                    }
                />
            )}
            {dialog === "resolve" && (
                <ResolveDialog
                    count={closable.length}
                    highCount={closable.filter((r) => r.flag.severity === "high").length}
                    skips={skipText(tallySkips(selectedRows, canClose), "will be")}
                    onClose={() => setDialog(null)}
                    onConfirm={(outcome, note) =>
                        runBulk(decideClose({ type: "resolve", outcome, note }), (n) => `${plural(n, "flag")} resolved as “${OUTCOME_LABEL[outcome]}”.`)
                    }
                />
            )}
            {dialog === "dismiss" && (
                <DismissDialog
                    rows={closable}
                    skips={skipText(tallySkips(selectedRows, canClose), "will be")}
                    onClose={() => setDialog(null)}
                    onConfirm={(reason, includeHigh) =>
                        runBulk(decideClose({ type: "dismiss", note: reason }, includeHigh), (n, changed) => {
                            const highCount = changed.filter((r) => r.flag.severity === "high").length;
                            const highText =
                                highCount === 0
                                    ? ""
                                    : highCount < n
                                      ? `, ${highCount} of them high severity`
                                      : n === 1
                                        ? ", high severity"
                                        : ", all high severity";
                            return `${plural(n, "flag")} dismissed${highText}. ${n === 1 ? "It is" : "They are"} under Closed with the reason.`;
                        })
                    }
                />
            )}
        </AppShell>
    );
};
