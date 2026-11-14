"use client";

import type { FC } from "react";
import { useState } from "react";
import {
    BarChartSquare02,
    Bell01,
    CheckSquare,
    ChevronRight,
    ClipboardCheck,
    Flag01,
    LineChartUp01,
    Lock01,
    LogOut01,
    Mail01,
    ReceiptCheck,
    Settings01,
    Truck01,
    Users01,
} from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { AccessBadge } from "@/components/meraki/access-badge";
import { AppShell, PageContent, ROUTES, initials } from "@/components/meraki/app-shell";
import { RoleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, locations, notificationsForUser, summary, tasksFor } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { can, isAdmin } from "@/engine/permissions";
import { cx } from "@/utils/cx";

interface Row {
    label: string;
    hint: string;
    href: string;
    icon: FC<{ className?: string }>;
    badge?: { text: string; color: "gray" | "error" | "warning" };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Rows with these labels, in the order given. */
const pick = (rows: Row[], labels: string[]) => labels.map((l) => rows.find((r) => r.label === l)).filter((r): r is Row => Boolean(r));

const rowClass =
    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2";

const IconTile = ({ icon: Icon, tone = "brand" }: { icon: FC<{ className?: string }>; tone?: "brand" | "gray" | "error" }) => (
    <span
        className={cx(
            "flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            tone === "brand" && "bg-brand-50 text-fg-brand-primary ring-brand_alt",
            tone === "gray" && "bg-secondary text-fg-quaternary ring-secondary",
            tone === "error" && "bg-error-primary text-fg-error-primary ring-error_subtle",
        )}
    >
        <Icon className="size-5" aria-hidden="true" />
    </span>
);

const Group = ({ title, rows }: { title: string; rows: Row[] }) => (
    <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-semibold text-tertiary">{title}</h2>
        <ul className="divide-y divide-border-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
            {rows.map((row) => (
                <li key={row.href}>
                    <a href={row.href} className={rowClass}>
                        <IconTile icon={row.icon} />
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-md font-semibold text-primary">{row.label}</span>
                            <span className="truncate text-sm text-tertiary">{row.hint}</span>
                        </span>
                        {row.badge && (
                            <Badge type="pill-color" color={row.badge.color} size="md">
                                {row.badge.text}
                            </Badge>
                        )}
                        <ChevronRight className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                    </a>
                </li>
            ))}
        </ul>
    </section>
);

export interface MoreScreenProps {
    location?: LocationId;
    user?: User;
    /** Lock the app and show the PIN screen. */
    onLock?: () => void;
    onSignOut?: () => void;
}

/**
 * The phone's "More" tab: everything that is not one of the four main tabs, grouped by what
 * the person is trying to do, with the same counts the desktop sidebar shows.
 */
export const MoreScreen = ({ location: initialLocation = "lynnfield", user = CURRENT_USER, onLock, onSignOut }: MoreScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [notice, setNotice] = useState<string>();
    const s = summary(location);
    const admin = isAdmin(user);
    const canManageTeam = can(user, "team.manage");
    const scope = admin
        ? "Every location"
        : user.locations.length === locations.length
          ? "Both locations"
          : user.locations.map((id) => locations.find((l) => l.id === id)?.shortName ?? id).join(", ");

    const openTasks = tasksFor(user.id).filter((x) => x.status === "assigned" || x.status === "accepted" || x.status === "in-progress").length;
    const unread = notificationsForUser(user.id).filter((n) => !n.readAt).length;
    // Rows the person has no permission for are left out, the same as in the desktop sidebar.
    const allWork: (Row & { needs?: Parameters<typeof can>[1] })[] = [
        {
            label: "Notifications",
            hint: unread ? `${unread} unread` : "Mentions, tasks and alerts for you",
            href: ROUTES.notifications,
            icon: Bell01,
            badge: unread ? { text: String(unread), color: "error" } : undefined,
        },
        {
            label: "Tasks",
            hint: openTasks ? `${plural(openTasks, "task")} assigned to you` : "Pickup runs and things you were asked to do",
            href: ROUTES.tasks,
            icon: CheckSquare,
            badge: openTasks ? { text: String(openTasks), color: "gray" } : undefined,
        },
        {
            needs: "stock.count",
            label: "Counts",
            hint: s.countsDue ? `${plural(s.countsDue, "count")} due in the next 3 days` : "Nothing due in the next 3 days",
            href: ROUTES.counts,
            icon: ClipboardCheck,
            badge: s.countsDue ? { text: String(s.countsDue), color: "gray" } : undefined,
        },
        {
            needs: "orders.receive",
            label: "Receive",
            hint: s.openOrders ? `${plural(s.openOrderLines, "line")} still to receive on ${plural(s.openOrders, "order")}` : "No deliveries waiting",
            href: ROUTES.receive,
            icon: Truck01,
            badge: s.openOrders ? { text: String(s.openOrders), color: "gray" } : undefined,
        },
        {
            needs: "flags.view",
            label: "Flags",
            hint: s.openFlags ? `${s.openFlags} open, ${s.highFlags} high severity` : "Nothing to review",
            href: ROUTES.flags,
            icon: Flag01,
            badge: s.openFlags ? { text: String(s.openFlags), color: s.highFlags ? "error" : "gray" } : undefined,
        },
    ];
    const work: Row[] = allWork.filter((r) => !r.needs || can(user, r.needs));
    const insight: Row[] = [
        ...(can(user, "reports.view")
            ? [
                  { label: "Insights", hint: "Forecasts by product and colour, and what to plan for", href: ROUTES.insights, icon: LineChartUp01 },
                  { label: "Reports", hint: "Usage, vendors and what the numbers say", href: ROUTES.reports, icon: BarChartSquare02 },
              ]
            : []),
        ...(can(user, "digests.view") ? [{ label: "Digests", hint: "The weekly and monthly email", href: ROUTES.digest, icon: Mail01 }] : []),
        ...(can(user, "activity.view") ? [{ label: "Activity", hint: "Who did what, and when", href: ROUTES.activity, icon: ReceiptCheck }] : []),
    ];
    // Team is open to everyone, read-only for users. Settings is for people who can change it.
    const adminRows: Row[] = [
        {
            label: "Team",
            hint: canManageTeam ? "People, invites, roles and PINs" : "Who you work with and what each role can do",
            href: ROUTES.team,
            icon: Users01,
        },
        ...(can(user, "settings.manage")
            ? [{ label: "Settings", hint: "Alerts, flag rules, vendors and security", href: ROUTES.settings, icon: Settings01 }]
            : []),
    ];

    return (
        <AppShell activeUrl={ROUTES.more} location={location} onLocationChange={setLocation} user={user}>
            <PageContent className="max-w-xl gap-5 lg:gap-6">
                <h1 className="sr-only">More</h1>

                <section aria-label="Signed in as" className="flex items-center gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary">
                    <Avatar size="xl" initials={initials(user.name)} />
                    <div className="flex min-w-0 flex-col gap-1">
                        <p className="truncate text-lg font-semibold text-primary">{user.name}</p>
                        <p className="truncate text-sm text-tertiary">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <RoleBadge role={user.role} />
                            <AccessBadge access={admin ? "admin" : "user"} />
                            <span className="text-sm text-tertiary">{scope}</span>
                        </div>
                    </div>
                </section>

                {/* Same groups as the desktop sidebar, so people find things in the same place on both. */}
                <Group title="For you" rows={pick(work, ["Notifications", "Tasks"])} />
                {pick(work, ["Counts"]).length > 0 && <Group title="Inventory" rows={pick(work, ["Counts"])} />}
                {pick(work, ["Receive"]).length > 0 && <Group title="Purchasing" rows={pick(work, ["Receive"])} />}
                {[...pick(work, ["Flags"]), ...pick(insight, ["Activity"])].length > 0 && (
                    <Group title="Review" rows={[...pick(work, ["Flags"]), ...pick(insight, ["Activity"])]} />
                )}
                {pick(insight, ["Insights", "Reports", "Digests"]).length > 0 && <Group title="Insights" rows={pick(insight, ["Insights", "Reports", "Digests"])} />}
                <Group title={admin ? "Admin" : "Your team"} rows={adminRows} />

                <section aria-label="Session" className="flex flex-col gap-2">
                    <ul className="divide-y divide-border-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
                        <li>
                            <button
                                type="button"
                                className={rowClass}
                                onClick={() => (onLock ? onLock() : setNotice("In the live app this locks the device straight away and shows the PIN screen."))}
                            >
                                <IconTile icon={Lock01} tone="gray" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="text-md font-semibold text-primary">Lock now</span>
                                    <span className="truncate text-sm text-tertiary">Hand the device over safely</span>
                                </span>
                            </button>
                        </li>
                        <li>
                            <button
                                type="button"
                                className={rowClass}
                                onClick={() =>
                                    onSignOut
                                        ? onSignOut()
                                        : setNotice(
                                              "In the live app this signs you out of Google on this device. The next person signs in with their own account.",
                                          )
                                }
                            >
                                <IconTile icon={LogOut01} tone="error" />
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="text-md font-semibold text-error-primary">Sign out</span>
                                    <span className="truncate text-sm text-tertiary">{user.email}</span>
                                </span>
                            </button>
                        </li>
                    </ul>
                    {notice && (
                        <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-xs text-tertiary ring-1 ring-secondary ring-inset">
                            <span className="font-semibold text-secondary">Prototype. </span>
                            {notice}
                        </p>
                    )}
                </section>

                <p className="text-center text-xs text-quaternary">Meraki inventory · prototype build</p>
            </PageContent>
        </AppShell>
    );
};
