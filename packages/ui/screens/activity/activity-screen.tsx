"use client";

import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { Download01, Lock01, Settings01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { downloadCsv } from "@/components/meraki/collection-export";
import type { ActiveFilters, ToolbarFilter, ToolbarSort, ToolbarView } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar, passesFilters } from "@/components/meraki/data-table-toolbar";
import type { ListNoticeContent } from "@/components/meraki/list-table";
import { ColumnLabel, ListEmpty, ListNotice, norm, plural } from "@/components/meraki/list-table";
import {
    ROLE_LABEL,
    TODAY,
    activity,
    flags,
    getItem,
    getPurchaseOrder,
    locationName,
    locations,
    movements,
    purchaseOrders,
    userById,
    users,
    vendorById,
} from "@/data/inventory";
import type { LocationId, ReasonCode, User } from "@/data/types";
import { addDays, formatDate, formatTime, relativeDays } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { can, visibleLocations } from "@/engine/permissions";
import { REASON_LABEL } from "@/engine/reasons";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

export type ActivityType = "count" | "receive" | "adjust" | "order" | "flag";
/** `all` is the old way of writing "no date range" in a link. */
export type ActivityRange = "7" | "30" | "90" | "year" | "all";
export type ActivitySort = "newest" | "oldest" | "largest";
type ViewId = ActivityType | "all";
type Tone = "blue" | "success" | "warning" | "error" | "brand" | "gray";

const PAGE = 50;
const SYSTEM = "system";
/** This many flags from one day's rule run are shown as one log entry. */
const FLAG_GROUP_FROM = 3;

const TYPE_LABEL: Record<ActivityType, string> = { count: "Counts", receive: "Receipts", adjust: "Adjustments", order: "Orders", flag: "Flags" };
const TYPES: ActivityType[] = ["count", "receive", "adjust", "order", "flag"];
const RANGES: { id: Exclude<ActivityRange, "all">; label: string }[] = [
    { id: "7", label: "Last 7 days" },
    { id: "30", label: "Last 30 days" },
    { id: "90", label: "Last 90 days" },
    { id: "year", label: `This year (${TODAY.slice(0, 4)})` },
];
const SORTS: ToolbarSort[] = [
    { id: "newest", label: "Newest first" },
    { id: "oldest", label: "Oldest first" },
    { id: "largest", label: "Largest change first" },
];

interface LogRow {
    id: string;
    /** ISO date, or datetime when the time of day is known. */
    at: string;
    userId: string;
    locationId: LocationId;
    type: ActivityType;
    verb: string;
    tone: Tone;
    /** The item, order, count or flag the entry is about. */
    object: string;
    href?: string;
    /** Signed change to the quantity on hand, where the entry moved stock. */
    delta?: number;
    /** Why stock was adjusted. Only adjustments carry one. */
    reason?: ReasonCode;
    detail?: string;
    isSample: boolean;
    imported: boolean;
    /** Everything the search box looks through, already normalised. */
    haystack: string[];
}

const whoName = (userId: string) => (userId === SYSTEM ? "Flag rules" : (userById(userId)?.name ?? "Not recorded"));

