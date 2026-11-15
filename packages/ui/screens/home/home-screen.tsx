"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import {
    ArrowRight,
    AtSign,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    DotsHorizontal,
    Edit05,
    Eye,
    QrCode02,
    ShoppingCart01,
    Truck01,
} from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { NumberComparison, NumberStrip } from "@/components/meraki/number-strip";
import type { NumberStripItem } from "@/components/meraki/number-strip";
import { FlagSeverityBadge } from "@/components/meraki/status-badges";
import { TASK_TYPE, canAssignTasks, isOpenTask, progressText } from "@/components/meraki/task-card";
import {
    INCOMING_MAX_AGE_DAYS,
    TODAY,
    countSessions,
    locationName,
    locations,
    notificationsForUser,
    openFlags,
    purchaseOrders,
    stockRows,
    summary,
    tasks,
    tasksFor,
    userById,
    vendorById,
} from "@/data/inventory";
import type { StockRow } from "@/data/inventory";
import type { Flag, LocationId, PurchaseOrder, Task, TaskType, User } from "@/data/types";
import { daysBetween, formatDate, formatTime, relativeDays, toDate } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { can, isAdmin } from "@/engine/permissions";
import { formatCount, formatQty } from "@/engine/stock";
import { cx } from "@/utils/cx";
import { useViewer } from "@/utils/viewer";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SEVERITY_RANK: Record<Flag["severity"], number> = { high: 0, medium: 1, low: 2 };
const NUMBER_LABELS = { reorder: "To reorder", review: "To review", receive: "To receive" } as const;
/** Rows shown in "Today" before the rest fold under "Show more". */
const MAX_TODAY = 8;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const day = (iso: string) => iso.slice(0, 10);
/** Items sold as "Each" have no sensible plural, so they read as units. */
const unitOf = (unit: string) => (unit.toLowerCase() === "each" ? "Unit" : unit);
/** "a", "a and b", "a, b and c". */
const sentence = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? ""));
const firstName = (name?: string) => name?.split(" ")[0] ?? "Someone";

// ------------------------------------------------------------------------------------ the three numbers

export interface HomeNumbers {
    /** Supplies with none on hand. */
    out: number;
    /** Supplies at or below their reorder point, not counting the ones that are out. */
    low: number;
    /** Supplies the reorder rule suggests ordering, or that someone asked for. Same list as the stock screen's "Needs reorder" view. */
    reorder?: number;
    openFlags: number;
    highFlags: number;
    /** Order lines not marked received, on orders that are sent or part received. */
    toReceive: number;
    /** The share of `toReceive` on orders older than the incoming threshold: probably arrived and never logged. */
    unconfirmed: number;
}

const isOpenOrder = (po: PurchaseOrder) => po.status === "sent" || po.status === "partially-received";
const openLines = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived === 0).length;
const orderedOn = (po: PurchaseOrder) => day(po.sentAt ?? po.createdAt);
/** Same threshold the stock table uses to call an open line "unconfirmed" instead of "incoming". */
const isStale = (po: PurchaseOrder) => daysBetween(orderedOn(po), TODAY) > INCOMING_MAX_AGE_DAYS;

const numbersFor = (loc: LocationId): HomeNumbers => {
    const s = summary(loc);
    const unconfirmed = purchaseOrders.filter((po) => po.locationId === loc && isOpenOrder(po) && isStale(po)).reduce((n, po) => n + openLines(po), 0);
    return { out: s.out, low: s.low, reorder: s.reorderLines, openFlags: s.openFlags, highFlags: s.highFlags, toReceive: s.openOrderLines, unconfirmed };
};

