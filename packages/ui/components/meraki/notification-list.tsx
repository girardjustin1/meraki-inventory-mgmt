"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import { AtSign, CalendarCheck01, CheckCircle, CheckVerified01, ClipboardCheck, Flag01, RefreshCcw01, Truck01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { initials } from "@/components/meraki/app-shell";
import { relativeTime } from "@/components/meraki/note-body";
import { TODAY, userById } from "@/data/inventory";
import type { AppNotification, NotificationType } from "@/data/types";
import { cx } from "@/utils/cx";

type Tone = "brand" | "error" | "warning" | "success" | "gray";

const TONE: Record<Tone, string> = {
    brand: "bg-brand-secondary text-fg-brand-primary",
    error: "bg-error-secondary text-fg-error-primary",
    warning: "bg-warning-secondary text-fg-warning-primary",
    success: "bg-success-secondary text-fg-success-primary",
    gray: "bg-tertiary text-fg-secondary",
};

/** What each kind of notification is called, and the icon and tone it carries. */
export const NOTIFICATION_TYPE: Record<NotificationType, { label: string; icon: FC<{ className?: string }>; tone: Tone }> = {
    mention: { label: "Mention", icon: AtSign, tone: "brand" },
    "task-assigned": { label: "Assigned to you", icon: ClipboardCheck, tone: "brand" },
    "task-updated": { label: "Task update", icon: RefreshCcw01, tone: "gray" },
    "approval-requested": { label: "Approval requested", icon: CheckVerified01, tone: "warning" },
    "flag-assigned": { label: "Flag assigned", icon: Flag01, tone: "error" },
    "count-due": { label: "Count due", icon: CalendarCheck01, tone: "warning" },
    "delivery-expected": { label: "Delivery expected", icon: Truck01, tone: "gray" },
    "order-approved": { label: "Order approved", icon: CheckCircle, tone: "success" },
};

/** Notifications that ask the person to do something. */
export const ASSIGNED_TYPES: NotificationType[] = ["task-assigned", "flag-assigned", "approval-requested"];

/** Read and unread state for an inbox, held locally in the prototype. */
export const useNotificationState = (initial: AppNotification[]) => {
    const [items, setItems] = useState(() => [...initial].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    const stamp = `${TODAY}T12:00:00Z`;
    return {
        items,
        unread: items.filter((n) => !n.readAt).length,
        toggleRead: (id: string) => setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt ? undefined : stamp } : n))),
        markRead: (id: string) => setItems((prev) => prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: stamp } : n))),
        markAllRead: () => setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: stamp }))),
    };
};

export interface NotificationListProps {
    notifications: AppNotification[];
    /** `compact` fits a popover: one line of preview, tighter rows. `full` is the inbox screen. */
    variant?: "compact" | "full";
    /** The dot at the end of a row: marks it read, or unread again. */
    onToggleRead?: (id: string) => void;
    /** A row was opened. Use it to mark the notification read. */
    onOpen?: (id: string) => void;
    /** Shown when there is nothing to list. */
    empty?: ReactNode;
    className?: string;
}

/** A person's notifications, newest first, grouped into Today and Earlier. */
export const NotificationList = ({ notifications, variant = "full", onToggleRead, onOpen, empty, className }: NotificationListProps) => {
    const compact = variant === "compact";
    const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const groups = [
        { label: "Today", items: sorted.filter((n) => n.createdAt.slice(0, 10) >= TODAY) },
        { label: "Earlier", items: sorted.filter((n) => n.createdAt.slice(0, 10) < TODAY) },
    ].filter((g) => g.items.length > 0);

    if (sorted.length === 0) return <div className={className}>{empty ?? <p className="px-4 py-6 text-center text-sm text-tertiary">Nothing here.</p>}</div>;

    return (
        <div className={cx("flex flex-col", className)}>
            {groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                    <h3 className={cx("bg-secondary_alt text-xs font-semibold text-tertiary", compact ? "px-3 py-1.5" : "px-4 py-2 lg:px-5")}>{group.label}</h3>
                    <ul className="divide-y divide-secondary">
                        {group.items.map((n) => {
                            const meta = NOTIFICATION_TYPE[n.type];
                            const actor = userById(n.actorId);
                            const unread = !n.readAt;
                            return (
                                <li key={n.id} data-unread={unread || undefined} className={cx("flex items-stretch", unread && "bg-brand-primary_alt/50")}>
                                    <a
                                        href={n.href}
                                        onClick={() => onOpen?.(n.id)}
                                        className={cx(
                                            "flex min-w-0 flex-1 items-start gap-3 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2",
                                            compact ? "py-2.5 pl-3" : "py-3 pl-4 lg:pl-5",
                                        )}
                                    >
                                        <span className="relative mt-0.5 shrink-0">
                                            {actor ? (
                                                <>
                                                    <Avatar size={compact ? "sm" : "md"} initials={initials(actor.name)} />
                                                    <span
                                                        className={cx(
                                                            "absolute flex items-center justify-center rounded-full ring-2 ring-bg-primary",
                                                            compact ? "-right-1.5 -bottom-1.5 size-4" : "-right-1.5 -bottom-1.5 size-5",
                                                            TONE[meta.tone],
                                                        )}
                                                    >
                                                        <meta.icon className={compact ? "size-2.5" : "size-3"} aria-hidden="true" />
                                                    </span>
                                                </>
                                            ) : (
                                                <span
                                                    className={cx(
                                                        "flex items-center justify-center rounded-full",
                                                        compact ? "size-8" : "size-10",
                                                        TONE[meta.tone],
                                                    )}
                                                >
                                                    <meta.icon className={compact ? "size-4" : "size-5"} aria-hidden="true" />
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <span className={cx("text-sm", unread ? "font-semibold text-primary" : "font-medium text-secondary")}>
                                                <span className="sr-only">{unread ? "Unread. " : ""}</span>
                                                {n.title}
                                            </span>
                                            {n.body && <span className={cx("text-sm text-tertiary", compact ? "line-clamp-1" : "line-clamp-2")}>{n.body}</span>}
                                            <span className="text-xs text-quaternary">
                                                {relativeTime(n.createdAt, group.label === "Today")}
                                                {!compact && ` · ${meta.label}`}
                                                {!compact && n.emailed && " · Also by email"}
                                            </span>
                                        </span>
                                    </a>
                                    {onToggleRead && (
                                        <button
                                            type="button"
                                            aria-label={`${unread ? "Mark as read" : "Mark as unread"}: ${n.title}`}
                                            title={unread ? "Mark as read" : "Mark as unread"}
                                            onClick={() => onToggleRead(n.id)}
                                            className={cx(
                                                "group flex min-h-11 w-11 shrink-0 cursor-pointer items-center justify-center outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2",
                                                !compact && "lg:w-12",
                                            )}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={cx(
                                                    "size-2.5 rounded-full transition duration-100 ease-linear",
                                                    unread
                                                        ? "bg-fg-brand-primary"
                                                        : "ring-[1.5px] ring-fg-quaternary ring-inset group-hover:ring-fg-quaternary_hover",
                                                )}
                                            />
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
    );
};
