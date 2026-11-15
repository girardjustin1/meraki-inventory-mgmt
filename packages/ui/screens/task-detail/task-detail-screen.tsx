"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    BellRinging01,
    Camera01,
    Check,
    CheckCircle,
    Clock,
    CreditCard01,
    CurrencyDollar,
    InfoCircle,
    MarkerPin01,
    ShoppingCart01,
    Truck01,
    User01,
    XCircle,
} from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { PAY_OPTIONS } from "@/components/meraki/assign-pickup-dialog";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { NOTHING_SENT, NOTIFY_HOW, NoteBody, nowIso, relativeTime } from "@/components/meraki/note-body";
import { NoteThread } from "@/components/meraki/note-thread";
import { QuantityStepper, quantityText } from "@/components/meraki/quantity-stepper";
import { SampleBadge } from "@/components/meraki/status-badges";
import { ProgressBar, TASK_TYPE, TaskStatusBadge, canAssignTasks, dueInfo, isOpenTask, pickupProgress, progressText } from "@/components/meraki/task-card";
import { CURRENT_USER, ROLE_LABEL, countSessions, getItem, getPurchaseOrder, getTask, locationName, tasks, userById, users } from "@/data/inventory";
import type { LocationId, PickupLine, Task, User } from "@/data/types";
import { cx } from "@/utils/cx";

// ------------------------------------------------------------------------------------ helpers

/** How the person who went describes paying. Stored with the same words the asker chose from. */
const PAID_LABEL: Record<(typeof PAY_OPTIONS)[number], string> = {
    "Salon card": "Salon card",
    Reimburse: "I paid, reimburse me",
    Account: "On the salon's account",
};

/** The same choice read back afterwards by anyone. */
const PAID_SUMMARY: Record<string, string> = { Reimburse: "To be reimbursed", Account: "On the salon's account" };
const paidText = (paidWith: string) => PAID_SUMMARY[paidWith] ?? paidWith;

type LineState = "todo" | "all" | "short" | "none";

const lineState = (l: PickupLine): LineState => (l.picked === undefined ? "todo" : l.picked >= l.qty ? "all" : l.picked > 0 ? "short" : "none");

const unitOf = (l: PickupLine) => (l.itemId ? getItem(l.itemId)?.unit : undefined);

const lineSummary = (l: PickupLine) => {
    const state = lineState(l);
    if (state === "todo") return "Not ticked";
    if (state === "all") return l.picked !== undefined && l.picked > l.qty ? `Got ${l.picked}, ${l.picked - l.qty} more than asked` : "Got all";
    if (state === "none") return "Couldn't get it";
    return `Got ${l.picked} of ${l.qty}`;
};

/** The record a task that is not a pickup run points at. Tasks do not carry a link yet, so this is a best match. */
const linkedRecord = (task: Task): { label: string; title: string; detail: string; href: string } | null => {
    if (task.type === "review" || task.type === "count") {
        // Prefer the record the task names; fall back to matching the title for older tasks.
        const session =
            (task.subject?.type === "count" ? countSessions.find((c) => c.id === task.subject?.id) : undefined) ??
            countSessions.find((c) => c.locationId === task.locationId && (task.title.includes(c.name) || task.title.includes(c.area)));
        return session
            ? {
                  label: "Count",
                  title: session.name,
                  detail: `${session.lines.length} items · ${locationName(session.locationId)}`,
                  href: ROUTES.count(session.id),
              }
            : { label: "Counts", title: "All counts", detail: "Find the count this task is about.", href: ROUTES.counts };
    }
    if (task.type === "receive")
        return { label: "Receiving", title: "Deliveries to receive", detail: "Receive it against the open order.", href: ROUTES.receive };
    return null;
};

const Notice = ({ tone = "info", children }: { tone?: "info" | "success" | "warning"; children: ReactNode }) => {
    const Icon = tone === "success" ? CheckCircle : tone === "warning" ? AlertTriangle : InfoCircle;
    return (
        <p
            className={cx(
                "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm text-secondary",
                tone === "success" ? "bg-success-primary" : tone === "warning" ? "bg-warning-primary" : "bg-secondary ring-1 ring-secondary ring-inset",
            )}
        >
            <Icon
                className={cx(
                    "mt-0.5 size-4 shrink-0",
                    tone === "success" ? "text-fg-success-primary" : tone === "warning" ? "text-fg-warning-primary" : "text-fg-quaternary",
                )}
                aria-hidden="true"
            />
            <span>{children}</span>
        </p>
    );
};

