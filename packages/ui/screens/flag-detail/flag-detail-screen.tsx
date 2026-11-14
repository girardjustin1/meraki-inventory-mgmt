"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, InfoCircle, Lock01, RefreshCcw01, SearchLg, XCircle } from "@untitledui/icons";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { PinInput } from "@/components/base/input/pin-input";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { EvidenceList } from "@/components/meraki/evidence-list";
import { formatDetected } from "@/components/meraki/flag-card";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { NoteBody } from "@/components/meraki/note-body";
import { NoteThread } from "@/components/meraki/note-thread";
import { FlagSeverityBadge, FlagStatusBadge, OrderStatusBadge, RealDataBadge, SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, ROLE_LABEL, TODAY, flags, getItem, getPurchaseOrder, locationName, notesFor, userById, users, vendorById } from "@/data/inventory";
import type { Flag, FlagStatus, FlagType, LocationId, Note, User } from "@/data/types";
import { formatDate, formatTime } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { cx } from "@/utils/cx";

// ------------------------------------------------------------------------------------ review state

export type FlagOutcome = "explained" | "corrected" | "loss-confirmed" | "process-change";

export const OUTCOMES: { id: FlagOutcome; label: string; hint: string }[] = [
    { id: "explained", label: "Explained", hint: "There is an ordinary reason and the records are right as they stand." },
    { id: "corrected", label: "Corrected the record", hint: "A receipt, count or order was wrong and has been fixed." },
    { id: "loss-confirmed", label: "Loss confirmed", hint: "Stock is missing and nothing on record accounts for it." },
    { id: "process-change", label: "Process change needed", hint: "The way this is done needs to change so it does not happen again." },
];

export const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.id, o.label])) as Record<FlagOutcome, string>;

export interface FlagEvent {
    id: string;
    kind: "detected" | "assigned" | "unassigned" | "review-started" | "note" | "resolved" | "dismissed" | "reopened";
    /** ISO date or datetime. Missing when the record does not say when it happened. */
    at?: string;
    userId?: string;
    /** For a note this is the stored body, mention tokens included (see engine/mentions.ts). */
    text?: string;
}

/** Everything about a flag that changes while it is being reviewed. Held in local state in the prototype. */
export interface FlagReview {
    status: FlagStatus;
    assignedTo?: string;
    outcome?: FlagOutcome;
    resolutionNote?: string;
    events: FlagEvent[];
}

export type FlagAction =
    | { type: "assign"; userId?: string }
    | { type: "start" }
    | { type: "note"; text: string }
    | { type: "resolve"; outcome: FlagOutcome; note: string }
    | { type: "dismiss"; note: string }
    | { type: "reopen" };

export const seedReview = (flag: Flag, override?: Partial<Pick<FlagReview, "status" | "assignedTo" | "outcome" | "resolutionNote">>): FlagReview => {
    const status = override?.status ?? flag.status;
    const assignedTo = override?.assignedTo ?? flag.assignedTo;
    const resolutionNote = override?.resolutionNote ?? flag.resolutionNote;
    const outcome = override?.outcome ?? (status === "resolved" ? "explained" : undefined);
    const events: FlagEvent[] = [
        { id: "detected", kind: "detected", at: flag.detectedAt, text: `Raised by the "${FLAG_TYPE_LABEL[flag.type].toLowerCase()}" rule.` },
    ];
    if (assignedTo) events.push({ id: "assigned", kind: "assigned", userId: assignedTo });
    if (status !== "open") events.push({ id: "review-started", kind: "review-started", userId: assignedTo });
    if (status === "resolved") events.push({ id: "resolved", kind: "resolved", userId: assignedTo, text: resolutionNote });
    if (status === "dismissed") events.push({ id: "dismissed", kind: "dismissed", userId: assignedTo, text: resolutionNote });
    return { status, assignedTo, outcome, resolutionNote, events };
};

