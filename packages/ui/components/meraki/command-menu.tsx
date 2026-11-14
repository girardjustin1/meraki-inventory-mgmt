"use client";

import { useMemo, useState } from "react";
import type { FC, ReactNode } from "react";
import {
    ArrowRight,
    BarChartSquare02,
    Bell01,
    CheckSquare,
    ClipboardCheck,
    Flag01,
    HomeLine,
    LineChartUp01,
    Mail01,
    Package,
    PlusCircle,
    QrCode02,
    ReceiptCheck,
    SearchLg,
    Send01,
    Settings01,
    ShoppingCart01,
    Truck01,
    Users01,
} from "@untitledui/icons";
import {
    Autocomplete as AriaAutocomplete,
    Button as AriaButton,
    Dialog as AriaDialog,
    Header as AriaHeader,
    Input as AriaInput,
    Menu as AriaMenu,
    MenuItem as AriaMenuItem,
    MenuSection as AriaMenuSection,
    Modal as AriaModal,
    ModalOverlay as AriaModalOverlay,
    SearchField as AriaSearchField,
} from "react-aria-components";
import { CURRENT_USER, flags, items, locationName, purchaseOrders, stockRows, vendorById } from "@/data/inventory";
import type { StockRow } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import type { Permission } from "@/engine/permissions";
import { can } from "@/engine/permissions";
import { countMatches, search } from "@/engine/search";
import type { SearchDoc, SearchKind } from "@/engine/search";
import { formatQty } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { ItemThumb } from "./item-thumb";
import { ORDER_STATUS, StockStatusBadge } from "./status-badges";

// Routes are duplicated as literals here because app-shell imports this file.
interface PageDoc extends SearchDoc {
    kind: "page";
    icon: FC<{ className?: string }>;
    permission?: Permission;
}

const PAGES: PageDoc[] = [
    { id: "p-home", kind: "page", title: "Home", href: "/", icon: HomeLine, keywords: "dashboard overview today" },
    { id: "p-stock", kind: "page", title: "Stock", href: "/stock", icon: Package, keywords: "inventory supplies items shelf" },
    {
        id: "p-polish",
        kind: "page",
        title: "Polish wall",
        href: "/stock?tab=polish",
        icon: Package,
        keywords: "colours colors opi dnd dazzle dry chisel swatches",
    },
    { id: "p-low", kind: "page", title: "Low and out of stock", href: "/stock?status=low", icon: Package, keywords: "running low reorder needed" },
    { id: "p-scan", kind: "page", title: "Scan a barcode", href: "/scan", icon: QrCode02, keywords: "camera qr upc label" },
    { id: "p-counts", kind: "page", title: "Counts", href: "/counts", icon: ClipboardCheck, keywords: "stocktake cycle count", permission: "stock.count" },
    { id: "p-orders", kind: "page", title: "Orders", href: "/orders", icon: ShoppingCart01, keywords: "purchase orders po", permission: "orders.view" },
    {
        id: "p-new-order",
        kind: "page",
        title: "New order",
        href: "/orders/new",
        icon: PlusCircle,
        keywords: "reorder build purchase create",
        permission: "orders.create",
    },
    {
        id: "p-send",
        kind: "page",
        title: "Send orders to vendors",
        href: "/orders/send",
        icon: Send01,
        keywords: "email vendor cart pick list",
        permission: "orders.create",
    },
    {
        id: "p-receive",
        kind: "page",
        title: "Receive a delivery",
        href: "/receive",
        icon: Truck01,
        keywords: "delivery arrived check in",
        permission: "orders.receive",
    },
    { id: "p-tasks", kind: "page", title: "Tasks and pickup runs", href: "/tasks", icon: CheckSquare, keywords: "assigned to me errands pickup" },
    { id: "p-notifications", kind: "page", title: "Notifications", href: "/notifications", icon: Bell01, keywords: "inbox mentions" },
    {
        id: "p-flags",
        kind: "page",
        title: "Flags to review",
        href: "/flags",
        icon: Flag01,
        keywords: "review queue variance shrinkage missing",
        permission: "flags.view",
    },
    {
        id: "p-insights",
        kind: "page",
        title: "Insights",
        href: "/insights",
        icon: LineChartUp01,
        keywords: "forecast colours seasonality profitability planning",
        permission: "reports.view",
    },
    {
        id: "p-reports",
        kind: "page",
        title: "Reports",
        href: "/reports",
        icon: BarChartSquare02,
        keywords: "vendor performance cycle time",
        permission: "reports.view",
    },
    { id: "p-digest", kind: "page", title: "Digests", href: "/digest", icon: Mail01, keywords: "weekly monthly email", permission: "digests.view" },
    {
        id: "p-activity",
        kind: "page",
        title: "Activity log",
        href: "/activity",
        icon: ReceiptCheck,
        keywords: "audit history who changed",
        permission: "activity.view",
    },
    { id: "p-team", kind: "page", title: "Team and invites", href: "/settings/team", icon: Users01, keywords: "people roles permissions invite admin" },
    {
        id: "p-settings",
        kind: "page",
        title: "Settings",
        href: "/settings",
        icon: Settings01,
        keywords: "vendors notifications flag rules integrations",
        permission: "settings.manage",
    },
];

