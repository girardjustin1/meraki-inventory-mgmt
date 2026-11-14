"use client";

import { useEffect, useState } from "react";
import type { FC, ReactNode } from "react";
import {
    BarChartSquare02,
    Bell01,
    CheckSquare,
    ClipboardCheck,
    Flag01,
    HomeLine,
    LineChartUp01,
    Mail01,
    Menu01,
    Package,
    QrCode02,
    ReceiptCheck,
    SearchLg,
    Settings01,
    ShoppingCart01,
    Truck01,
    Users01,
} from "@untitledui/icons";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Select } from "@/components/base/select/select";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { CURRENT_USER, ROLE_LABEL, locations, notificationsForUser, summary, tasksFor, users } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { ACCESS_LABEL, can, isAdmin, visibleLocations } from "@/engine/permissions";
import { cx } from "@/utils/cx";
import { useRememberLocation, useUrlSync } from "@/utils/url-sync";
import { useViewer, useViewerSwitch } from "@/utils/viewer";
import { CommandMenu, CommandMenuTrigger } from "./command-menu";
import { LocationSwitcher } from "./location-switcher";

/** Every route in the app. Screens link with these so Storybook and the Next.js app stay in step. */
export const ROUTES = {
    home: "/",
    stock: "/stock",
    item: (id: string) => `/items/${id}`,
    scan: "/scan",
    counts: "/counts",
    count: (id: string) => `/counts/${id}`,
    orders: "/orders",
    order: (id: string) => `/orders/${id}`,
    newOrder: "/orders/new",
    sendOrders: "/orders/send",
    receive: "/receive",
    receiveOrder: (id: string) => `/receive?order=${encodeURIComponent(id)}`,
    flags: "/flags",
    flag: (id: string) => `/flags/${id}`,
    activity: "/activity",
    reports: "/reports",
    digest: "/digest",
    team: "/settings/team",
    settings: "/settings",
    insights: "/insights",
    notifications: "/notifications",
    tasks: "/tasks",
    task: (id: string) => `/tasks/${id}`,
    more: "/more",
    invite: (token: string) => `/invite/${token}`,
    signIn: "/sign-in",
    lock: "/lock",
} as const;

const count = (n: number, color: "gray" | "error" | "warning" = "gray") =>
    n > 0 ? (
        <Badge size="sm" type="pill-color" color={color}>
            {n}
        </Badge>
    ) : undefined;

/**
 * Sidebar navigation for one person, grouped by the job being done. Entries they have no
 * permission for are left out, and a group with nothing in it is dropped.
 */
export const buildNav = (location: LocationId, user: User = CURRENT_USER): (NavItemType | NavItemDividerType)[] => {
    const s = summary(location);
    const openTasks = tasksFor(user.id).filter((t) => t.status === "assigned" || t.status === "accepted" || t.status === "in-progress").length;
    const groups: { label: string; items: (NavItemType | false)[] }[] = [
        {
            label: "Inventory",
            items: [
                { label: "Stock", href: ROUTES.stock, icon: Package, badge: count(s.low + s.out, "warning") },
                can(user, "stock.count") && { label: "Counts", href: ROUTES.counts, icon: ClipboardCheck, badge: count(s.countsDue) },
                { label: "Scan", href: ROUTES.scan, icon: QrCode02 },
            ],
        },
        {
            label: "Purchasing",
            items: [
                can(user, "orders.view") && { label: "Orders", href: ROUTES.orders, icon: ShoppingCart01, badge: count(s.awaitingApproval) },
                can(user, "orders.receive") && { label: "Receive", href: ROUTES.receive, icon: Truck01, badge: count(s.openOrders) },
                { label: "Tasks", href: ROUTES.tasks, icon: CheckSquare, badge: count(openTasks) },
            ],
        },
        {
            label: "Review",
            items: [
                can(user, "flags.view") && { label: "Flags", href: ROUTES.flags, icon: Flag01, badge: count(s.openFlags, s.highFlags ? "error" : "gray") },
                can(user, "activity.view") && { label: "Activity", href: ROUTES.activity, icon: ReceiptCheck },
            ],
        },
        {
            label: "Insights",
            items: [
                can(user, "reports.view") && { label: "Insights", href: ROUTES.insights, icon: LineChartUp01 },
                can(user, "reports.view") && { label: "Reports", href: ROUTES.reports, icon: BarChartSquare02 },
                can(user, "digests.view") && { label: "Digests", href: ROUTES.digest, icon: Mail01 },
            ],
        },
    ];
    const out: (NavItemType | NavItemDividerType)[] = [{ label: "Home", href: ROUTES.home, icon: HomeLine }];
    for (const group of groups) {
        const items = group.items.filter((i): i is NavItemType => Boolean(i));
        if (items.length) out.push({ divider: true, label: group.label }, ...items);
    }
    return out;
};