/** The numbers this person can act on. Without `linked` the cells are plain text (another location's row). */
const numberItems = (n: HomeNumbers, user: User, linked = true): NumberStripItem[] => {
    const items: NumberStripItem[] = [
        {
            label: NUMBER_LABELS.reorder,
            value: n.reorder ?? n.out + n.low,
            note: n.out > 0 ? `${n.out} out` : undefined,
            noteTone: "bad",
            href: `${ROUTES.stock}?reorder=1`,
        },
    ];
    if (can(user, "flags.view")) {
        items.push({
            label: NUMBER_LABELS.review,
            value: n.openFlags,
            note: n.highFlags > 0 ? `${n.highFlags} high` : undefined,
            noteTone: "bad",
            href: ROUTES.flags,
        });
    }
    if (can(user, "orders.receive")) {
        items.push({
            label: NUMBER_LABELS.receive,
            value: n.toReceive,
            note: n.unconfirmed > 0 ? `${n.unconfirmed} unconfirmed` : undefined,
            noteTone: "warning",
            href: ROUTES.receive,
        });
    }
    return linked ? items : items.map((item) => ({ ...item, href: undefined }));
};

// ------------------------------------------------------------------------------------ today

export interface TodayRow {
    id: string;
    icon: FC<{ className?: string }>;
    /** One line: what to do. */
    title: string;
    /** Who and how far along, in a few words. */
    meta?: string;
    /** When: "Due today", "2 days overdue". */
    due?: string;
    late?: boolean;
    href: string;
    /** What opening the row does: "Approve", "Continue". */
    action: string;
    /** 0 late · 1 waiting on this person today · 2 theirs, coming up · 3 someone else has it in hand. */
    rank: 0 | 1 | 2 | 3;
    /** Days until due, to order rows inside a rank. */
    dueIn?: number;
}

const dueOn = (iso: string, withTime = false) => {
    const n = daysBetween(TODAY, day(iso));
    if (n < 0) return { label: `${plural(-n, "day")} overdue`, late: true, dueIn: n };
    return { label: `due ${relativeDays(day(iso), TODAY)}${withTime && n === 0 && iso.length > 10 ? `, ${formatTime(iso)}` : ""}`, late: false, dueIn: n };
};

const TASK_ACTION: Record<TaskType, string> = { "pickup-run": "Start", count: "Count", receive: "Receive", review: "Review", general: "Open" };

const vendorList = (orders: PurchaseOrder[]) => {
    const names = [...new Set(orders.map((po) => vendorById(po.vendorId).name))];
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(", ");
};