interface ItemDoc extends SearchDoc {
    kind: "supply" | "polish";
    row: StockRow;
}
interface OrderDoc extends SearchDoc {
    kind: "order";
    status: keyof typeof ORDER_STATUS;
}
type Doc = ItemDoc | OrderDoc | PageDoc | (SearchDoc & { kind: "flag" });

const itemHref = (id: string) => `/items/${id}`;

/** Search documents for one location. Built once per location and viewer. */
const buildDocs = (location: LocationId, user: User): Doc[] => {
    const itemDocs: ItemDoc[] = stockRows(location)
        .filter((r) => r.item.kind !== "tips")
        .map((row) => {
            const { item, level, vendor } = row;
            const polish = item.kind === "polish";
            return {
                id: item.id,
                kind: polish ? "polish" : "supply",
                title: item.name,
                subtitle: polish
                    ? [item.brand, item.colorCode, item.colorFamily].filter(Boolean).join(" · ")
                    : [item.brand, level.area, level.shelf && `Shelf ${level.shelf}`].filter(Boolean).join(" · "),
                href: itemHref(item.id),
                keywords: [item.brand, item.category, vendor.name, level.area, level.shelf, item.colorFamily, item.line].filter(Boolean).join(" "),
                codes: [item.sku, item.colorCode, item.upc].filter((c): c is string => Boolean(c)),
                row,
            };
        });

    const orderDocs: OrderDoc[] = can(user, "orders.view")
        ? purchaseOrders
              .filter((po) => po.locationId === location)
              .map((po) => ({
                  id: po.id,
                  kind: "order" as const,
                  title: po.number,
                  subtitle: `${vendorById(po.vendorId).name} · ${formatDate(po.createdAt, true)} · ${po.lines.length} lines`,
                  href: `/orders/${po.id}`,
                  keywords: `${vendorById(po.vendorId).name} ${po.kind} ${po.cycle} ${ORDER_STATUS[po.status].label}`,
                  codes: [po.number],
                  status: po.status,
              }))
        : [];

    const flagDocs = can(user, "flags.view")
        ? flags
              .filter((f) => f.locationId === location && (f.status === "open" || f.status === "reviewing"))
              .map((f) => ({
                  id: f.id,
                  kind: "flag" as const,
                  title: f.title,
                  subtitle: FLAG_TYPE_LABEL[f.type],
                  href: `/flags/${f.id}`,
                  keywords: `${f.itemName ?? ""} ${f.severity}`,
              }))
        : [];

    const pages = PAGES.filter((p) => !p.permission || can(user, p.permission));
    return [...itemDocs, ...orderDocs, ...flagDocs, ...pages];
};