/** One log, built from the activity feed, the stock ledger, purchase orders and the flag rules. */
const buildLog = (): LogRow[] => {
    const rows: Omit<LogRow, "haystack">[] = [];

    // Counts and the generated November orders. Adjustments are taken from the ledger below, which has the quantities.
    for (const a of activity) {
        if (a.id.startsWith("a-adj-")) continue;
        const isOrder = a.href?.startsWith("/orders/") ?? false;
        rows.push({
            id: a.id,
            at: a.at,
            userId: a.userId,
            locationId: a.locationId,
            type: isOrder ? "order" : "count",
            verb: isOrder ? (a.verb === "drafted" ? "Drafted" : "Sent for approval") : a.verb.startsWith("started") ? "Started count" : "Submitted count",
            tone: isOrder ? "brand" : "blue",
            object: a.subject,
            href: a.href,
            detail: a.detail,
            isSample: true,
            imported: false,
        });
    }

    for (const m of movements) {
        const item = getItem(m.itemId);
        if (m.type === "receive") {
            const po = m.purchaseOrderId ? getPurchaseOrder(m.purchaseOrderId) : undefined;
            rows.push({
                id: m.id,
                at: m.at.slice(0, 10), // the backlog records the day, not the time
                userId: m.userId,
                locationId: m.locationId,
                type: "receive",
                verb: "Received",
                tone: "success",
                object: item?.name ?? m.itemId,
                href: po ? ROUTES.order(po.id) : ROUTES.item(m.itemId),
                delta: m.delta,
                detail: [po ? `On ${po.number}` : "", m.note ?? ""].filter(Boolean).join(" · "),
                isSample: m.isSample,
                imported: !m.isSample,
            });
        } else if (m.type === "adjust") {
            rows.push({
                id: m.id,
                at: m.at,
                userId: m.userId,
                locationId: m.locationId,
                type: "adjust",
                verb: "Adjusted",
                tone: m.reason === "lost" || m.reason === "suspected-theft" ? "error" : "warning",
                object: item?.name ?? m.itemId,
                href: ROUTES.item(m.itemId),
                delta: m.delta,
                reason: m.reason,
                detail: `${REASON_LABEL[m.reason]} · ${m.balance - m.delta} to ${m.balance} · ${m.note ?? "no note"}`,
                isSample: m.isSample,
                imported: false,
            });
        }
    }

    // Imported orders: when the order form was dated, and when the last line was received.
    for (const po of purchaseOrders) {
        if (!po.imported) continue;
        const vendor = vendorById(po.vendorId).name;
        const ordered = po.lines.filter((l) => l.qtyOrdered > 0).length;
        rows.push({
            id: `po-created-${po.id}`,
            at: po.createdAt,
            userId: po.createdBy,
            locationId: po.locationId,
            type: "order",
            verb: "Ordered",
            tone: "brand",
            object: `${po.number} to ${vendor}`,
            href: ROUTES.order(po.id),
            detail: `${ordered} line${ordered === 1 ? "" : "s"}`,
            isSample: false,
            imported: true,
        });
        if (po.status === "received" && po.closedAt) {
            rows.push({
                id: `po-received-${po.id}`,
                at: po.closedAt,
                userId: po.lines.find((l) => l.receivedBy)?.receivedBy ?? po.createdBy,
                locationId: po.locationId,
                type: "order",
                verb: "Order complete",
                tone: "success",
                object: `${po.number} from ${vendor}`,
                href: ROUTES.order(po.id),
                detail: "Every line received",
                isSample: false,
                imported: true,
            });
        }
    }

    // Flags. A rule run that raises several flags for one location on one day is a single entry, so the
    // log is not buried under its own findings; the review queue holds each one.
    const flagRuns = new Map<string, typeof flags>();
    for (const f of flags) {
        const runKey = `${f.detectedAt.slice(0, 10)}:${f.locationId}`;
        flagRuns.set(runKey, [...(flagRuns.get(runKey) ?? []), f]);
    }
    const severityLabel = { high: "High", medium: "Medium", low: "Low" } as const;
    for (const [runKey, run] of flagRuns) {
        if (run.length < FLAG_GROUP_FROM) {
            for (const f of run) {
                rows.push({
                    id: `flag-${f.id}`,
                    at: f.detectedAt,
                    userId: SYSTEM,
                    locationId: f.locationId,
                    type: "flag",
                    verb: "Flagged",
                    tone: f.severity === "high" ? "error" : f.severity === "medium" ? "warning" : "gray",
                    object: f.title,
                    href: ROUTES.flag(f.id),
                    detail: `${FLAG_TYPE_LABEL[f.type]} · ${severityLabel[f.severity]} severity`,
                    isSample: !f.fromRealData,
                    imported: false,
                });
            }
            continue;
        }
        const first = run[0] as (typeof flags)[number];
        const count = (sev: keyof typeof severityLabel) => run.filter((f) => f.severity === sev).length;
        const severities = (["high", "medium", "low"] as const).filter((sev) => count(sev) > 0).map((sev) => `${count(sev)} ${sev}`);
        const types = [...new Set(run.map((f) => FLAG_TYPE_LABEL[f.type].toLowerCase()))];
        const sample = run.filter((f) => !f.fromRealData).length;
        rows.push({
            id: `flag-run-${runKey}`,
            at: first.detectedAt.slice(0, 10),
            userId: SYSTEM,
            locationId: first.locationId,
            type: "flag",
            verb: "Flagged",
            tone: count("high") ? "error" : count("medium") ? "warning" : "gray",
            object: `${run.length} flags raised: ${types.slice(0, 3).join(", ")}${types.length > 3 ? ` and ${types.length - 3} more` : ""}`,
            href: ROUTES.flags,
            detail: `${severities.join(", ")} severity${sample > 0 && sample < run.length ? ` · ${sample} from sample data` : ""}`,
            isSample: sample === run.length,
            imported: false,
        });
    }

    return rows.map((r) => ({ ...r, haystack: [r.object, r.verb, r.detail ?? "", whoName(r.userId)].map(norm) }));
};

