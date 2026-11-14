"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowNarrowRight, ChevronRight, Download01, FilterLines, Lock01, SearchLg, Settings01 } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { SampleBadge } from "@/components/meraki/status-badges";
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
import type { LocationId, ReasonCode } from "@/data/types";
import { addDays, formatDate, formatTime, relativeDays } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { cx } from "@/utils/cx";

export type ActivityType = "count" | "receive" | "adjust" | "order" | "flag";
type Tone = "blue" | "success" | "warning" | "error" | "brand" | "gray";
type Range = "7" | "30" | "90" | "year" | "all";

const PAGE = 50;
const SYSTEM = "system";
/** This many flags from one day's rule run are shown as one log entry. */
const FLAG_GROUP_FROM = 3;

const TYPE_LABEL: Record<ActivityType, string> = { count: "Counts", receive: "Receipts", adjust: "Adjustments", order: "Orders", flag: "Flags" };
const TYPES: ActivityType[] = ["count", "receive", "adjust", "order", "flag"];
const RANGE_LABEL: Record<Range, string> = {
    "7": "Last 7 days",
    "30": "Last 30 days",
    "90": "Last 90 days",
    year: `This year (${TODAY.slice(0, 4)})`,
    all: "All time",
};

const REASON_LABEL: Record<ReasonCode, string> = {
    "cycle-count": "cycle count",
    "received-order": "received order",
    "used-in-service": "used in service",
    damaged: "damaged",
    expired: "expired",
    lost: "lost",
    "suspected-theft": "suspected theft",
    "sample-or-gift": "sample or gift",
    "returned-to-vendor": "returned to vendor",
    transfer: "transfer",
    correction: "correction",
};

interface LogRow {
    id: string;
    /** ISO date, or datetime when the time of day is known. */
    at: string;
    userId: string;
    locationId: LocationId;
    type: ActivityType;
    verb: string;
    tone: Tone;
    object: string;
    href?: string;
    before?: string;
    after?: string;
    /** Signed change when there is no before and after to show. */
    change?: string;
    detail?: string;
    isSample: boolean;
    imported: boolean;
}

/** One log, built from the activity feed, the stock ledger, purchase orders and the flag rules. */
const buildLog = (): LogRow[] => {
    const rows: LogRow[] = [];

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
                change: `+${m.delta}`,
                detail: [po ? `On ${po.number}` : "", m.note ? `Note: ${m.note}` : ""].filter(Boolean).join(" · "),
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
                before: String(m.balance - m.delta),
                after: String(m.balance),
                detail: `Reason given: ${REASON_LABEL[m.reason]}. ${m.note ?? "No note."}`,
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

    const key = (r: LogRow) => (r.at.length === 10 ? `${r.at}T00:00:00Z` : r.at);
    return rows.sort((a, b) => key(b).localeCompare(key(a)) || a.id.localeCompare(b.id));
};

const LOG = buildLog();

const dayHeading = (day: string) => {
    const rel = relativeDays(day, TODAY);
    const date = formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));
    return rel === "today" ? `Today, ${date}` : rel === "yesterday" ? `Yesterday, ${date}` : date;
};

const Chip = ({ isSelected, onPress, children }: { isSelected: boolean; onPress: () => void; children: ReactNode }) => (
    <button
        type="button"
        aria-pressed={isSelected}
        onClick={onPress}
        className={cx(
            "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9 lg:px-3",
            isSelected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
        )}
    >
        {children}
    </button>
);

const Who = ({ userId, compact }: { userId: string; compact?: boolean }) => {
    if (userId === SYSTEM) {
        return (
            <span className="flex min-w-0 items-center gap-2">
                <Avatar size="xs" placeholderIcon={Settings01} />
                <span className="truncate text-sm font-medium text-secondary">Flag rules{compact ? "" : " (automatic)"}</span>
            </span>
        );
    }
    const user = userById(userId);
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Avatar size="xs" initials={initials(user?.name ?? "?")} />
            <span className="truncate text-sm font-medium text-primary">{user?.name ?? "Not recorded"}</span>
        </span>
    );
};

const Change = ({ row }: { row: LogRow }) => {
    if (row.before !== undefined && row.after !== undefined) {
        return (
            <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap tabular-nums">
                <span className="text-tertiary">{row.before}</span>
                <ArrowNarrowRight className="size-3.5 text-fg-quaternary" aria-label="changed to" />
                <span className="font-semibold text-primary">{row.after}</span>
            </span>
        );
    }
    if (row.change) return <span className="text-sm font-semibold whitespace-nowrap text-primary tabular-nums">{row.change}</span>;
    return null;
};

const Markers = ({ row }: { row: LogRow }) => (
    <>
        {row.imported && <span className="text-xs whitespace-nowrap text-quaternary">Imported from the 2026 backlog</span>}
        {row.isSample && <SampleBadge />}
    </>
);