const GROUPS: { kind: SearchKind; label: string }[] = [
    { kind: "supply", label: "Supplies" },
    { kind: "polish", label: "Polish" },
    { kind: "order", label: "Orders" },
    { kind: "flag", label: "Flags" },
    { kind: "page", label: "Go to" },
];

const itemClass = ({ isFocused, isPressed }: { isFocused: boolean; isPressed: boolean }) =>
    cx(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 outline-hidden transition duration-100 ease-linear",
        (isFocused || isPressed) && "bg-secondary",
    );

const Kbd = ({ children }: { children: ReactNode }) => (
    <kbd className="rounded px-1 py-px font-body text-xs font-medium text-quaternary ring-1 ring-secondary ring-inset">{children}</kbd>
);

export interface CommandMenuProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    location?: LocationId;
    user?: User;
    /** Starting text, used by stories and by "search for…" links. */
    initialQuery?: string;
}

/**
 * Command menu (Cmd+K or Ctrl+K). Finds a product by name, brand, colour code, SKU or barcode,
 * shows what is on the shelf, and jumps to it. Also finds orders, open flags and pages.
 *
 * Built on React Aria's Autocomplete + Menu: focus stays in the input while the arrow keys move
 * through results, and Enter opens the highlighted one.
 */
export const CommandMenu = ({ isOpen, onOpenChange, location = "lynnfield", user = CURRENT_USER, initialQuery = "" }: CommandMenuProps) => {
    const [query, setQuery] = useState(initialQuery);
    const docs = useMemo(() => buildDocs(location, user), [location, user]);
    const results = useMemo(() => search(docs, query, 6), [docs, query]);
    const trimmed = query.trim();
    const supplyTotal = useMemo(() => (trimmed ? countMatches(docs, trimmed, ["supply"]) : 0), [docs, trimmed]);
    const polishTotal = useMemo(() => (trimmed ? countMatches(docs, trimmed, ["polish"]) : 0), [docs, trimmed]);
    const itemTotal = supplyTotal + polishTotal;
    // "See all" opens Stock on whichever tab holds more of the matches.
    const seeAllHref = polishTotal > supplyTotal ? `/stock?tab=polish&line=all&q=${encodeURIComponent(trimmed)}` : `/stock?q=${encodeURIComponent(trimmed)}`;
    const shownItems = (results.supply?.length ?? 0) + (results.polish?.length ?? 0);
    const hasResults = GROUPS.some((g) => (results[g.kind]?.length ?? 0) > 0);

    // With nothing typed: what most people come here for.
    const lowNow = useMemo(
        () =>
            stockRows(location, "supply")
                .filter((r) => r.status === "out" || r.status === "low")
                .sort((a, b) => (a.forecast?.daysOfCover ?? 999) - (b.forecast?.daysOfCover ?? 999))
                .slice(0, 4),
        [location],
    );
    const quick = PAGES.filter(
        (p) => ["p-scan", "p-new-order", "p-receive", "p-counts", "p-flags", "p-insights"].includes(p.id) && (!p.permission || can(user, p.permission)),
    );

    const close = () => {
        onOpenChange(false);
        setQuery("");
    };

    const renderItem = (row: StockRow) => (
        <AriaMenuItem key={row.item.id} id={row.item.id} href={itemHref(row.item.id)} textValue={row.item.name} className={itemClass}>
            <ItemThumb item={row.item} size="sm" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-primary">{row.item.name}</span>
                <span className="truncate text-xs text-tertiary">
                    {row.item.kind === "polish"
                        ? [row.item.category, row.item.colorCode].filter(Boolean).join(" · ")
                        : [row.item.brand, row.level.area, row.level.shelf && `Shelf ${row.level.shelf}`].filter(Boolean).join(" · ")}
                </span>
            </span>
            <span className="hidden shrink-0 text-sm text-secondary tabular-nums sm:block">{formatQty(row.level, row.item.unit)}</span>
            <span className="shrink-0">
                <StockStatusBadge status={row.status} />
            </span>
        </AriaMenuItem>
    );

    const sectionHeader = (label: string, note?: string) => (
        <AriaHeader className="flex items-center justify-between px-2.5 pt-3 pb-1 text-xs font-semibold text-quaternary">
            <span>{label}</span>
            {note && <span className="font-normal">{note}</span>}
        </AriaHeader>
    );

    return (
        <AriaModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => (open ? onOpenChange(true) : close())}
            isDismissable
            className={({ isEntering, isExiting }) =>
                cx(
                    "fixed inset-0 z-50 flex items-start justify-center bg-overlay/70 p-3 backdrop-blur-[6px] sm:px-6 sm:pt-[12vh]",
                    isEntering && "duration-200 ease-out animate-in fade-in",
                    isExiting && "duration-150 ease-in animate-out fade-out",
                )
            }
        >
            <AriaModal
                className={({ isEntering }) =>
                    cx(
                        "w-full max-w-160 overflow-hidden rounded-2xl bg-primary shadow-2xl ring-1 ring-secondary_alt",
                        isEntering && "duration-200 ease-out animate-in zoom-in-95",
                    )
                }
            >
                <AriaDialog aria-label="Search" className="flex max-h-[min(34rem,calc(100dvh-1.5rem))] flex-col outline-hidden">
                    <AriaAutocomplete inputValue={query} onInputChange={setQuery}>
                        <AriaSearchField
                            aria-label={`Search ${locationName(location)}`}
                            autoFocus
                            className="flex items-center gap-3 border-b border-secondary px-4"
                        >
                            <SearchLg className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            <AriaInput
                                // One press of Escape closes the menu (the search field would otherwise clear its text first).
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") close();
                                }}
                                placeholder="Search products, colour codes, orders…"
                                className="h-14 min-w-0 flex-1 bg-transparent text-md text-primary outline-hidden placeholder:text-placeholder [&::-webkit-search-cancel-button]:hidden"
                            />
                            <span className="hidden shrink-0 text-xs text-quaternary sm:block">{locationName(location)}</span>
                            <AriaButton
                                slot={null}
                                onPress={close}
                                className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-quaternary ring-1 ring-secondary outline-focus-ring ring-inset hover:bg-primary_hover focus-visible:outline-2"
                            >
                                Esc
                            </AriaButton>
                        </AriaSearchField>

                        <AriaMenu
                            aria-label="Results"
                            onAction={close}
                            className="min-h-0 flex-1 overflow-y-auto p-2 outline-hidden"
                            renderEmptyState={() => (
                                <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
                                    <p className="text-sm font-semibold text-primary">Nothing matches “{trimmed}”</p>
                                    <p className="text-sm text-tertiary">Try a brand, a colour code like PK01, a SKU, or the barcode number.</p>
                                </div>
                            )}
                        >
                            {!trimmed && (
                                <>
                                    <AriaMenuSection>
                                        {sectionHeader("Quick actions")}
                                        {quick.map((p) => (
                                            <AriaMenuItem key={p.id} id={p.id} href={p.href} textValue={p.title} className={itemClass}>
                                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-fg-quaternary">
                                                    <p.icon className="size-4" aria-hidden="true" />
                                                </span>
                                                <span className="flex-1 text-sm font-medium text-primary">{p.title}</span>
                                                <ArrowRight className="size-4 text-fg-quaternary" aria-hidden="true" />
                                            </AriaMenuItem>
                                        ))}
                                    </AriaMenuSection>
                                    {lowNow.length > 0 && (
                                        <AriaMenuSection>
                                            {sectionHeader("Running low", locationName(location))}
                                            {lowNow.map(renderItem)}
                                        </AriaMenuSection>
                                    )}
                                </>
                            )}

                            {trimmed &&
                                hasResults &&
                                GROUPS.map(({ kind, label }) => {
                                    const hits = results[kind];
                                    if (!hits?.length) return null;
                                    return (
                                        <AriaMenuSection key={kind}>
                                            {sectionHeader(label)}
                                            {hits.map(({ doc }) => {
                                                if (doc.kind === "supply" || doc.kind === "polish") return renderItem((doc as ItemDoc).row);
                                                if (doc.kind === "order") {
                                                    const status = ORDER_STATUS[(doc as OrderDoc).status];
                                                    return (
                                                        <AriaMenuItem key={doc.id} id={doc.id} href={doc.href} textValue={doc.title} className={itemClass}>
                                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-fg-quaternary">
                                                                <ShoppingCart01 className="size-4" aria-hidden="true" />
                                                            </span>
                                                            <span className="flex min-w-0 flex-1 flex-col">
                                                                <span className="truncate text-sm font-medium text-primary">{doc.title}</span>
                                                                <span className="truncate text-xs text-tertiary">{doc.subtitle}</span>
                                                            </span>
                                                            <span className="shrink-0 text-xs font-medium text-tertiary">{status.label}</span>
                                                        </AriaMenuItem>
                                                    );
                                                }
                                                const Icon = doc.kind === "page" ? (doc as PageDoc).icon : Flag01;
                                                return (
                                                    <AriaMenuItem key={doc.id} id={doc.id} href={doc.href} textValue={doc.title} className={itemClass}>
                                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-fg-quaternary">
                                                            <Icon className="size-4" aria-hidden="true" />
                                                        </span>
                                                        <span className="flex min-w-0 flex-1 flex-col">
                                                            <span className="truncate text-sm font-medium text-primary">{doc.title}</span>
                                                            {doc.subtitle && <span className="truncate text-xs text-tertiary">{doc.subtitle}</span>}
                                                        </span>
                                                    </AriaMenuItem>
                                                );
                                            })}
                                        </AriaMenuSection>
                                    );
                                })}

                            {trimmed && itemTotal > shownItems && (
                                <AriaMenuSection>
                                    <AriaMenuItem
                                        id="see-all"
                                        href={seeAllHref}
                                        textValue={`See all ${itemTotal} products matching ${trimmed}`}
                                        className={(state) => cx(itemClass(state), "mt-1 border-t border-secondary")}
                                    >
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-primary text-fg-brand-primary">
                                            <Package className="size-4" aria-hidden="true" />
                                        </span>
                                        <span className="flex-1 text-sm font-medium text-brand-secondary">
                                            See all {itemTotal} products matching “{trimmed}”
                                        </span>
                                        <ArrowRight className="size-4 text-fg-brand-primary" aria-hidden="true" />
                                    </AriaMenuItem>
                                </AriaMenuSection>
                            )}
                        </AriaMenu>
                    </AriaAutocomplete>

                    <footer className="hidden items-center gap-4 border-t border-secondary px-4 py-2.5 text-xs text-tertiary sm:flex">
                        <span className="flex items-center gap-1.5">
                            <Kbd>↑</Kbd>
                            <Kbd>↓</Kbd> to move
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Kbd>↵</Kbd> to open
                        </span>
                        <span className="ml-auto">
                            {items.length.toLocaleString("en-US")} products · searching {locationName(location)}
                        </span>
                    </footer>
                </AriaDialog>
            </AriaModal>
        </AriaModalOverlay>
    );
};

interface CommandMenuTriggerProps {
    onPress: () => void;
    className?: string;
}

/** Looks like the sidebar search field; opens the command menu. */
export const CommandMenuTrigger = ({ onPress, className }: CommandMenuTriggerProps) => (
    <AriaButton
        onPress={onPress}
        aria-label="Search products, orders and pages"
        aria-keyshortcuts="Meta+K Control+K"
        className={cx(
            "flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-left text-sm text-placeholder shadow-xs ring-1 ring-primary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2",
            className,
        )}
    >
        <SearchLg className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
        <span className="flex-1 truncate">Search</span>
        <Kbd>⌘K</Kbd>
    </AriaButton>
);