/** Footer navigation: notifications, team (read-only for users) and, for admins, settings. */
export const buildFooterNav = (user: User = CURRENT_USER): NavItemType[] => {
    const unread = notificationsForUser(user.id).filter((n) => !n.readAt).length;
    return [
        { label: "Notifications", href: ROUTES.notifications, icon: Bell01, badge: count(unread, "error") },
        { label: "Team", href: ROUTES.team, icon: Users01 },
        ...(can(user, "settings.manage") ? [{ label: "Settings", href: ROUTES.settings, icon: Settings01 }] : []),
    ];
};

/** @deprecated Use buildFooterNav(user). Kept for stories that import it. */
export const FOOTER_NAV: NavItemType[] = [
    { label: "Team", href: ROUTES.team, icon: Users01 },
    { label: "Settings", href: ROUTES.settings, icon: Settings01 },
];

interface TabItem {
    label: string;
    href: string;
    icon: FC<{ className?: string }>;
    /** The centre action: larger, brand-coloured. */
    primary?: boolean;
}

/**
 * Mobile bottom tabs. Five labelled tabs with Scan in the centre, per the Mobbin research.
 * Notifications are reached from the bell in the top bar; everything else lives under More.
 */
export const MOBILE_TABS: TabItem[] = [
    { label: "Home", href: ROUTES.home, icon: HomeLine },
    { label: "Stock", href: ROUTES.stock, icon: Package },
    { label: "Scan", href: ROUTES.scan, icon: QrCode02, primary: true },
    { label: "Orders", href: ROUTES.orders, icon: ShoppingCart01 },
    { label: "More", href: ROUTES.more, icon: Menu01 },
];

const isActive = (href: string, activeUrl: string) => (href === "/" ? activeUrl === "/" : activeUrl === href || activeUrl.startsWith(`${href}/`));