// ------------------------------------------------------------------------------------ screen

interface ActivityScreenProps {
    location?: LocationId;
    /** Type filter to start with. */
    type?: ActivityType;
}

export const ActivityScreen = ({ location: initialLocation = "lynnfield", type: initialType }: ActivityScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [scope, setScope] = useState<LocationId | "all">(initialLocation);
    const [type, setType] = useState<ActivityType | "all">(initialType ?? "all");
    const [person, setPerson] = useState("all");
    const [range, setRange] = useState<Range>("all");
    const [limit, setLimit] = useState(PAGE);
    const [exported, setExported] = useState(false);

    const reset = () => setLimit(PAGE);
    const since = range === "all" ? "" : range === "year" ? `${TODAY.slice(0, 4)}-01-01` : addDays(TODAY, -Number(range));
    const inScope = LOG.filter((r) => (scope === "all" || r.locationId === scope) && r.at.slice(0, 10) >= since && (person === "all" || r.userId === person));
    const rows = inScope.filter((r) => type === "all" || r.type === type);
    const shown = rows.slice(0, limit);
    const days = [...new Set(shown.map((r) => r.at.slice(0, 10)))];
    const filtersOn = type !== "all" || person !== "all" || range !== "all";
    const people = users.filter((u) => LOG.some((r) => r.userId === u.id));

    return (
        <AppShell
            activeUrl={ROUTES.activity}
            location={location}
            onLocationChange={(loc) => {
                setLocation(loc);
                setScope(loc);
                reset();
            }}
        >
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Activity <em>log</em>
                        </>
                    }
                    description="Who did what to stock, orders and counts, newest first."
                    actions={
                        <div className="flex flex-wrap items-center gap-3">
                            {exported && (
                                <span role="status" className="text-sm text-tertiary">
                                    Export is not connected in the prototype.
                                </span>
                            )}
                            <Button color="secondary" size="md" iconLeading={Download01} onClick={() => setExported(true)}>
                                Export CSV
                            </Button>
                        </div>
                    }
                />

                <p className="flex items-start gap-2 rounded-lg bg-brand-primary_alt px-3 py-2.5 text-sm text-secondary">
                    <Lock01 className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                    <span>
                        <span className="font-semibold">Entries cannot be edited or deleted.</span> A mistake is corrected with a new entry, and both stay on
                        the log.
                    </span>
                </p>

                <div className="flex flex-col gap-3">
                    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
                        <FilterLines className="hidden size-4 shrink-0 text-fg-quaternary lg:block" aria-hidden="true" />
                        <Chip
                            isSelected={type === "all"}
                            onPress={() => {
                                setType("all");
                                reset();
                            }}
                        >
                            All <span className="text-xs text-tertiary tabular-nums">{inScope.length}</span>
                        </Chip>
                        {TYPES.map((t) => (
                            <Chip
                                key={t}
                                isSelected={type === t}
                                onPress={() => {
                                    setType(type === t ? "all" : t);
                                    reset();
                                }}
                            >
                                {TYPE_LABEL[t]} <span className="text-xs text-tertiary tabular-nums">{inScope.filter((r) => r.type === t).length}</span>
                            </Chip>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:flex lg:items-center">
                        <NativeSelect
                            aria-label="Person"
                            size="sm"
                            className="lg:w-56"
                            selectClassName="min-h-11 lg:min-h-9 pr-8"
                            value={person}
                            onChange={(e) => {
                                setPerson(e.target.value);
                                reset();
                            }}
                            options={[
                                { label: "Everyone", value: "all" },
                                ...people.map((u) => ({ label: `${u.name} (${ROLE_LABEL[u.role]})`, value: u.id })),
                                { label: "Flag rules (automatic)", value: SYSTEM },
                            ]}
                        />
                        <NativeSelect
                            aria-label="Date range"
                            size="sm"
                            className="lg:w-44"
                            selectClassName="min-h-11 lg:min-h-9 pr-8"
                            value={range}
                            onChange={(e) => {
                                setRange(e.target.value as Range);
                                reset();
                            }}
                            options={(Object.keys(RANGE_LABEL) as Range[]).map((r) => ({ label: RANGE_LABEL[r], value: r }))}
                        />
                        <NativeSelect
                            aria-label="Location"
                            size="sm"
                            className="lg:w-44"
                            selectClassName="min-h-11 lg:min-h-9 pr-8"
                            value={scope}
                            onChange={(e) => {
                                const next = e.target.value as LocationId | "all";
                                setScope(next);
                                if (next !== "all") setLocation(next);
                                reset();
                            }}
                            options={[...locations.map((l) => ({ label: l.shortName, value: l.id as string })), { label: "Both locations", value: "all" }]}
                        />
                        {filtersOn && (
                            <Button
                                color="link-gray"
                                size="sm"
                                className="justify-self-start max-lg:min-h-11"
                                onClick={() => {
                                    setType("all");
                                    setPerson("all");
                                    setRange("all");
                                    reset();
                                }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </div>
                </div>

                {rows.length === 0 ? (
                    <Card className="py-10 lg:py-14">
                        <EmptyState size="md">
                            <EmptyState.Header pattern="none">
                                <EmptyState.FeaturedIcon icon={SearchLg} color="gray" theme="modern" />
                            </EmptyState.Header>
                            <EmptyState.Content>
                                <EmptyState.Title>No entries match</EmptyState.Title>
                                <EmptyState.Description>
                                    Nothing was logged at {locationName(scope)} for these filters. Try a longer date range or another person.
                                </EmptyState.Description>
                            </EmptyState.Content>
                        </EmptyState>
                    </Card>
                ) : (
                    <div className="flex flex-col gap-5">
                        {days.map((d) => {
                            const dayRows = shown.filter((r) => r.at.slice(0, 10) === d);
                            const total = rows.filter((r) => r.at.slice(0, 10) === d).length;
                            return (
                                <section key={d} className="flex flex-col gap-2">
                                    <h2 className="flex items-baseline gap-2 text-sm font-semibold text-secondary">
                                        {dayHeading(d)}
                                        <span className="text-xs font-medium text-tertiary">
                                            {total} entr{total === 1 ? "y" : "ies"}
                                        </span>
                                    </h2>
                                    <ul className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
                                        {dayRows.map((r) => (
                                            <li key={r.id} className="relative transition duration-100 ease-linear hover:bg-primary_hover">
                                                {/* Desktop: one line per entry */}
                                                <div className="hidden items-center gap-4 px-5 py-3 lg:flex">
                                                    <span className="w-16 shrink-0 text-xs text-tertiary tabular-nums">
                                                        {r.at.length > 10 ? formatTime(r.at) : <span className="sr-only">Time not recorded</span>}
                                                    </span>
                                                    <span className="w-44 shrink-0">
                                                        <Who userId={r.userId} />
                                                    </span>
                                                    <span className="w-32 shrink-0">
                                                        <Badge type="pill-color" color={r.tone} size="sm">
                                                            {r.verb}
                                                        </Badge>
                                                    </span>
                                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                        <RowLink row={r} />
                                                        {r.detail && <span className="truncate text-xs text-tertiary">{r.detail}</span>}
                                                    </span>
                                                    <span className="flex shrink-0 items-center gap-3">
                                                        <Change row={r} />
                                                        <Markers row={r} />
                                                    </span>
                                                    <ChevronRight className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                                </div>

                                                {/* Phone: stacked */}
                                                <div className="flex flex-col gap-2 p-4 lg:hidden">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <Who userId={r.userId} compact />
                                                        <span className="shrink-0 text-xs text-tertiary tabular-nums">
                                                            {r.at.length > 10 ? formatTime(r.at) : ""}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-start gap-2">
                                                        <Badge type="pill-color" color={r.tone} size="sm" className="mt-px shrink-0">
                                                            {r.verb}
                                                        </Badge>
                                                        <span className="min-w-0 flex-1">
                                                            <RowLink row={r} wrap />
                                                        </span>
                                                        <Change row={r} />
                                                    </div>
                                                    {r.detail && <p className="text-xs text-tertiary">{r.detail}</p>}
                                                    {(r.imported || r.isSample) && (
                                                        <div className="flex items-center gap-2">
                                                            <Markers row={r} />
                                                        </div>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            );
                        })}

                        <div className="flex flex-col items-center gap-2">
                            <p className="text-sm text-tertiary">
                                Showing {shown.length} of {rows.length} entries
                            </p>
                            {rows.length > shown.length && (
                                <Button color="secondary" size="md" onClick={() => setLimit((n) => n + PAGE)}>
                                    Show {Math.min(PAGE, rows.length - shown.length)} more
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <SampleDataNote>
                    Receipts and order dates are real: they come from Meraki&apos;s 2026 backlog spreadsheet, which records the day but not the time or who
                    logged it. The names shown against them are placeholders. Counts, adjustments and the November orders are sample entries.
                </SampleDataNote>
            </PageContent>
        </AppShell>
    );
};

/** The object of the entry, linking to its record. The link stretches over the whole row. */
const RowLink = ({ row, wrap }: { row: LogRow; wrap?: boolean }) =>
    row.href ? (
        <a
            href={row.href}
            className={cx(
                "text-sm font-medium text-primary outline-focus-ring after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2",
                wrap ? "break-words" : "truncate",
            )}
        >
            {row.object}
        </a>
    ) : (
        <span className={cx("text-sm font-medium text-primary", wrap ? "break-words" : "truncate")}>{row.object}</span>
    );