/** Everything that needs this person at this location, most urgent first. */
const buildToday = (loc: LocationId, user: User): TodayRow[] => {
    const rows: TodayRow[] = [];
    const openTasks = tasks.filter((t) => isOpenTask(t.status));
    const myTasks = tasksFor(user.id).filter((t) => isOpenTask(t.status));
    const aboutCount = (id: string, list: Task[]) => list.some((t) => t.subject?.type === "count" && t.subject.id === id);
    const counts = countSessions.filter((c) => c.locationId === loc);

    // Counts due or in progress. People who schedule counts see everyone's; everyone else sees their own.
    if (can(user, "stock.count")) {
        const seesAll = can(user, "counts.schedule");
        for (const c of counts) {
            const when = dueOn(c.dueAt);
            const started = c.status === "in-progress";
            const mine = c.assignedTo === user.id;
            if (!(started || (c.status === "scheduled" && when.dueIn <= 3)) || (!mine && !seesAll) || aboutCount(c.id, myTasks)) continue;
            const counted = c.lines.filter((l) => l.counted !== undefined).length;
            rows.push({
                id: c.id,
                icon: ClipboardCheck,
                title: mine ? `${started ? "Finish" : "Start"} the ${c.name} count` : `${c.name} count`,
                meta: [
                    started ? `${counted} of ${c.lines.length} counted` : plural(c.lines.length, "item"),
                    mine ? undefined : (userById(c.assignedTo)?.name ?? "Nobody assigned"),
                ]
                    .filter(Boolean)
                    .join(" · "),
                due: when.label,
                late: when.late,
                href: ROUTES.count(c.id),
                action: mine ? (started ? "Continue" : "Start") : "View",
                rank: when.late ? 0 : !mine ? 3 : started || when.dueIn === 0 ? 1 : 2,
                dueIn: when.dueIn,
            });
        }
    }

    // Submitted counts nobody has been asked to review yet. Never the person's own count.
    if (can(user, "counts.approve")) {
        for (const c of counts) {
            if (c.status !== "submitted" || c.assignedTo === user.id || aboutCount(c.id, openTasks)) continue;
            const differ = c.lines.filter((l) => l.counted !== undefined && l.counted !== l.expected).length;
            rows.push({
                id: `${c.id}-review`,
                icon: Eye,
                title: `Review the ${c.name} count`,
                meta: `${userById(c.assignedTo)?.name ?? "Staff"} submitted it${c.submittedAt ? ` ${relativeDays(day(c.submittedAt), TODAY)}` : ""} · ${differ > 0 ? `${plural(differ, "line")} differ` : "all lines match"}`,
                href: ROUTES.count(c.id),
                action: "Review",
                rank: 1,
                dueIn: 0,
            });
        }
    }

    const orders = purchaseOrders.filter((po) => po.locationId === loc);

    // Orders waiting for approval: only for people who can approve, and never an order they created.
    if (can(user, "orders.approve")) {
        for (const po of orders) {
            if (po.status !== "awaiting-approval" || po.createdBy === user.id) continue;
            rows.push({
                id: po.id,
                icon: ShoppingCart01,
                title: `Approve the ${vendorById(po.vendorId).name} order`,
                meta: `${plural(po.lines.length, "line")} · from ${firstName(userById(po.createdBy)?.name)} ${relativeDays(day(po.createdAt), TODAY)}`,
                href: ROUTES.order(po.id),
                action: "Approve",
                rank: 1,
                dueIn: 0,
            });
        }
    }

    // The person's own tasks and pickup runs, wherever they are.
    for (const t of myTasks) {
        const when = dueOn(t.dueAt, true);
        const started = t.status === "in-progress";
        rows.push({
            id: t.id,
            icon: TASK_TYPE[t.type].icon,
            title: t.title,
            meta: [
                t.locationId !== loc ? locationName(t.locationId) : undefined,
                t.createdBy !== user.id ? `From ${firstName(userById(t.createdBy)?.name)}` : undefined,
                started && t.lines?.length ? progressText(t.lines) : undefined,
            ]
                .filter(Boolean)
                .join(" · "),
            due: when.label,
            late: when.late,
            href: ROUTES.task(t.id),
            action: started ? "Continue" : TASK_ACTION[t.type],
            rank: when.late ? 0 : started || when.dueIn === 0 ? 1 : 2,
            dueIn: when.dueIn,
        });
    }

    // Unread mentions: someone is waiting for an answer.
    for (const n of notificationsForUser(user.id)
        .filter((n) => n.type === "mention" && !n.readAt)
        .slice(0, 3)) {
        rows.push({
            id: n.id,
            icon: AtSign,
            title: n.title,
            meta: [cap(relativeDays(day(n.createdAt), TODAY)), n.body].filter(Boolean).join(" · "),
            href: n.href,
            action: "Reply",
            rank: 1,
            dueIn: 0,
        });
    }

    // Deliveries to check in: recent orders only, and never an order the person created (someone else receives it).
    if (can(user, "orders.receive")) {
        const arriving = orders
            .filter((po) => isOpenOrder(po) && !isStale(po) && po.createdBy !== user.id && openLines(po) > 0)
            .sort((a, b) => orderedOn(a).localeCompare(orderedOn(b)));
        const first = arriving[0];
        if (first) {
            const one = arriving.length === 1;
            rows.push({
                id: "deliveries",
                icon: Truck01,
                title: one ? `Check in the ${vendorById(first.vendorId).name} delivery` : `Check in ${arriving.length} deliveries`,
                meta: one
                    ? `${plural(openLines(first), "line")} · ordered ${relativeDays(orderedOn(first), TODAY)}`
                    : `${vendorList(arriving)} · oldest ordered ${formatDate(orderedOn(first))}`,
                href: one ? ROUTES.receiveOrder(first.id) : ROUTES.receive,
                action: "Receive",
                rank: 2,
            });
        }
    }

    // Drafts the person started and has not sent.
    if (can(user, "orders.create")) {
        const drafts = orders.filter((po) => po.status === "draft" && po.createdBy === user.id);
        const first = drafts[0];
        if (first) {
            const one = drafts.length === 1;
            rows.push({
                id: "drafts",
                icon: Edit05,
                title: one ? `Finish the ${vendorById(first.vendorId).name} draft order` : `Finish ${drafts.length} draft orders`,
                meta: one ? `${plural(first.lines.length, "line")} · started ${relativeDays(day(first.createdAt), TODAY)}` : vendorList(drafts),
                href: one ? ROUTES.order(first.id) : ROUTES.orders,
                action: "Open",
                rank: 2,
            });
        }
    }

    return rows.sort((a, b) => a.rank - b.rank || (a.dueIn ?? 99) - (b.dueIn ?? 99));
};

