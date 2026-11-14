"use client";

import type { FC, ReactNode } from "react";
import {
    BarChartSquare02,
    Bell01,
    ClipboardCheck,
    Flag01,
    HomeLine,
    Mail01,
    Menu01,
    Package,
    QrCode02,
    ReceiptCheck,
    Settings01,
    ShoppingCart01,
    Truck01,
    Users01,
} from "@untitledui/icons";
import type { NavItemDividerType, NavItemType } from "@/components/application/app-navigation/config";
import { SidebarNavigationSimple } from "@/components/application/app-navigation/sidebar-navigation/sidebar-simple";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { CURRENT_USER, ROLE_LABEL, summary } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { cx } from "@/utils/cx";
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
    receive: "/receive",
    receiveOrder: (id: string) => `/receive/${id}`,
    flags: "/flags",
    flag: (id: string) => `/flags/${id}`,
    activity: "/activity",
    reports: "/reports",
    digest: "/digest",
    team: "/settings/team",
    settings: "/settings",
    more: "/more",
    signIn: "/sign-in",
    lock: "/lock",
} as const;

const count = (n: number, color: "gray" | "error" | "warning" = "gray") =>
    n > 0 ? (
        <Badge size="sm" type="pill-color" color={color}>
            {n}
        </Badge>
    ) : undefined;

export const buildNav = (location: LocationId): (NavItemType | NavItemDividerType)[] => {
    const s = summary(location);
    return [
        { label: "Home", href: ROUTES.home, icon: HomeLine },
        { label: "Stock", href: ROUTES.stock, icon: Package, badge: count(s.low + s.out, "warning") },
        { label: "Scan", href: ROUTES.scan, icon: QrCode02 },
        { label: "Counts", href: ROUTES.counts, icon: ClipboardCheck, badge: count(s.countsDue) },
        { label: "Orders", href: ROUTES.orders, icon: ShoppingCart01, badge: count(s.awaitingApproval) },
        { label: "Receive", href: ROUTES.receive, icon: Truck01, badge: count(s.openOrders) },
        { label: "Flags", href: ROUTES.flags, icon: Flag01, badge: count(s.openFlags, s.highFlags ? "error" : "gray") },
        { divider: true },
        { label: "Reports", href: ROUTES.reports, icon: BarChartSquare02 },
        { label: "Digests", href: ROUTES.digest, icon: Mail01 },
        { label: "Activity", href: ROUTES.activity, icon: ReceiptCheck },
    ];
};

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
 * Flags are reached from the bell in the top bar; everything else lives under More.
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
    user?: User;
    /** Hide the mobile top bar and tabs for full-screen tasks (scanner, counting, PIN). */
    immersive?: boolean;
    children: ReactNode;
}

/**
 * App frame.
 * Desktop: fixed sidebar with the location switcher and the signed-in user.
 * Mobile: slim top bar (logo, location, alerts) and a bottom tab bar sized for thumbs.
 */
export const AppShell = ({ activeUrl = "/", location = "lynnfield", onLocationChange, user = CURRENT_USER, immersive, children }: AppShellProps) => {
    const s = summary(location);
    return (
        <div className="flex min-h-dvh flex-col bg-secondary_alt lg:flex-row">
            <div className="hidden lg:contents">
                <SidebarNavigationSimple
                    logo={
                        <div className="flex flex-col gap-4">
                            <MerakiLogo className="h-7 self-start" />
                            <LocationSwitcher value={location} onChange={onLocationChange} />
                        </div>
                    }
                    activeUrl={activeUrl}
                    items={buildNav(location) as NavItemType[]}
                    footerItems={FOOTER_NAV}
                    showAccountCard={false}
                    featureCard={
                        <div className="flex items-center gap-3 border-t border-secondary pt-4">
                            <Avatar size="md" initials={initials(user.name)} />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-primary">{user.name}</p>
                                <p className="truncate text-sm text-tertiary">{ROLE_LABEL[user.role]}</p>
                            </div>
                        </div>
                    }
                />
            </div>

            {!immersive && (
                <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-secondary bg-primary/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
                    <MerakiLogo className="h-6" />
                    <div className="flex items-center gap-1">
                        <LocationSwitcher value={location} onChange={onLocationChange} size="sm" />
                        <a
                            href={ROUTES.flags}
                            aria-label={`${s.openFlags} open flags`}
                            className="relative flex size-10 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                        >
                            <Bell01 className="size-5" aria-hidden="true" />
                            {s.highFlags > 0 && <span className="absolute top-2 right-2 size-2.5 rounded-full bg-error-solid ring-2 ring-bg-primary" />}
                        </a>
                    </div>
                </header>
            )}

            <main className={cx("min-w-0 flex-1", !immersive && "pb-24 lg:pb-0")}>{children}</main>

            {!immersive && <MobileTabBar activeUrl={activeUrl} location={location} />}
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
 * States plainly which numbers on a screen are real and which are placeholders.
 * Keep it on every screen until Supabase holds real counts and invoice costs.
 */
export const SampleDataNote = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <p className={cx("rounded-lg bg-secondary px-3 py-2 text-xs text-tertiary ring-1 ring-secondary ring-inset", className)}>
        <span className="font-semibold text-secondary">Prototype data. </span>
        {children ?? "Items, shelves, par levels and 2026 orders come from Meraki's spreadsheets. Costs, staff, counts and usage are sample values."}
    </p>
);
