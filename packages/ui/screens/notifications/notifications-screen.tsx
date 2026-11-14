"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import { AtSign, Bell01, CheckDone01, ClipboardCheck, Inbox01, Mail01, Phone01, Settings01 } from "@untitledui/icons";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ASSIGNED_TYPES, NotificationList, useNotificationState } from "@/components/meraki/notification-list";
import { CURRENT_USER, notificationsForUser } from "@/data/inventory";
import type { AppNotification, LocationId, User } from "@/data/types";

export type NotificationFilter = "all" | "unread" | "mentions" | "assigned";

const FILTERS: { id: NotificationFilter; label: string; match: (n: AppNotification) => boolean }[] = [
    { id: "all", label: "All", match: () => true },
    { id: "unread", label: "Unread", match: (n) => !n.readAt },
    { id: "mentions", label: "Mentions", match: (n) => n.type === "mention" },
    { id: "assigned", label: "Assigned to me", match: (n) => ASSIGNED_TYPES.includes(n.type) },
];

const EMPTY: Record<NotificationFilter, { icon: FC<{ className?: string }>; title: string; text: string }> = {
    all: { icon: Inbox01, title: "No notifications yet", text: "When someone mentions you in a note or asks you to do something, it shows up here." },
    unread: { icon: CheckDone01, title: "You are all caught up", text: "Nothing unread. Read notifications stay under All." },
    mentions: {
        icon: AtSign,
        title: "Nobody has mentioned you",
        text: "People mention you by typing @ and your name in a note on a flag, an order or a task.",
    },
    assigned: {
        icon: ClipboardCheck,
        title: "Nothing is assigned to you",
        text: "Pickup runs, counts to review, flags and approvals that are yours to act on are listed here.",
    },
};

const EmptyState = ({ filter }: { filter: NotificationFilter }) => {
    const { icon: Icon, title, text } = EMPTY[filter];
    return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-fg-quaternary ring-1 ring-secondary ring-inset">
                <Icon className="size-6" aria-hidden="true" />
            </span>
            <div className="flex max-w-sm flex-col gap-1">
                <p className="text-md font-semibold text-primary">{title}</p>
                <p className="text-sm text-tertiary">{text}</p>
            </div>
        </div>
    );
};

const TabLabel = ({ label, count }: { label: string; count: number }) => (
    <>
        {label}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular-nums ring-1 ring-secondary ring-inset">{count}</span>
    </>
);

const Channel = ({ icon: Icon, title, children, status }: { icon: FC<{ className?: string }>; title: string; children: ReactNode; status: string }) => (
    <li className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-fg-secondary ring-1 ring-secondary ring-inset">
            <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-primary">
                {title}
                <span className="text-xs font-medium text-tertiary">{status}</span>
            </p>
            <p className="text-sm text-tertiary">{children}</p>
        </div>
    </li>
);

interface NotificationsScreenProps {
    location?: LocationId;
    user?: User;
    /** Which tab is open first. */
    initialFilter?: NotificationFilter;
}

/** A person's inbox: mentions, things assigned to them and reminders. */
export const NotificationsScreen = ({ location: initialLocation = "lynnfield", user = CURRENT_USER, initialFilter = "all" }: NotificationsScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
    const [message, setMessage] = useState<string | null>(null);
    const inbox = useNotificationState(notificationsForUser(user.id));

    const active = FILTERS.find((f) => f.id === filter) ?? (FILTERS[0] as (typeof FILTERS)[number]);
    const visible = inbox.items.filter(active.match);
    const markAll = () => {
        setMessage(`${inbox.unread} ${inbox.unread === 1 ? "notification" : "notifications"} marked as read.`);
        inbox.markAllRead();
    };

    const how = (
        <Card className="flex flex-col gap-4">
            <CardHeader title="How notifications reach you" />
            <ul className="flex flex-col gap-4">
                <Channel icon={Bell01} title="In the app" status="Always on">
                    Every notification lands here and on the bell. You cannot miss one by turning email off.
                </Channel>
                <Channel icon={Mail01} title="By email" status="Your choice">
                    Sent as well for the types you choose in Settings. Rows that say &ldquo;Also by email&rdquo; are those.
                </Channel>
                <Channel icon={Phone01} title="On your phone" status="Planned, not built">
                    Push notifications need the app added to your Home Screen first. That part is planned and is not in the prototype.
                </Channel>
            </ul>
            <Button color="secondary" size="md" href={ROUTES.settings} iconLeading={Settings01} className="self-start max-lg:w-full">
                Notification settings
            </Button>
        </Card>
    );

    return (
        <AppShell activeUrl={ROUTES.notifications} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Your <em>notifications</em>
                        </>
                    }
                    description={inbox.unread > 0 ? `${inbox.unread} unread. Mentions, things assigned to you and reminders.` : "Nothing unread."}
                    actions={
                        <>
                            <Button
                                color="secondary"
                                size="md"
                                iconLeading={CheckDone01}
                                isDisabled={inbox.unread === 0}
                                onClick={markAll}
                                className="max-lg:flex-1"
                            >
                                Mark all read
                            </Button>
                            <Button color="tertiary" size="md" href={ROUTES.settings} iconLeading={Settings01} className="max-lg:hidden">
                                Settings
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
                    <Tabs selectedKey={filter} onSelectionChange={(key) => setFilter(key as NotificationFilter)} className="min-w-0 gap-4 lg:col-span-2">
                        <Tabs.List type="underline" size="md" aria-label="Filter notifications" className="overflow-x-auto">
                            {FILTERS.map((f) => (
                                <Tabs.Item key={f.id} id={f.id}>
                                    <TabLabel label={f.label} count={inbox.items.filter(f.match).length} />
                                </Tabs.Item>
                            ))}
                        </Tabs.List>

                        {message && (
                            <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                                <CheckDone01 className="size-4" aria-hidden="true" />
                                {message}
                            </p>
                        )}

                        <Tabs.Panel id={filter}>
                            <Card padded={false} className="overflow-hidden">
                                <NotificationList
                                    notifications={visible}
                                    onToggleRead={(id) => {
                                        setMessage(null);
                                        inbox.toggleRead(id);
                                    }}
                                    onOpen={inbox.markRead}
                                    empty={<EmptyState filter={filter} />}
                                />
                            </Card>
                        </Tabs.Panel>
                    </Tabs>

                    <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">{how}</aside>
                </div>

                <SampleDataNote>
                    These notifications are sample entries with fictional names. Nothing is emailed or pushed from the prototype: it shows where each
                    notification would appear.
                </SampleDataNote>
            </PageContent>
        </AppShell>
    );
};