export const MobileTabBar = ({ activeUrl, location }: { activeUrl: string; location: LocationId }) => {
    const s = summary(location);
    return (
        <nav
            aria-label="Primary"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-secondary bg-primary/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
            <ul className="mx-auto flex max-w-md items-end justify-between px-2">
                {MOBILE_TABS.map((tab) => {
                    const active = isActive(tab.href, activeUrl);
                    const dot = tab.href === ROUTES.stock ? s.out > 0 : tab.href === ROUTES.orders ? s.awaitingApproval > 0 : false;
                    return (
                        <li key={tab.href} className="flex-1">
                            <a
                                href={tab.href}
                                aria-current={active ? "page" : undefined}
                                className={cx(
                                    "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 pt-2 pb-1.5 text-xs font-medium outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                    active ? "text-brand-secondary" : "text-quaternary hover:text-tertiary",
                                )}
                            >
                                {tab.primary ? (
                                    <span className="-mt-6 flex size-13 items-center justify-center rounded-full bg-brand-400 text-ink shadow-lg ring-4 ring-bg-primary">
                                        <tab.icon className="size-6" aria-hidden="true" />
                                    </span>
                                ) : (
                                    <span className="relative">
                                        <tab.icon className="size-6" aria-hidden="true" />
                                        {dot && <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-error-solid ring-2 ring-bg-primary" />}
                                    </span>
                                )}
                                <span>{tab.label}</span>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
};

interface AppShellProps {
    /** Path of the current screen, used to highlight navigation. */
    activeUrl?: string;
    location?: LocationId;
    onLocationChange?: (location: LocationId) => void;
    /** Defaults to the person using the app (see utils/viewer.tsx). */
    user?: User;
    /** Hide the mobile top bar and tabs for full-screen tasks (scanner, counting, PIN). */
    immersive?: boolean;
    children: ReactNode;
}

/**
 * App frame.
 * Desktop: fixed sidebar with the location switcher, search and the signed-in user.
 * Mobile: slim top bar (logo, location, search, notifications) and a bottom tab bar sized for thumbs.
 * Navigation shows only what the person has permission for. Cmd+K opens the command menu.
 */
export const AppShell = ({ activeUrl = "/", location = "lynnfield", onLocationChange, user: userProp, immersive, children }: AppShellProps) => {
    // A screen can pass the person explicitly (stories do); otherwise it is whoever is using the app.
    const viewer = useViewer();
    const switchViewer = useViewerSwitch();
    const user = userProp ?? viewer;
    const [searchOpen, setSearchOpen] = useState(false);
    const unread = notificationsForUser(user.id).filter((n) => !n.readAt).length;
    const allowed = visibleLocations(
        user,
        locations.map((l) => l.id),
    );

    // Cmd+K / Ctrl+K anywhere, and "/" when not typing, open the command menu.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "k") {
                event.preventDefault();
                setSearchOpen((open) => !open);
                return;
            }
            const target = event.target as HTMLElement | null;
            const typing = target ? target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName) : false;
            if (key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault();
                setSearchOpen(true);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // In the app, the salon being viewed is part of the link and is remembered between pages.
    useUrlSync({ loc: location });
    useRememberLocation(location);

    const switcher = (size: "sm" | "md") =>
        allowed.length > 1 ? <LocationSwitcher value={location} onChange={onLocationChange} size={size} options={allowed} /> : null;

    return (
        <div className="flex min-h-dvh flex-col bg-secondary_alt lg:flex-row">
            <div className="hidden lg:contents">
                <SidebarNavigationSimple
                    logo={
                        <div className="flex flex-col gap-4">
                            <MerakiLogo className="h-7 self-start" />
                            {switcher("sm")}
                        </div>
                    }
                    search={<CommandMenuTrigger onPress={() => setSearchOpen(true)} />}
                    activeUrl={activeUrl}
                    items={buildNav(location, user) as NavItemType[]}
                    footerItems={buildFooterNav(user)}
                    showAccountCard={false}
                    featureCard={
                        <div className="flex flex-col gap-3 border-t border-secondary pt-4">
                            <div className="flex items-center gap-3">
                                <Avatar size="md" initials={initials(user.name)} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-primary">{user.name}</p>
                                    <p className="truncate text-sm text-tertiary">
                                        {ROLE_LABEL[user.role]}
                                        {isAdmin(user) && user.role !== "owner" ? ` · ${ACCESS_LABEL.admin}` : ""}
                                    </p>
                                </div>
                            </div>
                            {/* Prototype only: there is no sign-in yet, so let the reviewer see the app as each sample person. */}
                            {switchViewer && (
                                <Select
                                    aria-label="View the prototype as"
                                    size="sm"
                                    items={users.map((u) => ({
                                        id: u.id,
                                        label: u.name,
                                        supportingText: `${ROLE_LABEL[u.role]}${isAdmin(u) ? ", admin" : ""}`,
                                    }))}
                                    value={user.id}
                                    onChange={(key) => {
                                        if (key) switchViewer(String(key));
                                    }}
                                    hint="Prototype: view as another person"
                                >
                                    {(item) => (
                                        <Select.Item id={item.id} supportingText={item.supportingText}>
                                            {item.label}
                                        </Select.Item>
                                    )}
                                </Select>
                            )}
                        </div>
                    }
                />
            </div>

            {!immersive && (
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-secondary bg-primary/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
                    <MerakiLogo className="h-6 shrink-0" />
                    <div className="flex min-w-0 items-center gap-0.5">
                        {switcher("sm")}
                        <button
                            type="button"
                            onClick={() => setSearchOpen(true)}
                            aria-label="Search products, orders and pages"
                            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                        >
                            <SearchLg className="size-5" aria-hidden="true" />
                        </button>
                        <a
                            href={ROUTES.notifications}
                            aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
                            className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                        >
                            <Bell01 className="size-5" aria-hidden="true" />
                            {unread > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-error-solid ring-2 ring-bg-primary" />}
                        </a>
                    </div>
                </header>
            )}

            <main className={cx("min-w-0 flex-1", !immersive && "pb-24 lg:pb-0")}>{children}</main>

            {!immersive && <MobileTabBar activeUrl={activeUrl} location={location} />}

            <CommandMenu isOpen={searchOpen} onOpenChange={setSearchOpen} location={location} user={user} />
        </div>
    );
};

export const initials = (name: string) =>
    name
        .split(/\s+/)
        .map((p) => p[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();

interface PageHeaderProps {
    /** Plain text, or text with one <em> word for the website's italic serif accent. */
    title: ReactNode;
    description?: ReactNode;
    /** Small line above the title: breadcrumb or back link. */
    eyebrow?: ReactNode;
    /** Right-aligned controls. On mobile they wrap below the title. */
    actions?: ReactNode;
    className?: string;
}

export const PageHeader = ({ title, description, eyebrow, actions, className }: PageHeaderProps) => (
    <header className={cx("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
        <div className="flex min-w-0 flex-col gap-1">
            {eyebrow && <div className="text-sm font-medium text-tertiary">{eyebrow}</div>}
            <h1 className="text-xl font-semibold text-primary lg:text-display-xs">{title}</h1>
            {description && <p className="text-sm text-tertiary lg:text-md">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </header>
);

/** Consistent page padding and width inside the shell. */
export const PageContent = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={cx("mx-auto flex w-full max-w-container flex-col gap-6 px-4 py-5 md:px-8 lg:gap-8 lg:py-8", className)}>{children}</div>
);

/** Card surface used across screens. */
export const Card = ({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) => (
    <section className={cx("rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset", padded && "p-4 lg:p-5", className)}>{children}</section>
);

export const CardHeader = ({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-md font-semibold text-primary">{title}</h2>
            {description && <p className="text-sm text-tertiary">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
);

/**
 * States plainly which numbers on a screen are real and which are placeholders. A small chip that
 * opens to the detail, so it does not push the content down on every screen.
 * Keep it on every screen until Supabase holds real counts and invoice costs.
 */
export const SampleDataNote = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <details className={cx("group w-fit max-w-full text-xs text-tertiary", className)}>
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary ring-1 ring-secondary outline-focus-ring ring-inset hover:bg-secondary_hover focus-visible:outline-2">
            <span className="size-1.5 rounded-full bg-fg-warning-secondary" aria-hidden="true" />
            Prototype data
            <span className="text-quaternary group-open:hidden">· what is real?</span>
        </summary>
        <p className="mt-2 max-w-3xl rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset">
            {children ?? "Items, shelves, par levels and 2026 orders come from Meraki's spreadsheets. Costs, staff, counts and usage are sample values."}
        </p>
    </details>
);