/** Dollars and cents, as on a receipt: "$86.40". */
const money = (amount: number) => `$${amount.toFixed(2)}`;

const STOCK_NOTE = "Picking items up does not update stock. Stock changes when the delivery is received.";

const Fact = ({ icon: Icon, label, children }: { icon: FC<{ className?: string }>; label: string; children: ReactNode }) => (
    <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs font-medium text-tertiary">{label}</dt>
            <dd className="text-sm text-primary">{children}</dd>
        </div>
    </div>
);

const Person = ({ user, viewerId, suffix }: { user?: User; viewerId: string; suffix?: string }) => (
    <span className="flex flex-wrap items-center gap-2">
        <Avatar size="xs" initials={initials(user?.name ?? "?")} />
        <span className="font-semibold">{user ? (user.id === viewerId ? "You" : user.name) : "Someone who has left"}</span>
        {user && user.id !== viewerId && <span className="text-tertiary">{ROLE_LABEL[user.role]}</span>}
        {suffix && <span className="text-tertiary">{suffix}</span>}
    </span>
);

// ------------------------------------------------------------------------------------ pick list (the person in the store)

interface PickLineProps {
    line: PickupLine;
    onChange: (next: PickupLine) => void;
}

const PickLine = ({ line, onChange }: PickLineProps) => {
    const [noteOpen, setNoteOpen] = useState(Boolean(line.note));
    const state = lineState(line);
    const item = line.itemId ? getItem(line.itemId) : undefined;
    const unit = unitOf(line);

    return (
        <li
            data-line-state={state}
            className={cx(
                "flex flex-col gap-3 px-3 py-3.5 sm:px-4 lg:px-5",
                state === "all" && "bg-success-primary/60",
                (state === "short" || state === "none") && "bg-warning-primary/60",
            )}
        >
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={state === "all"}
                    aria-label={`Got all: ${line.name}`}
                    onClick={() => onChange({ ...line, picked: state === "all" ? undefined : line.qty })}
                    className={cx(
                        "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                        state === "all" ? "bg-brand-solid text-white ring-transparent" : "bg-primary text-transparent ring-primary hover:bg-primary_hover",
                    )}
                >
                    <Check className="size-6" strokeWidth={3} aria-hidden="true" />
                </button>
                {item && <ItemThumb item={item} size="md" className="max-sm:hidden" />}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-md font-semibold text-primary">{line.name}</p>
                    <p className="text-sm text-tertiary">
                        Want <span className="font-semibold text-secondary">{quantityText(line.qty, unit)}</span>
                        {state !== "todo" && (
                            <span className={cx("font-medium", state === "all" ? "text-success-primary" : "text-warning-primary")}> · {lineSummary(line)}</span>
                        )}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:pl-14">
                <QuantityStepper
                    size="md"
                    className="w-32"
                    label={`Got, ${line.name}`}
                    unit="got"
                    value={line.picked ?? 0}
                    onChange={(picked) => onChange({ ...line, picked })}
                />
                <button
                    type="button"
                    aria-pressed={state === "none"}
                    onClick={() => {
                        if (state === "none") onChange({ ...line, picked: undefined });
                        else {
                            onChange({ ...line, picked: 0 });
                            setNoteOpen(true);
                        }
                    }}
                    className={cx(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                        state === "none"
                            ? "bg-warning-secondary text-primary ring-transparent"
                            : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                    )}
                >
                    Couldn&apos;t get it
                </button>
                {!noteOpen && (
                    <Button
                        color="link-color"
                        size="md"
                        className="min-h-11 min-w-11 px-1"
                        aria-label={`Add a note for ${line.name}`}
                        onClick={() => setNoteOpen(true)}
                    >
                        Note
                    </Button>
                )}
            </div>

            {noteOpen && (
                <Input
                    aria-label={`Note for ${line.name}`}
                    size="md"
                    className="sm:pl-14"
                    inputClassName="min-h-11"
                    placeholder="Substituted with, or what happened"
                    value={line.note ?? ""}
                    onChange={(note) => onChange({ ...line, note: note || undefined })}
                />
            )}
        </li>
    );
};