/** Card header links keep their small look but get a 44px touch target on phones. */
const HEADER_LINK = "max-lg:-my-3 max-lg:min-h-11";
const rowLink = "outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2";

const Quiet = ({ children }: { children: string }) => (
    <p className="flex items-center gap-2 py-1.5 text-sm text-tertiary">
        <CheckCircle className="size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
        {children}
    </p>
);

const TodayList = ({ rows }: { rows: TodayRow[] }) => {
    const [expanded, setExpanded] = useState(false);
    if (!rows.length) return <Quiet>Nothing needs you right now.</Quiet>;
    const shown = expanded ? rows : rows.slice(0, MAX_TODAY);
    return (
        <>
            <ul className="-mx-2 flex flex-col">
                {shown.map((r) => (
                    <li key={r.id}>
                        <a href={r.href} className={cx("flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5", rowLink)}>
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                                <r.icon className="size-4" aria-hidden="true" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-baseline lg:gap-2.5">
                                <span className="truncate text-sm font-semibold text-primary lg:max-w-[62%] lg:shrink-0">{r.title}</span>
                                <span className="flex min-w-0 text-xs text-tertiary lg:flex-1 lg:text-sm">
                                    {r.meta && <span className="truncate">{r.meta}</span>}
                                    {r.meta && r.due && <span className="shrink-0 whitespace-pre"> · </span>}
                                    {r.due && <span className={cx("shrink-0", r.late && "font-medium text-error-primary")}>{r.meta ? r.due : cap(r.due)}</span>}
                                </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-secondary">
                                <span className="max-sm:sr-only">{r.action}</span>
                                <ChevronRight className="size-4" aria-hidden="true" />
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
            {rows.length > MAX_TODAY && (
                <Button color="link-color" size="sm" className="self-start max-lg:min-h-11" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Show fewer" : `Show ${rows.length - MAX_TODAY} more`}
                </Button>
            )}
        </>
    );
};

// ------------------------------------------------------------------------------------ flags and stock

/** The flags worth a first look: most severe first, newest first, and one of each kind before any repeats. */
const topFlags = (loc: LocationId, limit: number) => {
    const sorted = [...openFlags(loc)].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.detectedAt.localeCompare(a.detectedAt));
    const picked: Flag[] = [];
    const seen = new Set<string>();
    for (const f of sorted) {
        if (picked.length >= limit) break;
        if (seen.has(`${f.severity}:${f.type}`)) continue;
        seen.add(`${f.severity}:${f.type}`);
        picked.push(f);
    }
    for (const f of sorted) {
        if (picked.length >= limit) break;
        if (!picked.includes(f)) picked.push(f);
    }
    return picked.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
};

/** Supplies at or below their reorder point: the ones that are out first, then the least days of cover. */
const runningLow = (loc: LocationId, limit: number): StockRow[] =>
    stockRows(loc, "supply")
        .filter((r) => r.status === "out" || r.status === "low")
        .sort(
            (a, b) =>
                Number(b.status === "out") - Number(a.status === "out") ||
                (a.forecast?.daysOfCover ?? 9999) - (b.forecast?.daysOfCover ?? 9999) ||
                a.item.name.localeCompare(b.item.name),
        )
        .slice(0, limit);

// ------------------------------------------------------------------------------------ header actions

const MoreActions = ({ user, compact }: { user: User; compact?: boolean }) => (
    <Dropdown.Root>
        {compact ? (
            <Button color="secondary" size="md" iconLeading={DotsHorizontal} aria-label="More actions" className="min-h-11 lg:hidden" />
        ) : (
            <Button color="secondary" size="md" iconTrailing={ChevronDown} className="max-lg:hidden">
                More actions
            </Button>
        )}
        <Dropdown.Popover className="w-56">
            <Dropdown.Menu aria-label="More actions">
                <Dropdown.Item href={ROUTES.scan} icon={QrCode02}>
                    Scan a barcode
                </Dropdown.Item>
                {can(user, "orders.receive") && (
                    <Dropdown.Item href={ROUTES.receive} icon={Truck01}>
                        Receive a delivery
                    </Dropdown.Item>
                )}
                {canAssignTasks(user) && (
                    <Dropdown.Item href={ROUTES.tasks} icon={TASK_TYPE.general.icon}>
                        Assign a task
                    </Dropdown.Item>
                )}
            </Dropdown.Menu>
        </Dropdown.Popover>
    </Dropdown.Root>
);

// ------------------------------------------------------------------------------------ screen

/** What the screen shows. Normally read from the data layer; pass any part to replace it (stories, tests). */
export interface HomeData {
    numbers: HomeNumbers;
    today: TodayRow[];
    flags: Flag[];
    runningLow: StockRow[];
}

interface HomeScreenProps {
    location?: LocationId;
    /** Who is signed in. Defaults to the viewer. What they can do decides what the page shows. */
    user?: User;
    /** Replaces what the data layer would give for the current location, e.g. empty lists for the all-clear state. */
    data?: Partial<HomeData>;
}

/** Landing screen. Answers one question in ten seconds: what needs me today? */
export const HomeScreen = ({ location: initialLocation = "lynnfield", user: userProp, data }: HomeScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const [location, setLocation] = useState<LocationId>(initialLocation);

    const admin = isAdmin(user);
    const canFlags = can(user, "flags.view");
    const canOrder = can(user, "orders.create");
    const canSchedule = can(user, "counts.schedule");
    // Floor staff count, scan and receive. They are not offered the planning actions, so the page leads with their own list.
    const floor = !canSchedule && !canOrder;

    const computed = useMemo(() => {
        const places = admin ? locations.map((l) => l.id) : [location];
        return {
            numbers: Object.fromEntries(places.map((id) => [id, numbersFor(id)])) as Partial<Record<LocationId, HomeNumbers>>,
            low: runningLow(location, 5),
        };
    }, [admin, location]);

    const numbersAt = (loc: LocationId): HomeNumbers => (loc === location ? data?.numbers : undefined) ?? computed.numbers[loc] ?? numbersFor(loc);
    const numbers = numbersAt(location);
    const today = data?.today ?? buildToday(location, user);
    const attention = canFlags ? (data?.flags ?? topFlags(location, 3)) : [];
    const low = data?.runningLow ?? computed.low;
    const items = numberItems(numbers, user);
    const others = admin ? locations.filter((l) => l.id !== location) : [];

    // The situation in one sentence, leaving out whatever is at zero.
    const situation = [
        numbers.out > 0 && `${plural(numbers.out, "item")} out`,
        numbers.low > 0 && `${numbers.out > 0 ? numbers.low : plural(numbers.low, "item")} running low`,
        canFlags && numbers.highFlags > 0 && `${plural(numbers.highFlags, "high-severity flag")} to review`,
    ].filter((part): part is string => Boolean(part));
    const weekday = WEEKDAYS[toDate(TODAY).getUTCDay()];
    const place = locationName(location);
    const headline = floor
        ? today.length
            ? `${plural(today.length, "task")} for you at ${place} today.`
            : `Nothing assigned to you at ${place} today.`
        : situation.length
          ? `${sentence(situation)}.`
          : `Nothing is out or running low at ${place}, and no high-severity flags are open.`;

    const actions = floor ? (
        <>
            <Button href={ROUTES.scan} size="lg" iconLeading={QrCode02} className="max-lg:hidden">
                Scan
            </Button>
            <a
                href={ROUTES.scan}
                className="flex min-h-18 w-full items-center gap-4 rounded-xl bg-brand-400 px-5 py-4 text-ink shadow-xs outline-focus-ring transition duration-100 ease-linear hover:bg-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
            >
                <QrCode02 className="size-8 shrink-0" aria-hidden="true" />
                <span className="flex flex-1 flex-col">
                    <span className="text-lg font-semibold">Scan</span>
                    <span className="text-sm">Count, receive or log what you use</span>
                </span>
                <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
            </a>
        </>
    ) : (
        <>
            {canSchedule && (
                <Button href={ROUTES.counts} size="md" iconLeading={ClipboardCheck} className="max-lg:min-h-11 max-lg:flex-1">
                    Start a count
                </Button>
            )}
            {canOrder && (
                <Button
                    href={ROUTES.newOrder}
                    color={canSchedule ? "secondary" : "primary"}
                    size="md"
                    iconLeading={ShoppingCart01}
                    className="max-lg:min-h-11 max-lg:flex-1"
                >
                    Build order
                </Button>
            )}
            <MoreActions user={user} />
            <MoreActions user={user} compact />
        </>
    );

    const strip = items.length > 1 && <NumberStrip aria-label={`${place}, numbers that need action`} items={items} className={cx(admin && "lg:hidden")} />;

    const todayCard = (
        <Card className="flex flex-col gap-2">
            <CardHeader
                title="Today"
                actions={
                    <Button href={ROUTES.tasks} color="link-color" size="sm" className={HEADER_LINK}>
                        All tasks
                    </Button>
                }
            />
            <TodayList rows={today} />
        </Card>
    );

    const attentionCard = canFlags && (
        <Card className="flex flex-col gap-2">
            <CardHeader
                title="Needs attention"
                actions={
                    numbers.openFlags > 0 ? (
                        <Button href={ROUTES.flags} color="link-color" size="sm" className={HEADER_LINK}>
                            View all {numbers.openFlags}
                        </Button>
                    ) : undefined
                }
            />
            {attention.length ? (
                <ul className="-mx-2 flex flex-col">
                    {attention.map((f) => (
                        <li key={f.id}>
                            <a href={ROUTES.flag(f.id)} className={cx("flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5", rowLink)}>
                                <FlagSeverityBadge severity={f.severity} />
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{f.title}</span>
                                <span className="shrink-0 text-xs text-tertiary max-sm:hidden">{FLAG_TYPE_LABEL[f.type]}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <Quiet>{`No open flags at ${place}.`}</Quiet>
            )}
        </Card>
    );

    const lowCard = (
        <Card className="flex flex-col gap-2">
            <CardHeader
                title="Running low"
                actions={
                    canOrder ? (
                        <Button href={ROUTES.newOrder} color="link-color" size="sm" className={HEADER_LINK}>
                            Build order
                        </Button>
                    ) : (
                        <Button href={items[0]?.href ?? ROUTES.stock} color="link-color" size="sm" className={HEADER_LINK}>
                            Open stock
                        </Button>
                    )
                }
            />
            {low.length ? (
                <ul className="-mx-2 flex flex-col">
                    {low.map((r) => {
                        const onHand = r.level.fillLevel ? formatQty(r.level) : formatCount(r.level.onHand, unitOf(r.item.unit));
                        const cover = r.forecast?.daysOfCover;
                        // Nothing on the shelf already says there is no cover: the column stays empty for those rows.
                        const coverText = cover === undefined || r.status === "out" ? "" : `${plural(cover, "day")} left`;
                        return (
                            <li key={r.item.id}>
                                <a href={ROUTES.item(r.item.id)} className={cx("flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5", rowLink)}>
                                    <ItemThumb item={r.item} size="sm" />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-medium text-primary">{r.item.name}</span>
                                        <span className="truncate text-xs text-tertiary sm:hidden">{[onHand, coverText].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <span className="w-20 shrink-0 text-right text-sm text-secondary tabular-nums max-sm:hidden">{onHand}</span>
                                    <span className="w-22 shrink-0 text-right text-sm text-tertiary tabular-nums max-sm:hidden">{coverText}</span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Quiet>{`Nothing is running low at ${place}.`}</Quiet>
            )}
        </Card>
    );

    return (
        <AppShell activeUrl={ROUTES.home} location={location} onLocationChange={setLocation} user={user}>
            <PageContent className="lg:gap-6">
                <div className="flex flex-col gap-3">
                    <PageHeader
                        eyebrow={`${weekday}, ${formatDate(TODAY, true)} · ${place}`}
                        title={
                            <>
                                Good morning, <em>{firstName(user.name)}</em>
                            </>
                        }
                        description={headline}
                        actions={actions}
                    />
                    <SampleDataNote>
                        Items, par levels, open orders and some flags come from Meraki's spreadsheets. Counts, staff names, tasks and most on-hand numbers are
                        sample values.
                    </SampleDataNote>
                </div>

                {!floor && strip}
                {!floor && admin && (
                    <NumberComparison
                        aria-label="Both locations, numbers that need action"
                        className="max-lg:hidden"
                        rowHeader="Location"
                        columns={items.map((i) => i.label)}
                        rows={locations.map((l) => ({
                            id: l.id,
                            label: l.shortName,
                            current: l.id === location,
                            cells: numberItems(numbersAt(l.id), user, l.id === location),
                            action:
                                l.id === location ? (
                                    <Badge type="pill-color" color="brand" size="sm">
                                        Viewing
                                    </Badge>
                                ) : (
                                    <Button color="link-color" size="sm" aria-label={`Switch to ${l.shortName}`} onClick={() => setLocation(l.id)}>
                                        Switch
                                    </Button>
                                ),
                        }))}
                    />
                )}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
                    <div className="flex flex-col gap-4 lg:col-span-7 lg:gap-6">
                        {todayCard}
                        {attentionCard}
                    </div>
                    <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-6">
                        {floor && strip}
                        {lowCard}
                        {others.map((l) => (
                            <section key={l.id} aria-label={l.shortName} className="flex flex-col gap-2 lg:hidden">
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className="text-sm font-semibold text-primary">{l.shortName}</h2>
                                    <Button color="link-color" size="sm" className="min-h-11" onClick={() => setLocation(l.id)}>
                                        Switch to {l.shortName}
                                    </Button>
                                </div>
                                <NumberStrip items={numberItems(numbersAt(l.id), user, false)} />
                            </section>
                        ))}
                    </div>
                </div>

                {can(user, "activity.view") && (
                    <Button href={ROUTES.activity} color="link-gray" size="sm" iconTrailing={ArrowRight} className="self-start max-lg:min-h-11">
                        See all activity
                    </Button>
                )}
            </PageContent>
        </AppShell>
    );
};
