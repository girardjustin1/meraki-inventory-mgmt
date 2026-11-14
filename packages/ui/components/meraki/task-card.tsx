import type { FC } from "react";
import { CheckDone01, ChevronRight, ClipboardCheck, Clock, Eye, MarkerPin01, ShoppingBag01, Truck01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { BadgeWithDot } from "@/components/base/badges/badges";
import { ROUTES, initials } from "@/components/meraki/app-shell";
import { NoteBody, relativeTime } from "@/components/meraki/note-body";
import { SampleBadge } from "@/components/meraki/status-badges";
import { TODAY, userById } from "@/data/inventory";
import type { PickupLine, Task, TaskStatus, TaskType, User } from "@/data/types";
import { daysBetween, formatDate, formatTime } from "@/engine/dates";
import { isAdmin } from "@/engine/permissions";
import { cx } from "@/utils/cx";

export const TASK_TYPE: Record<TaskType, { label: string; plural: string; icon: FC<{ className?: string }> }> = {
    "pickup-run": { label: "Pickup run", plural: "Pickup runs", icon: ShoppingBag01 },
    count: { label: "Count", plural: "Counts", icon: ClipboardCheck },
    receive: { label: "Receive a delivery", plural: "Receiving", icon: Truck01 },
    review: { label: "Review", plural: "Reviews", icon: Eye },
    general: { label: "Task", plural: "Other tasks", icon: CheckDone01 },
};

export const TASK_STATUS: Record<TaskStatus, { label: string; color: "gray" | "blue" | "brand" | "success" | "warning" | "error" }> = {
    assigned: { label: "Not started", color: "gray" },
    accepted: { label: "Accepted", color: "blue" },
    "in-progress": { label: "In progress", color: "brand" },
    done: { label: "Done", color: "success" },
    declined: { label: "Declined", color: "warning" },
    cancelled: { label: "Cancelled", color: "gray" },
};

export const TaskStatusBadge = ({ status, size = "sm" }: { status: TaskStatus; size?: "sm" | "md" | "lg" }) => (
    <BadgeWithDot type="pill-color" color={TASK_STATUS[status].color} size={size}>
        {TASK_STATUS[status].label}
    </BadgeWithDot>
);

/** Managers and admins hand out tasks and can reassign or cancel them. Everyone else sees only their own. */
export const canAssignTasks = (user: Pick<User, "access" | "role">) => isAdmin(user) || user.role === "manager";

/** Still waiting on someone: not done, declined or cancelled. */
export const isOpenTask = (status: TaskStatus) => status === "assigned" || status === "accepted" || status === "in-progress";

/**
 * Where a pickup run stands.
 * `picked` are lines got in full, `short` are lines ticked with less than was wanted (including none),
 * `left` have not been touched yet.
 */
export const pickupProgress = (lines: PickupLine[] = []) => {
    const picked = lines.filter((l) => l.picked !== undefined && l.picked >= l.qty).length;
    const short = lines.filter((l) => l.picked !== undefined && l.picked < l.qty).length;
    return { total: lines.length, picked, short, left: lines.length - picked - short };
};

/** "3 of 8 picked, 1 short" */
export const progressText = (lines: PickupLine[] = []) => {
    const p = pickupProgress(lines);
    return `${p.picked} of ${p.total} picked${p.short > 0 ? `, ${p.short} short` : ""}`;
};

/** When a task is due, relative to the prototype's TODAY, and whether it is late. */
export const dueInfo = (task: Pick<Task, "dueAt" | "status" | "doneAt">, today: string = TODAY) => {
    if (task.status === "done") return { label: `Done ${relativeTime(task.doneAt ?? task.dueAt).replace(/^[TY]/, (c) => c.toLowerCase())}`, overdue: false };
    const day = task.dueAt.slice(0, 10);
    const time = task.dueAt.length > 10 ? `, ${formatTime(task.dueAt)}` : "";
    const days = daysBetween(today, day);
    const closed = !isOpenTask(task.status);
    if (days < 0) {
        const late = `${-days} ${days === -1 ? "day" : "days"}`;
        return closed ? { label: `Was due ${formatDate(day)}`, overdue: false } : { label: `Overdue by ${late} (was due ${formatDate(day)})`, overdue: true };
    }
    const verb = closed ? "Was due" : "Due";
    if (days === 0) return { label: `${verb} today${time}`, overdue: false };
    if (days === 1) return { label: `${verb} tomorrow${time}`, overdue: false };
    return { label: `${verb} ${formatDate(day)}${time} (in ${days} days)`, overdue: false };
};

export const ProgressBar = ({ lines, className }: { lines: PickupLine[]; className?: string }) => {
    const p = pickupProgress(lines);
    const pct = (n: number) => `${p.total ? (n / p.total) * 100 : 0}%`;
    return (
        <div
            role="progressbar"
            aria-label="Lines dealt with"
            aria-valuemin={0}
            aria-valuemax={p.total}
            aria-valuenow={p.picked + p.short}
            aria-valuetext={progressText(lines)}
            className={cx("flex h-2 w-full overflow-hidden rounded-full bg-quaternary", className)}
        >
            <span className="bg-fg-brand-primary transition-all duration-200" style={{ width: pct(p.picked) }} />
            <span className="bg-fg-warning-secondary transition-all duration-200" style={{ width: pct(p.short) }} />
        </div>
    );
};

export interface TaskCardProps {
    task: Task;
    /** `compact` is one row for lists. `full` adds who asked, where, the note and a progress bar. */
    variant?: "compact" | "full";
    /** Defaults to the task's own page. Pass null for a card that is not a link. */
    href?: string | null;
    /** The person looking. Their own name reads "You". */
    viewerId?: string;
    className?: string;
}

/** One task: what it is, who has it, when it is due and how far along it is. */
export const TaskCard = ({ task, variant = "compact", href, viewerId, className }: TaskCardProps) => {
    const type = TASK_TYPE[task.type];
    const assignee = userById(task.assigneeId);
    const asker = userById(task.createdBy);
    const due = dueInfo(task);
    const full = variant === "full";
    const link = href === null ? undefined : (href ?? ROUTES.task(task.id));
    const name = (id: string, fallback?: string) => (id === viewerId ? "You" : (fallback ?? "Someone who has left"));
    const isPickup = task.type === "pickup-run" && (task.lines?.length ?? 0) > 0;

    const body = (
        <>
            <span
                className={cx(
                    "flex shrink-0 items-center justify-center rounded-lg",
                    full ? "size-10" : "size-9",
                    due.overdue ? "bg-error-secondary text-fg-error-primary" : "bg-brand-secondary text-fg-brand-primary",
                )}
            >
                <type.icon className="size-5" aria-hidden="true" />
            </span>

            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cx("font-semibold text-primary", full ? "text-md" : "text-sm")}>{task.title}</span>
                    <TaskStatusBadge status={task.status} />
                    {task.isSample && <SampleBadge />}
                </span>

                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary">
                    <span className="inline-flex items-center gap-1.5">
                        <Avatar size="xs" initials={initials(assignee?.name ?? "?")} />
                        <span className="text-secondary">{name(task.assigneeId, assignee?.name)}</span>
                    </span>
                    <span className={cx("inline-flex items-center gap-1", due.overdue && "font-semibold text-error-primary")}>
                        <Clock className="size-4 shrink-0" aria-hidden="true" />
                        {due.label}
                    </span>
                    {isPickup && !full && <span>{progressText(task.lines)}</span>}
                </span>

                {full && (
                    <>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary">
                            <span>
                                {type.label} · asked by {name(task.createdBy, asker?.name).replace(/^You$/, "you")}
                            </span>
                            {task.place && (
                                <span className="inline-flex items-center gap-1">
                                    <MarkerPin01 className="size-4 shrink-0" aria-hidden="true" />
                                    {task.place}
                                </span>
                            )}
                        </span>
                        {task.note && <NoteBody body={task.note} viewerId={viewerId} className="line-clamp-2 text-tertiary" />}
                        {isPickup && (
                            <span className="mt-1 flex flex-col gap-1.5">
                                <ProgressBar lines={task.lines ?? []} />
                                <span className="text-xs font-medium text-secondary">{progressText(task.lines)}</span>
                            </span>
                        )}
                    </>
                )}
            </span>

            {link && <ChevronRight className="mt-2 size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />}
        </>
    );

    const classes = cx(
        "flex min-h-14 w-full items-start gap-3 rounded-xl bg-primary text-left shadow-xs ring-1 ring-secondary ring-inset",
        full ? "p-4" : "px-3 py-3",
        due.overdue && "ring-error_subtle",
        className,
    );

    return link ? (
        <a
            href={link}
            data-task={task.id}
            className={cx(
                classes,
                "outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2",
            )}
        >
            {body}
        </a>
    ) : (
        <div data-task={task.id} className={classes}>
            {body}
        </div>
    );
};