const LOG = buildLog();

const dayOf = (row: LogRow) => row.at.slice(0, 10);
const stamp = (row: LogRow) => (row.at.length === 10 ? `${row.at}T00:00:00Z` : row.at);
const shortDate = (day: string) => formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));

const dayHeading = (day: string) => {
    const rel = relativeDays(day, TODAY);
    return rel === "today" ? `Today, ${shortDate(day)}` : rel === "yesterday" ? `Yesterday, ${shortDate(day)}` : shortDate(day);
};

const changeText = (delta: number) => (delta > 0 ? `+${delta}` : delta < 0 ? `−${Math.abs(delta)}` : "0");

const FILTER_READ: Record<string, (row: LogRow) => string | undefined> = {
    person: (r) => r.userId,
    reason: (r) => r.reason,
};

// ------------------------------------------------------------------------------------ small pieces

const Who = ({ userId }: { userId: string }) => (
    <span className="flex min-w-0 items-center gap-2">
        {userId === SYSTEM ? <Avatar size="xs" placeholderIcon={Settings01} /> : <Avatar size="xs" initials={initials(whoName(userId))} />}
        <span className="truncate text-secondary">{whoName(userId)}</span>
    </span>
);

/** A faint dot for a generated sample entry, as on the stock list. */
const SampleDot = () => (
    <span title="Sample entry" className="size-1 shrink-0 rounded-full bg-fg-warning-secondary opacity-60">
        <span className="sr-only">Sample entry</span>
    </span>
);

// ------------------------------------------------------------------------------------ screen

interface ActivityScreenProps {
    location?: LocationId;
    /** Who is looking. Defaults to the person using the app; stories pass a sample person. */
    user?: User;
    /** Kind of entry to start on (deep link `?type=`). */
    type?: ActivityType;
    /** Date range to start with (deep link `?range=`). */
    initialRange?: ActivityRange;
    /** People to start filtered to: user ids, or `system` for the flag rules (deep link `?person=`). */
    initialPeople?: string[];
    /** Adjustment reasons to start filtered to (deep link `?reason=`). */
    initialReasons?: ReasonCode[];
    /** Start with every location the person may see (deep link `?scope=all`). */
    initialAllLocations?: boolean;
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Sort to start with (deep link `?sort=`). */
    initialSort?: ActivitySort;
}