/** The same list for someone watching the run, not doing it. */
const ReadOnlyLines = ({ lines }: { lines: PickupLine[] }) => (
    <ul className="divide-y divide-secondary">
        {lines.map((l, i) => {
            const state = lineState(l);
            return (
                <li key={`${l.name}-${i}`} className="flex items-start gap-3 px-4 py-3 lg:px-5">
                    <span
                        aria-hidden="true"
                        className={cx(
                            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                            state === "all" && "bg-success-secondary text-fg-success-primary",
                            (state === "short" || state === "none") && "bg-warning-secondary text-fg-warning-primary",
                            state === "todo" && "ring-[1.5px] ring-fg-quaternary ring-inset",
                        )}
                    >
                        {state === "all" && <Check className="size-4" strokeWidth={3} />}
                        {(state === "short" || state === "none") && <AlertTriangle className="size-3.5" />}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="text-sm font-medium text-primary">{l.name}</p>
                        {l.note && <p className="text-sm text-tertiary">{l.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                        <span className="text-sm font-semibold text-primary tabular-nums">× {l.qty}</span>
                        <span
                            className={cx(
                                "text-xs",
                                state === "all" ? "text-success-primary" : state === "todo" ? "text-tertiary" : "font-medium text-warning-primary",
                            )}
                        >
                            {lineSummary(l)}
                        </span>
                    </div>
                </li>
            );
        })}
    </ul>
);

const Shortfalls = ({ lines }: { lines: PickupLine[] }) => {
    const short = lines.filter((l) => lineState(l) === "short" || lineState(l) === "none");
    const untouched = lines.filter((l) => lineState(l) === "todo");
    if (short.length === 0 && untouched.length === 0) {
        return <Notice tone="success">Everything on the list was picked up in full.</Notice>;
    }
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-secondary">Not picked up in full</p>
            <ul data-testid="shortfalls" className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                {[...short, ...untouched].map((l, i) => (
                    <li key={`${l.name}-${i}`} className="flex flex-col gap-0.5 px-3 py-2">
                        <span className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 text-sm font-medium text-primary">{l.name}</span>
                            <span className="shrink-0 text-sm font-semibold text-warning-primary">
                                {lineState(l) === "todo"
                                    ? `Not ticked, wanted ${l.qty}`
                                    : lineState(l) === "none"
                                      ? `None of ${l.qty}`
                                      : `${l.picked} of ${l.qty}`}
                            </span>
                        </span>
                        {l.note && <span className="text-sm text-tertiary">{l.note}</span>}
                    </li>
                ))}
            </ul>
            {untouched.length > 0 && (
                <p className="text-sm text-tertiary">
                    {untouched.length} {untouched.length === 1 ? "line was" : "lines were"} not ticked. If you finish now{" "}
                    {untouched.length === 1 ? "it is" : "they are"} recorded as not picked up.
                </p>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------ screen

interface TaskDetailScreenProps {
    taskId?: string;
    /** Defaults to the person the task is assigned to, so the default view is the doer's. */
    user?: User;
    /** Story helper: open a run in progress on its finish step. */
    initialStep?: "pick" | "finish";
}

/** One task. For a pickup run: accept it, tick the list off in the store, finish, and hand the items over to be received. */
export const TaskDetailScreen = ({ taskId = "task-pickup-supply", user: userProp, initialStep = "pick" }: TaskDetailScreenProps) => {
    const source = getTask(taskId) ?? getTask("task-pickup-supply") ?? (tasks[0] as Task);
    const user = userProp ?? userById(source.assigneeId) ?? CURRENT_USER;

    const [location, setLocation] = useState<LocationId>(source.locationId);
    const [task, setTask] = useState<Task>(source);
    const [step, setStep] = useState<"pick" | "finish">(initialStep);
    const [message, setMessage] = useState<string | null>(null);
    const [justFinished, setJustFinished] = useState(false);
    // Decline
    const [declining, setDeclining] = useState(false);
    const [reason, setReason] = useState("");
    const [declineTried, setDeclineTried] = useState(false);
    // Finish
    const [amount, setAmount] = useState(source.amountPaid !== undefined ? String(source.amountPaid) : "");
    const [paidWith, setPaidWith] = useState<string | null>(source.paidWith ?? null);
    // Asker
    const [reassignTo, setReassignTo] = useState("");
    const [confirmCancel, setConfirmCancel] = useState(false);
    const [reminded, setReminded] = useState(false);

    const assignee = userById(task.assigneeId);
    const asker = userById(task.createdBy);
    const askerName = asker?.name ?? "The person who asked";
    const isAssignee = task.assigneeId === user.id;
    const canManage = !isAssignee && (task.createdBy === user.id || canAssignTasks(user));
    const isPickup = task.type === "pickup-run";
    const lines = task.lines ?? [];
    const progress = pickupProgress(lines);
    const open = isOpenTask(task.status);
    const due = dueInfo(task);
    const type = TASK_TYPE[task.type];
    const record = isPickup ? null : linkedRecord(task);
    const orders = (task.orderIds ?? []).map((id) => getPurchaseOrder(id)).filter((po) => po !== undefined);
    const amountNumber = Number.parseFloat(amount);
    const amountOk = amount.trim() === "" || (!Number.isNaN(amountNumber) && amountNumber >= 0);
    const willNotify = (who: string) => `${who} will be notified ${NOTIFY_HOW}. ${NOTHING_SENT}`;

    const update = (patch: Partial<Task>) => setTask((prev) => ({ ...prev, ...patch }));

    const accept = () => {
        update({ status: "accepted", acceptedAt: nowIso() });
        setMessage(`Accepted. ${willNotify(askerName)}`);
    };
    const decline = () => {
        setDeclineTried(true);
        if (reason.trim().length < 3) return;
        update({ status: "declined" });
        setDeclining(false);
        setMessage(`Declined. ${willNotify(askerName)}`);
    };
    const setLine = (index: number, next: PickupLine) => {
        update({ lines: lines.map((l, i) => (i === index ? next : l)), status: task.status === "accepted" ? "in-progress" : task.status });
        setMessage(null);
    };
    const finish = () => {
        if (!amountOk) return;
        update({
            status: "done",
            doneAt: nowIso(),
            // Lines never ticked are recorded as not picked up.
            lines: lines.map((l) => (l.picked === undefined ? { ...l, picked: 0 } : l)),
            amountPaid: amount.trim() === "" ? undefined : amountNumber,
            paidWith: paidWith ?? undefined,
        });
        setJustFinished(true);
        setMessage(null);
    };
    const markDone = () => {
        update({ status: "done", doneAt: nowIso() });
        setJustFinished(true);
        setMessage(null);
    };
    const remind = () => {
        setReminded(true);
        setMessage(`Reminder noted. ${willNotify(assignee?.name ?? "They")}`);
    };
    const reassign = () => {
        const next = userById(reassignTo);
        if (!next) return;
        const previous = assignee?.name;
        update({ assigneeId: next.id, status: "assigned", acceptedAt: undefined });
        setReassignTo("");
        setReminded(false);
        setMessage(`Reassigned to ${next.name}. ${next.name}${previous ? ` and ${previous}` : ""} will be notified ${NOTIFY_HOW}. ${NOTHING_SENT}`);
    };
    const cancel = () => {
        update({ status: "cancelled" });
        setConfirmCancel(false);
        setMessage(`Cancelled. ${willNotify(assignee?.name ?? "They")}`);
    };

    // -------------------------------------------------------------------------------- summary (header facts)

    const summary = (
        <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <TaskStatusBadge status={task.status} size="md" />
                <span className="text-sm font-semibold text-secondary">{type.label}</span>
                {task.isSample && (
                    <span className="ml-auto">
                        <SampleBadge />
                    </span>
                )}
            </div>
            <dl className="flex flex-col gap-3.5">
                {task.place && (
                    <Fact icon={MarkerPin01} label="Where">
                        <span className="font-semibold">{task.place}</span>
                    </Fact>
                )}
                <Fact icon={Clock} label="When">
                    <span className={cx("font-semibold", due.overdue && "text-error-primary")}>{due.label}</span>
                </Fact>
                <Fact icon={User01} label="Asked by">
                    <Person user={asker} viewerId={user.id} suffix={relativeTime(task.createdAt).replace(/^[TY]/, (c) => c.toLowerCase())} />
                </Fact>
                {!isAssignee && (
                    <Fact icon={User01} label={isPickup ? "Going" : "Assigned to"}>
                        <Person user={assignee} viewerId={user.id} />
                    </Fact>
                )}
                {orders.length > 0 && (
                    <Fact icon={ShoppingCart01} label={orders.length === 1 ? "Order" : "Orders"}>
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                            {orders.map((po) => (
                                <a
                                    key={po.id}
                                    href={ROUTES.order(po.id)}
                                    className="rounded-sm font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                >
                                    {po.number}
                                </a>
                            ))}
                        </span>
                    </Fact>
                )}
                {task.paidWith && task.status !== "done" && (
                    <Fact icon={CreditCard01} label="How to pay">
                        {task.paidWith}
                    </Fact>
                )}
            </dl>
            {task.note && (
                <div className="flex flex-col gap-1 rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary ring-inset">
                    <p className="text-xs font-semibold text-tertiary">Note from {asker?.id === user.id ? "you" : (asker?.name ?? "the person who asked")}</p>
                    <NoteBody body={task.note} viewerId={user.id} className="text-md text-primary" />
                </div>
            )}
        </Card>
    );

    // -------------------------------------------------------------------------------- done

    const doneCard = (
        <Card className="flex flex-col gap-4">
            <div data-testid="run-done" className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success-secondary text-fg-success-primary">
                    <CheckCircle className="size-6" aria-hidden="true" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <h2 className="text-lg font-semibold text-primary">{isPickup ? "Run finished" : "Done"}</h2>
                    <p className="text-sm text-tertiary">
                        {task.doneAt ? `Finished ${relativeTime(task.doneAt).replace(/^[TY]/, (c) => c.toLowerCase())}` : "Finished"}
                        {isPickup && ` · ${progressText(lines)}`}
                    </p>
                </div>
            </div>

            {isPickup && (
                <>
                    <div className="flex flex-col gap-3 rounded-xl bg-brand-primary_alt p-4 ring-1 ring-brand ring-inset">
                        <div className="flex items-start gap-3">
                            <Truck01 className="mt-0.5 size-5 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                            <div className="flex flex-col gap-1">
                                <p className="text-md font-semibold text-primary">
                                    {isAssignee ? "Hand the items to the front desk to receive" : "The items still need to be received at the front desk"}
                                </p>
                                <p className="text-sm text-secondary">{STOCK_NOTE}</p>
                            </div>
                        </div>
                        <Button color="primary" size="md" href={ROUTES.receive} iconTrailing={ArrowRight} className="min-h-11 self-start max-sm:w-full">
                            Go to receiving
                        </Button>
                    </div>

                    {justFinished && isAssignee && (
                        <p role="status" className="flex items-start gap-1.5 text-sm text-secondary">
                            <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                            <span>{willNotify(askerName)}</span>
                        </p>
                    )}

                    <Shortfalls lines={lines} />

                    <dl className="flex flex-col gap-3.5">
                        <Fact icon={CurrencyDollar} label="Amount paid">
                            {task.amountPaid !== undefined ? (
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold">{money(task.amountPaid)}</span>
                                    {task.paidWith && <span className="text-tertiary">{paidText(task.paidWith)}</span>}
                                    {task.isSample && !justFinished && <SampleBadge />}
                                </span>
                            ) : (
                                <span className="text-tertiary">Not recorded{task.paidWith ? ` · ${paidText(task.paidWith)}` : ""}</span>
                            )}
                        </Fact>
                    </dl>
                </>
            )}
            {!isPickup && justFinished && (
                <p role="status" className="text-sm text-secondary">
                    {willNotify(askerName)}
                </p>
            )}
        </Card>
    );

    // -------------------------------------------------------------------------------- the assignee's cards

    const acceptCard = (
        <Card className="flex flex-col gap-4">
            <CardHeader
                title={isPickup ? "Can you do this run?" : "Can you do this?"}
                description={
                    isPickup
                        ? `${lines.length} ${lines.length === 1 ? "line" : "lines"} to pick up${task.place ? ` at ${task.place}` : ""}. Accept to see the list to tick off.`
                        : "Accept to let them know you are on it."
                }
            />
            {isPickup && lines.length > 0 && (
                <ul className="divide-y divide-secondary rounded-lg ring-1 ring-secondary ring-inset">
                    {lines.slice(0, 4).map((l, i) => (
                        <li key={`${l.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="min-w-0 text-sm text-secondary">{l.name}</span>
                            <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">× {l.qty}</span>
                        </li>
                    ))}
                    {lines.length > 4 && <li className="px-3 py-2 text-sm text-tertiary">and {lines.length - 4} more</li>}
                </ul>
            )}
            {declining ? (
                <div className="flex flex-col gap-3">
                    <TextArea
                        label="Why can't you do it?"
                        isRequired
                        rows={3}
                        value={reason}
                        onChange={setReason}
                        isInvalid={declineTried && reason.trim().length < 3}
                        placeholder="For example: I am not in on Tuesday"
                        hint={declineTried && reason.trim().length < 3 ? "Give a short reason." : `${askerName} sees this and can ask someone else.`}
                    />
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Button color="secondary" size="md" className="min-h-11" onClick={() => setDeclining(false)}>
                            Back
                        </Button>
                        <Button color="primary-destructive" size="md" className="min-h-11" onClick={decline}>
                            Decline and tell {askerName.split(" ")[0]}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Button color="primary" size="lg" className="min-h-12 flex-1" iconLeading={Check} onClick={accept}>
                        Accept
                    </Button>
                    <Button color="secondary" size="lg" className="min-h-12 flex-1" onClick={() => setDeclining(true)}>
                        I can&apos;t do this
                    </Button>
                </div>
            )}
        </Card>
    );

    const pickCard = (
        <Card padded={false} className="overflow-hidden">
            <div className="flex flex-col gap-3 p-4 lg:p-5">
                <CardHeader title="Pick list" description="Tick each line as it goes in the trolley. Change the number if you got fewer." />
                <div className="flex flex-col gap-1.5">
                    <ProgressBar lines={lines} />
                    <p data-testid="pick-progress" aria-live="polite" className="text-sm font-semibold text-secondary">
                        {progressText(lines)}
                        {progress.left > 0 && <span className="font-normal text-tertiary"> · {progress.left} to go</span>}
                    </p>
                </div>
                <Notice>{STOCK_NOTE}</Notice>
            </div>
            <ul className="divide-y divide-secondary border-t border-secondary">
                {lines.map((l, i) => (
                    <PickLine key={`${l.name}-${i}`} line={l} onChange={(next) => setLine(i, next)} />
                ))}
            </ul>
        </Card>
    );

    const finishCard = (
        <Card className="flex flex-col gap-5">
            <div data-testid="finish-step">
                <CardHeader title="Finish the run" description={`${progressText(lines)}. Check this before you leave the store.`} />
            </div>
            <Shortfalls lines={lines} />

            <div className="flex flex-col gap-3">
                <Input
                    label="Amount paid"
                    size="md"
                    icon={CurrencyDollar}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(v) => setAmount(v.replace(/[^0-9.]/g, ""))}
                    isInvalid={!amountOk}
                    hint={amountOk ? "Optional. The total on the receipt, in dollars." : "Enter an amount like 86.40."}
                    inputClassName="min-h-11"
                />
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-secondary">How it was paid (optional)</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="How it was paid">
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
                                    {PAID_LABEL[option]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-dashed border-primary px-3 py-3">
                <Camera01 className="mt-0.5 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-secondary">
                        Add receipt photo
                        <Badge type="color" color="gray" size="sm">
                            Planned
                        </Badge>
                    </p>
                    <p className="text-sm text-tertiary">Not built yet. For now, hand the paper receipt in with the items.</p>
                </div>
            </div>

            <Notice>{STOCK_NOTE}</Notice>

            <div className="hidden flex-col-reverse gap-3 sm:flex-row sm:justify-end lg:flex">
                <Button color="secondary" size="md" onClick={() => setStep("pick")}>
                    Back to the list
                </Button>
                <Button color="primary" size="md" iconLeading={CheckCircle} isDisabled={!amountOk} onClick={finish}>
                    Mark run as done
                </Button>
            </div>
        </Card>
    );

    const simpleDoCard = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="When it is done" description={`Mark it done and ${askerName} is told.`} />
            <Button color="primary" size="lg" className="min-h-12 self-start max-sm:w-full" iconLeading={CheckCircle} onClick={markDone}>
                Mark as done
            </Button>
        </Card>
    );

    const recordCard = record && (
        <Card padded={false} className="overflow-hidden">
            <div className="p-4 pb-2 lg:p-5 lg:pb-2">
                <CardHeader title="Linked record" />
            </div>
            <a
                href={record.href}
                className="flex min-h-11 items-center gap-3 px-4 py-3 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2 lg:px-5"
            >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-xs font-medium text-tertiary">{record.label}</span>
                    <span className="text-sm font-semibold text-primary">{record.title}</span>
                    <span className="text-sm text-tertiary">{record.detail}</span>
                </div>
                <ArrowRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
            </a>
        </Card>
    );

    const closedNotice =
        task.status === "declined" ? (
            <Notice tone="warning">
                <span className="font-semibold">{isAssignee ? "You said you can't do this." : `${assignee?.name ?? "They"} can't do this.`}</span>
                {reason.trim() ? ` Reason given: ${reason.trim()}` : ""}
                {canManage ? " Reassign it to someone else, or cancel it." : ""}
            </Notice>
        ) : task.status === "cancelled" ? (
            <Notice tone="warning">
                <span className="font-semibold">This {isPickup ? "run" : "task"} was cancelled.</span> Nothing more needs doing.
            </Notice>
        ) : null;

    // -------------------------------------------------------------------------------- the asker's cards

    const others = users.filter((u) => u.locations.includes(task.locationId) && u.id !== task.assigneeId);
    const progressCard = isPickup && (
        <Card padded={false} className="overflow-hidden">
            <div className="flex flex-col gap-3 p-4 lg:p-5">
                <CardHeader
                    title="Progress"
                    description={
                        task.status === "assigned"
                            ? `${assignee?.name ?? "They"} has not accepted yet.`
                            : `${assignee?.name ?? "They"} ticks these off in the store. You see it as it happens.`
                    }
                />
                <div className="flex flex-col gap-1.5">
                    <ProgressBar lines={lines} />
                    <p data-testid="pick-progress" className="text-sm font-semibold text-secondary">
                        {progressText(lines)}
                        {progress.left > 0 && <span className="font-normal text-tertiary"> · {progress.left} to go</span>}
                    </p>
                </div>
            </div>
            <div className="border-t border-secondary">
                <ReadOnlyLines lines={lines} />
            </div>
        </Card>
    );

    const manageCard = canManage && (open || task.status === "declined") && (
        <Card className="flex flex-col gap-4">
            <CardHeader title={isPickup ? "Manage this run" : "Manage this task"} />
            {open && (
                <div className="flex flex-col gap-1.5">
                    <Button color="secondary" size="md" className="min-h-11" iconLeading={BellRinging01} isDisabled={reminded} onClick={remind}>
                        {reminded ? "Reminder noted" : "Send a reminder"}
                    </Button>
                    <p className="text-xs text-tertiary">A nudge to {assignee?.name ?? "the person going"}, in the app.</p>
                </div>
            )}
            <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                <NativeSelect
                    label="Reassign to"
                    size="md"
                    selectClassName="min-h-11"
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    options={[{ label: "Choose a person", value: "" }, ...others.map((u) => ({ label: `${u.name} (${ROLE_LABEL[u.role]})`, value: u.id }))]}
                />
                <Button color="secondary" size="md" className="min-h-11" isDisabled={!reassignTo} onClick={reassign}>
                    Reassign
                </Button>
                {isPickup && progress.picked + progress.short > 0 && <p className="text-xs text-tertiary">What has been ticked so far stays on the list.</p>}
            </div>
            <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                {confirmCancel ? (
                    <>
                        <p className="text-sm text-secondary">
                            Cancel this {isPickup ? "run" : "task"}? {assignee?.name ?? "They"} will be told not to go. The order itself is not changed.
                        </p>
                        <div className="flex gap-2">
                            <Button color="secondary" size="md" className="min-h-11 flex-1" onClick={() => setConfirmCancel(false)}>
                                Keep it
                            </Button>
                            <Button color="primary-destructive" size="md" className="min-h-11 flex-1" onClick={cancel}>
                                Yes, cancel
                            </Button>
                        </div>
                    </>
                ) : (
                    <Button color="secondary-destructive" size="md" className="min-h-11" iconLeading={XCircle} onClick={() => setConfirmCancel(true)}>
                        Cancel this {isPickup ? "run" : "task"}
                    </Button>
                )}
            </div>
        </Card>
    );

    // -------------------------------------------------------------------------------- which main card

    const picking = isAssignee && isPickup && (task.status === "accepted" || task.status === "in-progress");
    let main: ReactNode;
    if (task.status === "done") main = doneCard;
    else if (isAssignee && task.status === "assigned") main = acceptCard;
    else if (picking) main = step === "finish" ? finishCard : pickCard;
    else if (isAssignee && !isPickup && open) main = simpleDoCard;
    else main = progressCard || null;

    const notesCard = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="Notes" description="Questions and answers about this task. Type @ to bring someone in." />
            <NoteThread subject={{ type: "task", id: task.id }} subjectTitle={task.title} href={ROUTES.task(task.id)} user={user} location={task.locationId} />
        </Card>
    );

    return (
        <AppShell activeUrl={ROUTES.tasks} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    eyebrow={
                        <a
                            href={ROUTES.tasks}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2 lg:min-h-0"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Tasks
                        </a>
                    }
                    title={task.title}
                    description={`${type.label} · ${locationName(task.locationId)}`}
                />

                {/* One column on a phone, ordered for the person standing in the store: the facts, the work, then
                    managing and notes. On desktop the facts and managing sit in a side column. */}
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
                    <aside className="contents lg:sticky lg:top-6 lg:order-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                        <div className="order-1 lg:order-none">{summary}</div>
                        {manageCard && <div className="order-3 lg:order-none">{manageCard}</div>}
                        {recordCard && <div className="order-1 lg:order-none">{recordCard}</div>}
                    </aside>

                    <div className="contents lg:order-1 lg:col-span-2 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
                        {message && (
                            <p
                                role="status"
                                data-testid="task-message"
                                className="order-2 flex items-start gap-1.5 text-sm font-medium text-success-primary lg:order-none"
                            >
                                <CheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                <span>{message}</span>
                            </p>
                        )}
                        {closedNotice && <div className="order-2 lg:order-none">{closedNotice}</div>}
                        {main && <div className="order-2 min-w-0 lg:order-none">{main}</div>}
                        {/* Someone watching a finished run still sees what was and was not picked. */}
                        {task.status === "done" && isPickup && !isAssignee && progressCard && <div className="order-2 lg:order-none">{progressCard}</div>}
                        <div className="order-4 min-w-0 lg:order-none">{notesCard}</div>

                        {picking && (
                            <div
                                className={cx(
                                    "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 order-5 -mx-1 flex items-center gap-3 rounded-xl bg-primary/95 p-2 shadow-lg ring-1 ring-secondary backdrop-blur lg:bottom-4 lg:order-none lg:mx-0",
                                    step === "finish" && "lg:hidden",
                                )}
                            >
                                {step === "pick" ? (
                                    <>
                                        <p className="min-w-0 flex-1 pl-2 text-sm font-semibold text-secondary">
                                            {progressText(lines)}
                                            {progress.left > 0 && <span className="block text-xs font-normal text-tertiary">{progress.left} to go</span>}
                                        </p>
                                        <Button
                                            color="primary"
                                            size="lg"
                                            className="min-h-12 shrink-0 px-6"
                                            iconTrailing={ArrowRight}
                                            onClick={() => setStep("finish")}
                                        >
                                            Finish run
                                        </Button>
                                    </>
                                ) : (
                                    <div className="flex flex-1 gap-2 lg:hidden">
                                        <Button color="secondary" size="lg" className="min-h-12 flex-1" onClick={() => setStep("pick")}>
                                            Back
                                        </Button>
                                        <Button
                                            color="primary"
                                            size="lg"
                                            className="min-h-12 flex-[2]"
                                            iconLeading={CheckCircle}
                                            isDisabled={!amountOk}
                                            onClick={finish}
                                        >
                                            Mark run as done
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <SampleDataNote>
                    This task, its notes and the names on it are sample values
                    {task.amountPaid !== undefined && task.isSample ? ", including the amount paid" : ""}. Nothing is emailed or pushed from the prototype, and
                    nothing here changes stock.
                </SampleDataNote>
            </PageContent>
        </AppShell>
    );
};