const pad = (n: number) => String(n).padStart(2, "0");
/** The prototype's fixed date with the wall-clock time, so new entries sort after the seeded ones. */
const nowIso = () => {
    const d = new Date();
    return `${TODAY}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
};

export const applyFlagAction = (review: FlagReview, action: FlagAction, actor: User): FlagReview => {
    const event = (kind: FlagEvent["kind"], text?: string, userId = actor.id): FlagEvent => ({
        id: `${kind}-${review.events.length}-${Date.now()}`,
        kind,
        at: nowIso(),
        userId,
        text,
    });
    switch (action.type) {
        case "assign":
            if (action.userId === review.assignedTo) return review;
            return {
                ...review,
                assignedTo: action.userId,
                events: [...review.events, action.userId ? event("assigned", `Assigned by ${actor.name}.`, action.userId) : event("unassigned")],
            };
        case "start":
            return { ...review, status: "reviewing", assignedTo: review.assignedTo ?? actor.id, events: [...review.events, event("review-started")] };
        case "note":
            return { ...review, events: [...review.events, event("note", action.text)] };
        case "resolve":
            return {
                ...review,
                status: "resolved",
                outcome: action.outcome,
                resolutionNote: action.note,
                events: [...review.events, event("resolved", action.note)],
            };
        case "dismiss":
            return {
                ...review,
                status: "dismissed",
                outcome: undefined,
                resolutionNote: action.note,
                events: [...review.events, event("dismissed", action.note)],
            };
        case "reopen":
            return { ...review, status: "open", outcome: undefined, resolutionNote: undefined, events: [...review.events, event("reopened")] };
    }
};

/** Local review state for a set of flags. Flags that have not been touched read straight from the data. */
export const useFlagReviews = (source: Flag[], seeds?: Record<string, Parameters<typeof seedReview>[1]>) => {
    const [reviews, setReviews] = useState<Record<string, FlagReview>>({});
    const byId = new Map(source.map((f) => [f.id, f]));
    const get = (flag: Flag) => reviews[flag.id] ?? seedReview(flag, seeds?.[flag.id]);
    const act = (ids: string[], action: FlagAction, actor: User) =>
        setReviews((prev) => {
            const next = { ...prev };
            for (const id of ids) {
                const flag = byId.get(id);
                if (flag) next[id] = applyFlagAction(prev[id] ?? seedReview(flag, seeds?.[id]), action, actor);
            }
            return next;
        });
    /** The flag as it stands after local review actions. */
    const current = (flag: Flag): Flag => {
        const r = get(flag);
        return { ...flag, status: r.status, assignedTo: r.assignedTo, resolutionNote: r.resolutionNote };
    };
    return { get, act, current };
};

/** Owners and managers can assign and close flags (see ROLE_PERMISSIONS). */
export const canReviewFlags = (user: User) => user.role === "owner" || user.role === "manager";
export const reviewersFor = (location: LocationId) => users.filter((u) => canReviewFlags(u) && u.locations.includes(location));

// ------------------------------------------------------------------------------------ pieces

/** How the person on the record relates to the flag. Describes the record, not their conduct. */
const PERSON_ROLE: Partial<Record<FlagType, string>> = {
    "received-mismatch": "Logged the receipt",
    "variant-mismatch": "Logged the receipt",
    "order-spike": "Placed the order",
    "count-variance": "Did the count",
    "missed-count": "Assigned the count",
    "unexplained-adjustment": "Made the adjustment",
};

const EVENT_VERB: Record<FlagEvent["kind"], string> = {
    detected: "Flag raised",
    assigned: "Assigned to",
    unassigned: "Unassigned by",
    "review-started": "Review started by",
    note: "Note from",
    resolved: "Resolved by",
    dismissed: "Dismissed by",
    reopened: "Reopened by",
};

const EVENT_DOT: Record<FlagEvent["kind"], string> = {
    detected: "bg-fg-error-secondary",
    assigned: "bg-fg-quaternary",
    unassigned: "bg-fg-quaternary",
    "review-started": "bg-fg-brand-primary",
    note: "bg-fg-quaternary",
    resolved: "bg-fg-success-secondary",
    dismissed: "bg-fg-quaternary",
    reopened: "bg-fg-warning-secondary",
};

const when = (at?: string) => {
    if (!at) return "Time not recorded";
    const day = at.slice(0, 10);
    const date = formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));
    return at.length > 10 ? `${date}, ${formatTime(at)}` : date;
};

const LinkRow = ({ href, label, children }: { href?: string; label: string; children: ReactNode }) => {
    const body = (
        <>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-tertiary">{label}</span>
                {children}
            </div>
            {href && <ArrowRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />}
        </>
    );
    const classes = "flex min-h-11 items-center gap-3 px-4 py-3 lg:px-5";
    return href ? (
        <a
            href={href}
            className={cx(
                classes,
                "outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2",
            )}
        >
            {body}
        </a>
    ) : (
        <div className={classes}>{body}</div>
    );
};

const FairProcessNote = ({ className }: { className?: string }) => (
    <p className={cx("flex items-start gap-2 rounded-lg bg-brand-primary_alt px-3 py-2.5 text-sm text-secondary", className)}>
        <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
        <span>
            <span className="font-semibold">A flag is a prompt to check, not a conclusion.</span> It shows what the records say. Most have an ordinary
            explanation, and the review is where that gets written down.
        </span>
    </p>
);

interface CloseDialogProps {
    flag: Flag;
    mode: "resolve" | "dismiss";
    onClose: () => void;
    onConfirm: (result: { outcome?: FlagOutcome; note: string }) => void;
}

/** Resolve (outcome + note, then PIN for high severity) or dismiss (note). */
const CloseDialog = ({ flag, mode, onClose, onConfirm }: CloseDialogProps) => {
    const [outcome, setOutcome] = useState<FlagOutcome | null>(null);
    const [note, setNote] = useState("");
    const [step, setStep] = useState<"form" | "pin">("form");
    const [pin, setPin] = useState("");
    const [tried, setTried] = useState(false);

    const needsPin = mode === "resolve" && flag.severity === "high";
    const noteOk = note.trim().length >= 3;
    const formOk = noteOk && (mode === "dismiss" || outcome !== null);
    const finish = () => onConfirm({ outcome: mode === "resolve" ? (outcome ?? undefined) : undefined, note: note.trim() });
    const submit = () => {
        setTried(true);
        if (!formOk) return;
        if (needsPin) setStep("pin");
        else finish();
    };

    return (
        <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="sm:max-w-md">
                <Dialog aria-label={mode === "resolve" ? "Resolve flag" : "Dismiss flag"}>
                    {step === "form" ? (
                        <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">{mode === "resolve" ? "Resolve this flag" : "Dismiss this flag"}</h2>
                                <p className="text-sm text-tertiary">
                                    {mode === "resolve"
                                        ? "Record what the check found. The outcome and note stay on the flag and feed the monthly digest."
                                        : "Dismiss a flag when it should not have been raised, for example a known data entry quirk. Say why so the rule can be tuned."}
                                </p>
                            </div>
                            <p className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary ring-1 ring-secondary ring-inset">
                                {flag.title}
                            </p>

                            {mode === "resolve" && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-sm font-medium text-secondary">What did the check find?</p>
                                    <RadioGroup aria-label="Outcome" value={outcome} onChange={(v) => setOutcome(v as FlagOutcome)} className="gap-3">
                                        {OUTCOMES.map((o) => (
                                            <RadioButton key={o.id} value={o.id} label={o.label} hint={o.hint} />
                                        ))}
                                    </RadioGroup>
                                    {tried && outcome === null && <p className="text-sm text-error-primary">Choose an outcome.</p>}
                                </div>
                            )}

                            <TextArea
                                label={mode === "resolve" ? "Note" : "Reason for dismissing"}
                                isRequired
                                rows={3}
                                value={note}
                                onChange={setNote}
                                isInvalid={tried && !noteOk}
                                placeholder={mode === "resolve" ? "What you checked and what you found" : "Why this flag does not need a review"}
                                hint={tried && !noteOk ? "A note is required." : "Stick to what was checked and found. The person on the record can read this."}
                            />

                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button color="secondary" size="md" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button color="primary" size="md" onClick={submit} iconTrailing={needsPin ? Lock01 : undefined}>
                                    {mode === "dismiss" ? "Dismiss flag" : needsPin ? "Continue to PIN" : "Resolve flag"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full flex-col items-center gap-5 p-4 text-center sm:p-6">
                            <span className="flex size-12 items-center justify-center rounded-full bg-brand-secondary text-fg-brand-primary">
                                <Lock01 className="size-6" aria-hidden="true" />
                            </span>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">Confirm with your PIN</h2>
                                <p className="text-sm text-tertiary">
                                    High-severity flags need a PIN to close, so the record shows who made the call. Outcome:{" "}
                                    {outcome ? OUTCOME_LABEL[outcome] : ""}.
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
                            <p className="text-xs text-quaternary">
                                Prototype: any four digits are accepted. The live app checks the PIN you unlock the device with.
                            </p>
                            <div className="flex w-full flex-col-reverse gap-3 sm:flex-row">
                                <Button color="secondary" size="md" className="flex-1" onClick={() => setStep("form")}>
                                    Back
                                </Button>
                                <Button color="primary" size="md" className="flex-1" isDisabled={pin.length < 4} onClick={finish}>
                                    Confirm and resolve
                                </Button>
                            </div>
                        </div>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};

// ------------------------------------------------------------------------------------ body

interface FlagDetailBodyProps {
    flag: Flag;
    review: FlagReview;
    user: User;
    onAction: (action: FlagAction) => void;
    /** `page` uses two columns on desktop. `panel` is a single column for the queue's side panel. */
    layout?: "page" | "panel";
    /** Show the flag title inside the first card (the page layout already has it in the header). */
    showTitle?: boolean;
}

/** The whole review of one flag: observation, evidence, next step, linked records, decision, notes and timeline. */
export const FlagDetailBody = ({ flag, review, user, onAction, layout = "page", showTitle = layout === "panel" }: FlagDetailBodyProps) => {
    const [dialog, setDialog] = useState<"resolve" | "dismiss" | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    const order = flag.purchaseOrderId ? getPurchaseOrder(flag.purchaseOrderId) : undefined;
    const item = flag.itemId ? getItem(flag.itemId) : undefined;
    const person = userById(flag.userId);
    const assignee = userById(review.assignedTo);
    const closed = review.status === "resolved" || review.status === "dismissed";
    const namedOnFlag = Boolean(person && person.id === user.id);
    const canReview = canReviewFlags(user);
    const canClose = canReview && !namedOnFlag;
    const page = layout === "page";

    // Notes live in the thread. Sample notes come from the data layer; notes posted in this session are
    // also kept as review events, so they survive the thread being closed and reopened (the queue's panel).
    const subject = { type: "flag" as const, id: flag.id };
    const seededNotes = notesFor("flag", flag.id);
    const postedNotes: Note[] = review.events
        .filter((e) => e.kind === "note")
        .map((e) => ({ id: e.id, subject, authorId: e.userId ?? "", body: e.text ?? "", createdAt: e.at ?? TODAY }));
    // The timeline shows every note: sample ones are slotted in by time, ahead of anything done later.
    const timelineEvents = [...review.events];
    for (const n of seededNotes) {
        const later = timelineEvents.findIndex((e, i) => i > 0 && e.at !== undefined && e.at > n.createdAt);
        timelineEvents.splice(later === -1 ? timelineEvents.length : later, 0, { id: n.id, kind: "note", at: n.createdAt, userId: n.authorId, text: n.body });
    }

    const run = (action: FlagAction, message: string) => {
        onAction(action);
        setConfirmation(message);
    };

    const actions = (size: "sm" | "md", stretch?: boolean) => {
        const grow = "flex-1";
        if (closed) {
            return canClose ? (
                <Button color="secondary" size={size} className={grow} iconLeading={RefreshCcw01} onClick={() => run({ type: "reopen" }, "Flag reopened.")}>
                    Reopen
                </Button>
            ) : null;
        }
        return (
            <>
                {review.status === "open" && canReview && (
                    <Button
                        color={canClose ? "secondary" : "primary"}
                        size={size}
                        className={grow}
                        iconLeading={SearchLg}
                        onClick={() => run({ type: "start" }, "Review started.")}
                    >
                        Start review
                    </Button>
                )}
                {canClose && (
                    <>
                        <Button color="secondary" size={size} className={grow} iconLeading={XCircle} onClick={() => setDialog("dismiss")}>
                            Dismiss
                        </Button>
                        <Button
                            color="primary"
                            size={size}
                            className={stretch ? "flex-1" : "order-first basis-full"}
                            iconLeading={CheckCircle}
                            onClick={() => setDialog("resolve")}
                        >
                            Resolve
                        </Button>
                    </>
                )}
            </>
        );
    };
    const hasActions = closed ? canClose : canClose || (review.status === "open" && canReview);

    const observed = (
        <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <FlagSeverityBadge severity={flag.severity} size="md" />
                <span className="text-sm font-semibold text-secondary">{FLAG_TYPE_LABEL[flag.type]}</span>
                <span className="ml-auto flex items-center gap-1.5">
                    {flag.fromRealData ? <RealDataBadge /> : <SampleBadge />}
                    <FlagStatusBadge status={review.status} />
                </span>
            </div>
            <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-tertiary">What was observed</p>
                {showTitle && <h2 className="text-lg font-semibold text-primary">{flag.title}</h2>}
                <p className={cx("text-secondary", showTitle ? "text-sm" : "text-md")}>{flag.summary}</p>
                <p className="text-sm text-tertiary">
                    Detected {formatDetected(flag.detectedAt)}
                    {flag.detectedAt.length > 10 ? ` at ${formatTime(flag.detectedAt)}` : ""} · {locationName(flag.locationId)}
                </p>
            </div>
            <FairProcessNote />
        </Card>
    );

    const evidence = (
        <Card className="flex flex-col gap-4">
            <CardHeader
                title="Evidence"
                description={
                    flag.fromRealData
                        ? "Taken from Meraki's 2026 order and stock sheets as they were imported."
                        : "Built from sample activity generated for the prototype, to show how this rule reads."
                }
            />
            <EvidenceList evidence={flag.evidence} />
        </Card>
    );

    const nextStep = (
        <Card className="flex flex-col gap-2">
            <CardHeader title="Suggested next step" />
            <p className="text-md text-secondary">{flag.suggestedAction}</p>
        </Card>
    );

    const decision = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="Review" actions={<FlagStatusBadge status={review.status} size="md" />} />

            {closed && (
                <div className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary ring-inset">
                    <p className="text-sm font-semibold text-secondary">
                        {review.status === "resolved"
                            ? `Outcome: ${review.outcome ? OUTCOME_LABEL[review.outcome] : "Recorded"}`
                            : "Dismissed without a review"}
                    </p>
                    {review.resolutionNote && <p className="text-sm text-tertiary">{review.resolutionNote}</p>}
                </div>
            )}

            {canReview ? (
                <NativeSelect
                    label="Assigned to"
                    size="md"
                    value={review.assignedTo ?? ""}
                    disabled={closed}
                    onChange={(e) => {
                        const next = userById(e.target.value);
                        run({ type: "assign", userId: next?.id }, next ? `Assigned to ${next.name}.` : "Unassigned.");
                    }}
                    options={[
                        { label: "Unassigned", value: "" },
                        ...reviewersFor(flag.locationId).map((u) => ({ label: `${u.name} (${ROLE_LABEL[u.role]})`, value: u.id })),
                    ]}
                />
            ) : (
                <div className="flex flex-col gap-1.5">
                    <p className="text-sm font-medium text-secondary">Assigned to</p>
                    {assignee ? (
                        <span className="flex items-center gap-2 text-sm text-secondary">
                            <Avatar size="xs" initials={initials(assignee.name)} />
                            {assignee.name}
                        </span>
                    ) : (
                        <span className="text-sm text-tertiary">Nobody yet</span>
                    )}
                </div>
            )}

            {namedOnFlag && (
                <p className="rounded-lg bg-warning-primary px-3 py-2.5 text-sm text-secondary">
                    <span className="font-semibold">Your login is on this record,</span> so another manager or the owner needs to close it. You can add a note
                    with what you know.
                </p>
            )}
            {!canReview && <p className="text-sm text-tertiary">Managers and owners close flags. You can add a note with what you know.</p>}
            {flag.severity === "high" && canClose && !closed && (
                <p className="flex items-center gap-1.5 text-xs text-tertiary">
                    <Lock01 className="size-3.5 text-fg-quaternary" aria-hidden="true" />
                    Resolving a high-severity flag asks for your PIN.
                </p>
            )}

            {hasActions && <div className="hidden flex-wrap gap-2 lg:flex">{actions("md")}</div>}
            {confirmation && (
                <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                    <CheckCircle className="size-4" aria-hidden="true" />
                    {confirmation}
                </p>
            )}
        </Card>
    );

    const linked = (
        <Card padded={false} className="overflow-hidden">
            <div className="p-4 pb-2 lg:p-5 lg:pb-2">
                <CardHeader title="Linked records" />
            </div>
            <div className="divide-y divide-secondary">
                {order && (
                    <LinkRow href={ROUTES.order(order.id)} label="Order">
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-primary">{order.number}</span>
                            <OrderStatusBadge status={order.status} />
                        </span>
                        <span className="text-sm text-tertiary">
                            {vendorById(order.vendorId).name} · {order.lines.length} lines
                        </span>
                    </LinkRow>
                )}
                {item ? (
                    <LinkRow href={ROUTES.item(item.id)} label="Item">
                        <span className="flex items-center gap-2.5">
                            <ItemThumb item={item} size="sm" />
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-semibold text-primary">{item.name}</span>
                                <span className="truncate text-sm text-tertiary">
                                    {[item.brand, item.colorCode ?? item.sku, item.category].filter(Boolean).join(" · ")}
                                </span>
                            </span>
                        </span>
                    </LinkRow>
                ) : flag.itemName ? (
                    <LinkRow label="Item">
                        <span className="text-sm font-semibold text-primary">{flag.itemName}</span>
                        <span className="text-sm text-tertiary">Not matched to a catalogue item yet</span>
                    </LinkRow>
                ) : null}
                {person && (
                    <LinkRow label={PERSON_ROLE[flag.type] ?? "Person on the record"}>
                        <span className="flex items-center gap-2.5">
                            <Avatar size="sm" initials={initials(person.name)} />
                            <span className="flex min-w-0 flex-col">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                                    {person.name}
                                    <SampleBadge label="Sample name" />
                                </span>
                                <span className="text-sm text-tertiary">{ROLE_LABEL[person.role]}</span>
                            </span>
                        </span>
                        <span className="text-xs text-tertiary">
                            Named because their login is on the record. It says who can help explain it, nothing more.
                        </span>
                    </LinkRow>
                )}
                {!order && !item && !flag.itemName && !person && (
                    <p className="px-4 py-3 text-sm text-tertiary lg:px-5">This flag is about the catalogue as a whole, not one record.</p>
                )}
            </div>
        </Card>
    );

    const notesCard = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="Notes" description="What people checked and found. Type @ to bring someone in. Notes cannot be edited once added." />
            <NoteThread
                key={flag.id}
                subject={subject}
                subjectTitle={flag.title}
                href={ROUTES.flag(flag.id)}
                initialNotes={[...seededNotes, ...postedNotes]}
                user={user}
                location={flag.locationId}
                onPost={(note) => onAction({ type: "note", text: note.body })}
            />
        </Card>
    );

    const timeline = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="Timeline" />
            <ol className="flex flex-col">
                {timelineEvents.map((e, i) => {
                    const actor = userById(e.userId);
                    const last = i === timelineEvents.length - 1;
                    return (
                        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                            {!last && <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-px bg-border-secondary" />}
                            <span
                                aria-hidden="true"
                                className={cx("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-bg-primary", EVENT_DOT[e.kind])}
                            />
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <p className="text-sm text-secondary">
                                    <span className="font-semibold text-primary">{EVENT_VERB[e.kind]}</span>
                                    {e.kind !== "detected" && ` ${actor?.name ?? "someone not recorded"}`}
                                </p>
                                {e.text &&
                                    (e.kind === "note" ? (
                                        <NoteBody body={e.text} viewerId={user.id} className="text-tertiary" />
                                    ) : (
                                        <p className="text-sm break-words text-tertiary">{e.text}</p>
                                    ))}
                                <p className="text-xs text-quaternary">{when(e.at)}</p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </Card>
    );

    return (
        <>
            {page ? (
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
                    {/* On phones the review card sits right after the next step; on desktop it is a sticky side column. */}
                    <div className="contents lg:col-span-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                        <div className="order-1 lg:order-none">{observed}</div>
                        <div className="order-2 lg:order-none">{evidence}</div>
                        <div className="order-3 lg:order-none">{nextStep}</div>
                        <div className="order-5 lg:order-none">{notesCard}</div>
                        <div className="order-6 lg:order-none">{timeline}</div>
                    </div>
                    <aside className="order-4 flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:order-none lg:gap-6">
                        {decision}
                        {linked}
                    </aside>
                </div>
            ) : (
                <div className="flex min-w-0 flex-col gap-4">
                    {observed}
                    {evidence}
                    {nextStep}
                    {decision}
                    {linked}
                    {notesCard}
                    {timeline}
                </div>
            )}

            {hasActions && (
                <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex gap-2 rounded-xl bg-primary/95 p-2 shadow-lg ring-1 ring-secondary backdrop-blur lg:hidden">
                    {actions("md", true)}
                </div>
            )}

            {dialog && (
                <CloseDialog
                    flag={flag}
                    mode={dialog}
                    onClose={() => setDialog(null)}
                    onConfirm={({ outcome, note }) => {
                        if (dialog === "resolve" && outcome) run({ type: "resolve", outcome, note }, `Resolved: ${OUTCOME_LABEL[outcome]}.`);
                        else run({ type: "dismiss", note }, "Flag dismissed.");
                        setDialog(null);
                    }}
                />
            )}
        </>
    );
};

// ------------------------------------------------------------------------------------ screen

/** Default: a high-severity receiving mismatch taken from the imported 2026 orders. */
const defaultFlag = () =>
    flags.find((f) => f.type === "received-mismatch" && f.severity === "high" && f.fromRealData) ??
    flags.find((f) => f.severity === "high") ??
    (flags[0] as Flag);

interface FlagDetailScreenProps {
    flagId?: string;
    user?: User;
    /** Story helpers: show the flag at a later point in its review. */
    status?: FlagStatus;
    assignedTo?: string;
    outcome?: FlagOutcome;
    resolutionNote?: string;
}

export const FlagDetailScreen = ({ flagId, user = CURRENT_USER, status, assignedTo, outcome, resolutionNote }: FlagDetailScreenProps) => {
    const flag = flags.find((f) => f.id === flagId) ?? defaultFlag();
    const [location, setLocation] = useState<LocationId>(flag.locationId);
    const { get, act } = useFlagReviews([flag], status || assignedTo ? { [flag.id]: { status, assignedTo, outcome, resolutionNote } } : undefined);
    const review = get(flag);

    return (
        <AppShell activeUrl={ROUTES.flags} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    eyebrow={
                        <a
                            href={ROUTES.flags}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:min-h-0"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Review queue
                        </a>
                    }
                    title={flag.title}
                    description={`${FLAG_TYPE_LABEL[flag.type]} · ${locationName(flag.locationId)}`}
                />
                <FlagDetailBody key={flag.id} flag={flag} review={review} user={user} onAction={(action) => act([flag.id], action, user)} />
                {!flag.fromRealData && (
                    <SampleDataNote>
                        This flag was raised from sample counts and adjustments, with sample staff names. It shows how the rule reads; it is not a real finding.
                    </SampleDataNote>
                )}
                {flag.fromRealData && (
                    <SampleDataNote>The quantities and dates on this flag come from Meraki&apos;s 2026 sheets. Staff names are sample values.</SampleDataNote>
                )}
            </PageContent>
        </AppShell>
    );
};