/** The append-only log: who did what to stock, orders and counts. Nothing here is edited or deleted. */
export const ActivityScreen = ({
    location: initialLocation = "lynnfield",
    user: userProp,
    type: initialType,
    initialRange = "all",
    initialPeople = [],
    initialReasons = [],
    initialAllLocations = false,
    initialQuery = "",
    initialSort = "newest",
}: ActivityScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const isDesktop = useBreakpoint("lg");

    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [view, setView] = useState<ViewId>(initialType ?? "all");
    const [filters, setFilters] = useState<ActiveFilters>(() => {
        const start: ActiveFilters = {};
        if (initialPeople.length) start.person = initialPeople;
        if (initialRange !== "all") start.range = [initialRange];
        if (initialReasons.length) start.reason = initialReasons;
        if (initialAllLocations) start.scope = ["all"];
        return start;
    });
    const [query, setQuery] = useState(initialQuery);
    const [sort, setSort] = useState<ActivitySort>(initialSort);
    const [visible, setVisible] = useState(PAGE);
    const [notice, setNotice] = useState<ListNoticeContent | null>(null);

    const mayRoam = useMemo(
        () =>
            visibleLocations(
                user,
                locations.map((l) => l.id),
            ),
        [user],
    );
    const everywhere = filters.scope?.[0] === "all" && mayRoam.length > 1;
    const range = filters.range?.[0] as Exclude<ActivityRange, "all"> | undefined;

    // null (not undefined) removes a parameter: useUrlSync serialises its input, which drops undefined keys.
    useUrlSync({
        type: view === "all" ? null : view,
        person: (filters.person ?? []).join(",") || null,
        range: range ?? null,
        reason: (filters.reason ?? []).join(",") || null,
        scope: everywhere ? "all" : null,
        q: query || null,
        sort: sort === "newest" ? null : sort,
    });

    // Everything in scope and in the date range: what the filter options and their counts are drawn from.
    const inRange = useMemo(() => {
        const since = range === "year" ? `${TODAY.slice(0, 4)}-01-01` : range ? addDays(TODAY, -Number(range)) : "";
        return LOG.filter((r) => (everywhere ? mayRoam.includes(r.locationId) : r.locationId === location) && dayOf(r) >= since);
    }, [everywhere, location, range, mayRoam]);

    // Everything but the view: each view's count is what picking it would show.
    const matching = useMemo(() => {
        const q = norm(query);
        return inRange.filter((r) => passesFilters(r, filters, FILTER_READ) && (!q || r.haystack.some((field) => field.includes(q))));
    }, [inRange, filters, query]);

    const rows = useMemo(() => {
        const out = matching.filter((r) => view === "all" || r.type === view);
        const newest = (a: LogRow, b: LogRow) => stamp(b).localeCompare(stamp(a)) || a.id.localeCompare(b.id);
        const compare: Record<ActivitySort, (a: LogRow, b: LogRow) => number> = {
            newest,
            oldest: (a, b) => stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id),
            largest: (a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0) || Number(b.delta !== undefined) - Number(a.delta !== undefined) || newest(a, b),
        };
        return out.sort(compare[sort]);
    }, [matching, view, sort]);

    const shown = rows.slice(0, visible);
    // Day headings only make sense while the list runs in date order.
    const grouped = sort !== "largest";
    const days = grouped ? [...new Set(shown.map(dayOf))] : [];
    const perDay = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(dayOf(r), (counts.get(dayOf(r)) ?? 0) + 1);
        return counts;
    }, [rows]);

    const views: ToolbarView[] = [
        { id: "all", label: "All", count: matching.length },
        ...TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], count: matching.filter((r) => r.type === t).length })),
    ];

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const tally = (read: (r: LogRow) => string | undefined) => {
            const counts = new Map<string, number>();
            for (const r of inRange) {
                const key = read(r);
                if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
            }
            return counts;
        };
        const byPerson = tally((r) => r.userId);
        const byReason = tally((r) => r.reason);
        // People with entries here, plus anyone a link already filters to.
        const people = users.filter((u) => byPerson.has(u.id) || (filters.person ?? []).includes(u.id));
        return [
            {
                id: "person",
                label: "Person",
                options: [
                    ...people.map((u) => ({ id: u.id, label: `${u.name} (${ROLE_LABEL[u.role]})`, count: byPerson.get(u.id) ?? 0 })),
                    { id: SYSTEM, label: "Flag rules (automatic)", count: byPerson.get(SYSTEM) ?? 0 },
                ],
            },
            { id: "range", label: "Date", multiple: false, options: RANGES.map((r) => ({ id: r.id, label: r.label })) },
            {
                id: "reason",
                label: "Reason",
                options: [...byReason]
                    .map(([id, count]) => ({ id, label: REASON_LABEL[id as ReasonCode], count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            },
            ...(mayRoam.length > 1 ? [{ id: "scope", label: "Location", multiple: false, options: [{ id: "all", label: "Both locations" }] }] : []),
        ];
    }, [inRange, filters.person, mayRoam]);

    const filtersOn = query !== "" || Object.keys(filters).length > 0;
    const where = everywhere ? "both locations" : locationName(location);
    // What this view holds before any search or filter, so the summary only appears when those narrow it.
    const total = LOG.filter((r) => (everywhere ? mayRoam.includes(r.locationId) : r.locationId === location) && (view === "all" || r.type === view)).length;
    const narrowed = rows.length !== total;
    const summaryText = narrowed ? `${rows.length.toLocaleString("en-US")} of ${plural(total, "entry", "entries")}` : undefined;

    const relist = () => setVisible(PAGE);
    const clearAll = () => {
        setQuery("");
        setFilters({});
        setView("all");
        relist();
    };

    const exportCsv = () => {
        const name = `activity-${everywhere ? "all" : location}-${TODAY}.csv`;
        downloadCsv(
            name,
            ["Date", "Time", "Who", "What happened", "Detail", "Item or order", "Change", "Location", "Source"],
            rows.map((r) => [
                dayOf(r),
                r.at.length > 10 ? formatTime(r.at) : undefined,
                whoName(r.userId),
                r.verb,
                r.detail,
                r.object,
                r.delta,
                locationName(r.locationId),
                r.imported ? "Imported from the 2026 backlog" : r.isSample ? "Sample" : undefined,
            ]),
        );
        setNotice({ text: `${plural(rows.length, "entry", "entries")} exported as ${name}.` });
    };

    // ---------------------------------------------------------------- no access

    if (!can(user, "activity.view")) {
        return (
            <AppShell activeUrl={ROUTES.activity} location={location} onLocationChange={setLocation} user={userProp}>
                <PageContent>
                    <PageHeader
                        title={
                            <>
                                Activity <em>log</em>
                            </>
                        }
                    />
                    <ListEmpty
                        icon={Lock01}
                        title="The activity log is for managers and owners"
                        action={
                            <Button color="secondary" size="md" href={ROUTES.home} className="max-lg:min-h-11">
                                Back to home
                            </Button>
                        }
                    >
                        Your role ({ROLE_LABEL[user.role]}) does not include the log of who changed what. What you count, use and receive is still recorded on
                        it.
                    </ListEmpty>
                </PageContent>
            </AppShell>
        );
    }

    // ---------------------------------------------------------------- cells

    // The whole row opens the record the entry is about. The name is the real link; other links are left alone.
    const openRow = (event: MouseEvent<HTMLTableRowElement>) => {
        const target = event.target as HTMLElement;
        if (!event.currentTarget.contains(target) || target.closest("a, button, input, label")) return;
        event.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]")?.click();
    };

    const when = (r: LogRow) => {
        const time = r.at.length > 10 ? formatTime(r.at) : undefined;
        if (grouped) {
            return (
                time ?? (
                    <span className="text-quaternary" title="The backlog records the day, not the time">
                        –<span className="sr-only">Time not recorded</span>
                    </span>
                )
            );
        }
        return time ? `${shortDate(dayOf(r))}, ${time}` : shortDate(dayOf(r));
    };

    const what = (r: LogRow) => (
        <span className="flex min-w-0 items-center gap-2">
            <Badge type="pill-color" color={r.tone} size="sm" className="shrink-0">
                {r.verb}
            </Badge>
            {r.detail && <span className="truncate text-tertiary">{r.detail}</span>}
            {r.imported && (
                <span
                    className="shrink-0 text-xs text-quaternary"
                    title="Imported from the 2026 backlog, which records the day but not the time or who logged it"
                >
                    Imported
                </span>
            )}
            {r.isSample && <SampleDot />}
        </span>
    );

    const change = (r: LogRow) =>
        r.delta === undefined ? <span className="text-quaternary">–</span> : <span className="font-semibold text-primary">{changeText(r.delta)}</span>;

    const tableRow = (r: LogRow) => (
        <tr
            key={r.id}
            data-row={r.id}
            data-type={r.type}
            onClick={r.href ? openRow : undefined}
            className={cx(
                "h-12 transition duration-100 ease-linear [&>td]:border-b [&>td]:border-secondary",
                r.href && "cursor-pointer hover:bg-primary_hover",
            )}
        >
            <td className="py-0 pr-3 pl-5 whitespace-nowrap text-tertiary tabular-nums">{when(r)}</td>
            <td className="max-w-48 px-3 whitespace-nowrap">
                <Who userId={r.userId} />
            </td>
            <td className="max-w-64 px-3 whitespace-nowrap xl:max-w-80 2xl:max-w-96">{what(r)}</td>
            <td className="w-full max-w-0 min-w-48 px-3">
                {r.href ? (
                    <a
                        data-row-link
                        href={r.href}
                        className="block truncate rounded-xs font-medium text-primary outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                        {r.object}
                    </a>
                ) : (
                    <span className="block truncate font-medium text-primary">{r.object}</span>
                )}
            </td>
            <td className="px-3 text-right whitespace-nowrap tabular-nums">{change(r)}</td>
            <td className="py-0 pr-5 pl-3 whitespace-nowrap text-secondary">{locationName(r.locationId)}</td>
        </tr>
    );

    const card = (r: LogRow) => {
        const time = r.at.length > 10 ? formatTime(r.at) : undefined;
        const meta = [
            whoName(r.userId),
            grouped ? time : [shortDate(dayOf(r)), time].filter(Boolean).join(", "),
            everywhere ? locationName(r.locationId) : undefined,
            r.detail,
        ]
            .filter(Boolean)
            .join(" · ");
        const body = (
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2">
                    <Badge type="pill-color" color={r.tone} size="sm" className="shrink-0">
                        {r.verb}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">{r.object}</span>
                    {r.delta !== undefined && <span className="shrink-0 text-sm font-semibold text-primary tabular-nums">{changeText(r.delta)}</span>}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
                    <span className="truncate">{meta}</span>
                    {r.isSample && <SampleDot />}
                </span>
            </span>
        );
        const rowClass = "flex min-h-14 min-w-0 items-center gap-3 px-3.5 py-2.5 outline-focus-ring focus-visible:outline-2 focus-visible:-outline-offset-2";
        return (
            <li key={r.id} data-row={r.id} data-type={r.type}>
                {r.href ? (
                    <a href={r.href} className={rowClass}>
                        {body}
                    </a>
                ) : (
                    <div className={rowClass}>{body}</div>
                )}
            </li>
        );
    };

    return (
        <AppShell
            activeUrl={ROUTES.activity}
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
                        title={
                            <>
                                Activity <em>log</em>
                            </>
                        }
                        description="Entries are never edited or deleted. A mistake is corrected with a new entry, and both stay on the log."
                        actions={
                            <Button
                                color="secondary"
                                size="md"
                                className="max-lg:min-h-11"
                                iconLeading={Download01}
                                isDisabled={rows.length === 0}
                                data-testid="export-csv"
                                onClick={exportCsv}
                            >
                                Export CSV
                            </Button>
                        }
                    />
                    <SampleDataNote>
                        Receipts and order dates are real: they come from Meraki&apos;s 2026 backlog spreadsheet, which records the day but not the time or who
                        logged it. Those entries are marked Imported, and the names shown against them are placeholders. Counts, adjustments and the November
                        orders are sample entries, marked with a faint dot.
                    </SampleDataNote>
                </div>

                <div className="flex flex-col gap-3">
                    <DataTableToolbar
                        label={`activity at ${where}`}
                        views={views}
                        view={view}
                        onViewChange={(id) => {
                            setView(id as ViewId);
                            relist();
                        }}
                        query={query}
                        onQueryChange={(value) => {
                            setQuery(value);
                            relist();
                        }}
                        searchPlaceholder="Search by item, order, person or what happened"
                        compactSearchPlaceholder="Search the log"
                        filters={filterDefs}
                        activeFilters={filters}
                        onFiltersChange={(next) => {
                            setFilters(next);
                            relist();
                        }}
                        sorts={SORTS}
                        sort={sort}
                        onSortChange={(id) => {
                            setSort(id as ActivitySort);
                            relist();
                        }}
                        summary={summaryText}
                    />

                    {rows.length === 0 ? (
                        <ListEmpty
                            title="No entries match"
                            action={
                                (filtersOn || view !== "all") && (
                                    <Button color="secondary" size="md" className="max-lg:min-h-11" data-testid="clear-all" onClick={clearAll}>
                                        Clear search and filters
                                    </Button>
                                )
                            }
                        >
                            {filtersOn || view !== "all"
                                ? `Nothing logged at ${where} fits this view, search and these filters.`
                                : `Nothing has been logged at ${where} yet.`}
                        </ListEmpty>
                    ) : isDesktop ? (
                        // `relative` keeps the visually hidden labels inside the scroller, so they cannot widen the page.
                        <div className="relative overflow-x-auto rounded-xl bg-primary shadow-xs ring-1 ring-secondary">
                            <table className="w-full text-sm" aria-label={`Activity at ${where}`}>
                                <thead>
                                    <tr className="h-10 bg-secondary">
                                        <th scope="col" className="border-b border-secondary py-0 pr-3 pl-5 text-left">
                                            <ColumnLabel label="When" />
                                        </th>
                                        <th scope="col" className="border-b border-secondary px-3 text-left">
                                            <ColumnLabel label="Who" />
                                        </th>
                                        <th scope="col" className="border-b border-secondary px-3 text-left">
                                            <ColumnLabel label="What happened" />
                                        </th>
                                        <th scope="col" className="w-full border-b border-secondary px-3 text-left">
                                            <ColumnLabel label="Item or order" />
                                        </th>
                                        <th scope="col" className="border-b border-secondary px-3 text-right">
                                            <ColumnLabel
                                                label="Change"
                                                tooltip="How the entry moved the quantity on hand. Counts, orders and flags do not move stock by themselves."
                                            />
                                        </th>
                                        <th scope="col" className="border-b border-secondary py-0 pr-5 pl-3 text-left">
                                            <ColumnLabel label="Location" />
                                        </th>
                                    </tr>
                                </thead>
                                {grouped ? (
                                    days.map((d) => (
                                        <tbody key={d} data-day={d} className="[&:last-child>tr:last-child>td]:border-b-0">
                                            <tr className="h-9 bg-secondary/60">
                                                <th
                                                    scope="colgroup"
                                                    colSpan={6}
                                                    className="border-b border-secondary px-5 text-left text-xs font-semibold text-secondary"
                                                >
                                                    {dayHeading(d)}
                                                    <span className="ml-2 font-medium text-tertiary">{plural(perDay.get(d) ?? 0, "entry", "entries")}</span>
                                                </th>
                                            </tr>
                                            {shown.filter((r) => dayOf(r) === d).map(tableRow)}
                                        </tbody>
                                    ))
                                ) : (
                                    <tbody className="[&>tr:last-child>td]:border-b-0">{shown.map(tableRow)}</tbody>
                                )}
                            </table>
                        </div>
                    ) : grouped ? (
                        <div className="flex flex-col gap-4">
                            {days.map((d) => (
                                <section key={d} data-day={d} className="flex flex-col gap-1.5">
                                    <h2 className="flex items-baseline gap-2 pl-1 text-sm font-semibold text-secondary">
                                        {dayHeading(d)}
                                        <span className="text-xs font-medium text-tertiary">{plural(perDay.get(d) ?? 0, "entry", "entries")}</span>
                                    </h2>
                                    <Card padded={false}>
                                        <ul className="divide-y divide-secondary">{shown.filter((r) => dayOf(r) === d).map(card)}</ul>
                                    </Card>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <Card padded={false}>
                            <ul className="divide-y divide-secondary">{shown.map(card)}</ul>
                        </Card>
                    )}

                    {rows.length > 0 && (
                        <div className="flex flex-col items-center gap-2">
                            {rows.length > shown.length && isDesktop && (
                                <p className="text-sm text-tertiary">
                                    Showing {shown.length} of {rows.length.toLocaleString("en-US")}
                                </p>
                            )}
                            {rows.length > shown.length && (
                                <Button
                                    color="secondary"
                                    size="md"
                                    className="self-center max-lg:min-h-11 max-lg:w-full"
                                    data-testid="show-more"
                                    onClick={() => setVisible((v) => v + PAGE)}
                                >
                                    Show {Math.min(PAGE, rows.length - shown.length)} more ({(rows.length - shown.length).toLocaleString("en-US")} left)
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                <ListNotice notice={notice} onDismiss={() => setNotice(null)} />
            </PageContent>
        </AppShell>
    );
};
