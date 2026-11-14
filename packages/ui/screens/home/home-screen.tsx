"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, CheckCircle, ChevronRight, ClipboardCheck, Edit05, Flag01, QrCode02, ShoppingCart01, Truck01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { StatCard, StatGrid } from "@/components/meraki/stat-card";
import { FlagSeverityBadge, RealDataBadge, SampleBadge } from "@/components/meraki/status-badges";
import { StockHealthBar } from "@/components/meraki/stock-health-bar";
import {
    CURRENT_USER,
    TODAY,
    activity,
    countSessions,
    locationName,
    locations,
    openFlags,
    orderTotal,
    purchaseOrders,
    reorderSuggestions,
    summary,
    userById,
    vendorById,
} from "@/data/inventory";
import type { Flag, LocationId, User } from "@/data/types";
import { daysBetween, formatDate, formatTime, relativeDays, toDate } from "@/engine/dates";
import { FLAG_TYPE_LABEL } from "@/engine/flags";
import { can, isAdmin } from "@/engine/permissions";
import { formatCount, formatCurrency, formatQty } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SEVERITY_RANK: Record<Flag["severity"], number> = { high: 0, medium: 1, low: 2 };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Items sold as "Each" have no sensible plural, so they read as units. */
const unitOf = (unit: string) => (unit.toLowerCase() === "each" ? "Unit" : unit);
const firstName = (name?: string) => name?.split(" ")[0] ?? "Someone";

/** The flags worth a manager's first look: most severe first, newest first, and one of each kind before any repeats. */
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

type TaskTone = "brand" | "warning" | "neutral" | "success";

interface Task {
    id: string;
    icon: FC<{ className?: string }>;
    tone: TaskTone;
    title: string;
    meta: string;
    href: string;
    /** Short label for what tapping the row does. */
    action: string;
}

const TASK_TONE: Record<TaskTone, string> = {
    brand: "bg-brand-secondary text-fg-brand-primary",
    warning: "bg-warning-secondary text-fg-warning-primary",
    neutral: "bg-secondary text-fg-quaternary",
    success: "bg-success-secondary text-fg-success-primary",
};

const buildTasks = (loc: LocationId, user: User): Task[] => {
    const floor = user.role === "front-desk" || user.role === "technician";
    const canSeeCosts = !floor;
    const counts = countSessions.filter((c) => c.locationId === loc);

    const countTasks: Task[] = counts
        .filter((c) => c.status === "in-progress" || (c.status === "scheduled" && toDate(c.dueAt).getTime() <= toDate(TODAY).getTime() + 3 * 86_400_000))
        .filter((c) => !floor || c.assignedTo === user.id)
        .map((c) => {
            const done = c.lines.filter((l) => l.counted !== undefined).length;
            const mine = c.assignedTo === user.id;
            const who = mine ? "Assigned to you" : `Assigned to ${userById(c.assignedTo)?.name ?? "nobody"}`;
            const overdue = c.dueAt < TODAY;
            return {
                id: c.id,
                icon: ClipboardCheck,
                tone: overdue ? "warning" : "brand",
                title: c.status === "in-progress" ? `${mine ? "Finish" : "In progress"}: ${c.name} count` : `${mine ? "Start" : "Due"}: ${c.name} count`,
                meta: `${c.status === "in-progress" ? `${done} of ${c.lines.length} items counted` : plural(c.lines.length, "item")} · ${who} · ${overdue ? `${plural(daysBetween(c.dueAt, TODAY), "day")} overdue` : `due ${relativeDays(c.dueAt, TODAY)}`}`,
                href: ROUTES.count(c.id),
                action: c.status === "in-progress" && mine ? "Continue" : mine ? "Start" : "View",
            } satisfies Task;
        });

    const reviewTasks: Task[] = floor
        ? []
        : counts
              .filter((c) => c.status === "submitted")
              .map((c) => {
                  const differ = c.lines.filter((l) => l.counted !== undefined && l.counted !== l.expected).length;
                  return {
                      id: `${c.id}-review`,
                      icon: CheckCircle,
                      tone: differ > 0 ? "warning" : "success",
                      title: `Review: ${c.name} count`,
                      meta: `Submitted by ${userById(c.assignedTo)?.name ?? "staff"} ${c.submittedAt ? relativeDays(c.submittedAt, TODAY) : ""} · ${differ > 0 ? `${plural(differ, "line")} differ from expected` : "all lines match"}`,
                      href: ROUTES.count(c.id),
                      action: "Review",
                  } satisfies Task;
              });

    const orders = purchaseOrders.filter((po) => po.locationId === loc);
    const approvalTasks: Task[] = floor
        ? []
        : orders
              .filter((po) => po.status === "awaiting-approval")
              .map((po) => ({
                  id: po.id,
                  icon: ShoppingCart01,
                  tone: can(user, "orders.approve") ? "warning" : "neutral",
                  title: can(user, "orders.approve") ? `Approve ${po.number}` : `${po.number} is waiting for approval`,
                  meta: `${vendorById(po.vendorId).name} · ${plural(po.lines.length, "line")}${canSeeCosts ? ` · about ${formatCurrency(orderTotal(po))} at sample costs` : ""} · sent ${relativeDays(po.createdAt, TODAY)}`,
                  href: ROUTES.order(po.id),
                  action: can(user, "orders.approve") ? "Approve" : "View",
              }));

    const drafts = orders.filter((po) => po.status === "draft");
    const draftTasks: Task[] =
        floor || !drafts.length
            ? []
            : [
                  {
                      id: "drafts",
                      icon: Edit05,
                      tone: "neutral",
                      title: `Finish ${plural(drafts.length, "draft order")}`,
                      meta: `${drafts.map((po) => vendorById(po.vendorId).name).join(", ")} · ${plural(
                          drafts.reduce((n, po) => n + po.lines.length, 0),
                          "line",
                      )}`,
                      href: ROUTES.orders,
                      action: "Open",
                  },
              ];

    const open = orders.filter((po) => po.status === "sent" || po.status === "partially-received");
    const openLines = open.reduce((n, po) => n + po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived === 0).length, 0);
    const oldest = [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    const deliveryTasks: Task[] = open.length
        ? [
              {
                  id: "deliveries",
                  icon: Truck01,
                  tone: "brand",
                  title: `Check in ${plural(open.length, "delivery", "deliveries")}`,
                  meta: `${plural(openLines, "line")} not marked received${oldest ? ` · oldest ordered ${formatDate(oldest.createdAt, true)}` : ""}`,
                  href: ROUTES.receive,
                  action: "Receive",
              },
          ]
        : [];

    if (isAdmin(user)) return [...approvalTasks, ...reviewTasks, ...countTasks, ...draftTasks, ...deliveryTasks];
    if (floor) return [...countTasks, ...deliveryTasks];
    return [...countTasks, ...reviewTasks, ...approvalTasks, ...draftTasks, ...deliveryTasks];
};

const TaskList = ({ tasks, emptyMessage }: { tasks: Task[]; emptyMessage: string }) =>
    tasks.length ? (
        <ul className="-mx-2 flex flex-col">
            {tasks.map((t) => (
                <li key={t.id}>
                    <a
                        href={t.href}
                        className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                    >
                        <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", TASK_TONE[t.tone])}>
                            <t.icon className="size-4.5" aria-hidden="true" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-sm font-semibold text-primary">{t.title}</span>
                            <span className="text-sm text-tertiary">{t.meta}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-secondary">
                            {t.action}
                            <ChevronRight className="size-4" aria-hidden="true" />
                        </span>
                    </a>
                </li>
            ))}
        </ul>
    ) : (
        <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-3 text-sm text-tertiary">
            <CheckCircle className="size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
            {emptyMessage}
        </p>
    );

const MiniStat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: "warning" | "bad" }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="truncate text-xs font-medium text-tertiary">{label}</dt>
        <dd
            className={cx(
                "flex items-center gap-1.5 text-lg font-semibold tabular-nums",
                tone === "bad" ? "text-error-primary" : tone === "warning" ? "text-warning-primary" : "text-primary",
            )}
        >
            {value}
        </dd>
    </div>
);

/** Owner only: both salons side by side, so one glance says which needs attention. */
const LocationComparison = ({ current, onSelect }: { current: LocationId; onSelect: (loc: LocationId) => void }) => (
    <Card padded={false} className="grid divide-y divide-secondary lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {locations.map((l) => {
            const s = summary(l.id);
            const viewing = l.id === current;
            return (
                <div key={l.id} className="flex flex-col gap-4 p-4 lg:p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-md font-semibold text-primary">{l.name}</h2>
                            {viewing && (
                                <Badge type="pill-color" color="brand" size="sm">
                                    Viewing
                                </Badge>
                            )}
                        </div>
                        {!viewing && (
                            <Button color="link-color" size="sm" onClick={() => onSelect(l.id)}>
                                Switch to {l.shortName}
                            </Button>
                        )}
                    </div>
                    <StockHealthBar location={l.id} compact size="sm" />
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <MiniStat label="Low or out" value={s.low + s.out} tone={s.out > 0 ? "bad" : s.low > 0 ? "warning" : undefined} />
                        <MiniStat
                            label="Open flags"
                            value={
                                <>
                                    {s.openFlags}
                                    {s.highFlags > 0 && <span className="text-xs font-medium text-error-primary">{s.highFlags} high</span>}
                                </>
                            }
                        />
                        <MiniStat label="Counts due" value={s.countsDue} />
                        <MiniStat
                            label="Stock value"
                            value={
                                <>
                                    {formatCurrency(s.stockValue)}
                                    <SampleBadge />
                                </>
                            }
                        />
                    </dl>
                </div>
            );
        })}
    </Card>
);

interface HomeScreenProps {
    location?: LocationId;
    /** Who is signed in. The layout changes by role: owners compare locations, floor staff see their tasks first. */
    user?: User;
}

/** Landing screen. Answers one question: what needs me today? */
export const HomeScreen = ({ location: initialLocation = "lynnfield", user = CURRENT_USER }: HomeScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const isDesktop = useBreakpoint("lg");

    const s = summary(location);
    // The two-salon comparison and approvals-first layout are for anyone with admin access, not only the owner.
    const isOwner = isAdmin(user);
    const floor = user.role === "front-desk" || user.role === "technician";
    const tasks = buildTasks(location, user);
    const attention = floor ? [] : topFlags(location, 5);
    const suggestions = reorderSuggestions(location);
    const reorder = suggestions.slice(0, 6);
    const reorderCost = suggestions.reduce((sum, r) => sum + r.qty * (r.item.unitCost ?? 0), 0);
    const recent = activity.filter((a) => a.locationId === location).slice(0, 5);

    const day = WEEKDAYS[toDate(TODAY).getUTCDay()];
    const headline = floor
        ? tasks.length
            ? `${plural(tasks.length, "task")} for you at ${locationName(location)} today.`
            : `Nothing assigned to you at ${locationName(location)} today.`
        : `${plural(s.out, "item")} out, ${s.low} running low and ${plural(s.highFlags, "high-severity flag")} to review.`;

    const stats = (
        <StatGrid>
            <StatCard
                label="Low or out"
                value={s.low + s.out}
                hint={`${s.out} out, ${s.low} low`}
                tone={s.out > 0 ? "bad" : s.low > 0 ? "warning" : "good"}
                icon={AlertTriangle}
                href={ROUTES.stock}
            />
            {floor ? (
                <StatCard label="To reorder" value={s.reorderLines} hint="Suggested for the next order" icon={ShoppingCart01} href={ROUTES.newOrder} />
            ) : (
                <StatCard
                    label="Open flags"
                    value={s.openFlags}
                    hint={s.highFlags > 0 ? `${s.highFlags} high severity` : "None high severity"}
                    tone={s.highFlags > 0 ? "bad" : "neutral"}
                    icon={Flag01}
                    href={ROUTES.flags}
                />
            )}
            <StatCard
                label="Order lines not received"
                value={s.openOrderLines}
                hint={`Across ${plural(s.openOrders, "open order")}`}
                tone={s.openOrderLines > 0 ? "warning" : "neutral"}
                icon={Truck01}
                href={ROUTES.receive}
            />
            <StatCard
                label="Counts due"
                value={s.countsDue}
                hint={
                    s.daysSinceLastCount === undefined
                        ? "No count submitted yet"
                        : s.daysSinceLastCount === 0
                          ? "Last count submitted today"
                          : `Last count ${plural(s.daysSinceLastCount, "day")} ago`
                }
                tone={s.countsDue > 0 ? "brand" : "neutral"}
                icon={ClipboardCheck}
                href={ROUTES.counts}
            />
        </StatGrid>
    );

    const todayCard = (
        <Card className="flex flex-col gap-3">
            <CardHeader
                title={isOwner ? "Waiting on you" : floor ? "Your tasks" : "Today"}
                description={
                    isOwner
                        ? "Approvals first, then what the team has in hand."
                        : floor
                          ? "Counts assigned to you and deliveries to check in."
                          : "Counts, approvals and deliveries that need a person today."
                }
            />
            <TaskList tasks={tasks} emptyMessage="Nothing waiting. Counts, orders and deliveries are up to date." />
        </Card>
    );

    const attentionCard = (
        <Card className="flex flex-col gap-3">
            <CardHeader
                title="Needs attention"
                description={`${plural(s.openFlags, "open flag")} at ${locationName(location)}. The most severe of each kind come first.`}
            />
            {attention.length ? (
                <ul className="-mx-2 flex flex-col">
                    {attention.map((f) => (
                        <li key={f.id}>
                            <a
                                href={ROUTES.flag(f.id)}
                                className="flex min-h-14 items-start gap-3 rounded-lg px-2 py-3 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                            >
                                <span className="flex min-w-0 flex-1 flex-col gap-1">
                                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <FlagSeverityBadge severity={f.severity} />
                                        <span className="text-xs font-medium text-tertiary">{FLAG_TYPE_LABEL[f.type]}</span>
                                        {f.fromRealData && <RealDataBadge />}
                                    </span>
                                    <span className="text-sm font-semibold text-primary">{f.title}</span>
                                    <span className="line-clamp-2 text-sm text-tertiary lg:line-clamp-1">{f.summary}</span>
                                </span>
                                <ChevronRight className="mt-1 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            </a>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-3 text-sm text-tertiary">
                    <CheckCircle className="size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    No open flags at {locationName(location)}.
                </p>
            )}
            {s.openFlags > attention.length && (
                <Button href={ROUTES.flags} color="link-color" size="sm" iconTrailing={ChevronRight} className="self-start">
                    View all {s.openFlags} flags
                </Button>
            )}
        </Card>
    );

    /** `narrow` stacks the vendor under the quantity, for phones and for the side column. */
    const reorderCard = (narrow: boolean) => (
        <Card className="flex flex-col gap-3">
            <CardHeader
                title="Reorder soon"
                description={
                    suggestions.length ? (
                        <>
                            {plural(suggestions.length, "item")} suggested. These {reorder.length} run out first.
                            {!floor && (
                                <span className="ml-1 inline-flex items-center gap-1.5 align-middle whitespace-nowrap">
                                    About {formatCurrency(reorderCost)} in all <SampleBadge />
                                </span>
                            )}
                        </>
                    ) : (
                        "Nothing needs reordering right now."
                    )
                }
                actions={
                    <Button href={ROUTES.newOrder} size="sm" iconLeading={ShoppingCart01}>
                        {floor ? "Request items" : "Build order"}
                    </Button>
                }
            />
            {reorder.length > 0 && (
                <ul className="-mx-2 flex flex-col">
                    {reorder.map((r) => {
                        const cover = r.forecast?.daysOfCover;
                        return (
                            <li key={r.item.id}>
                                <a
                                    href={ROUTES.item(r.item.id)}
                                    className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                >
                                    <ItemThumb item={r.item} />
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate text-sm font-semibold text-primary">{r.item.name}</span>
                                        <span className="truncate text-sm text-tertiary">
                                            <span
                                                className={cx(
                                                    "font-medium",
                                                    r.status === "out" ? "text-error-primary" : r.status === "low" ? "text-warning-primary" : "text-secondary",
                                                )}
                                            >
                                                {r.level.fillLevel ? formatQty(r.level) : `${formatQty(r.level, unitOf(r.item.unit))} on hand`}
                                            </span>
                                            {cover !== undefined && <> · {cover === 0 ? "no cover left" : `${plural(cover, "day")} of cover`}</>}
                                            {!narrow && <> · {r.vendor.name}</>}
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                                        <span className="text-sm font-semibold text-primary tabular-nums">Order {formatCount(r.qty, unitOf(r.item.unit))}</span>
                                        {narrow && <span className="text-xs text-tertiary">{r.vendor.name}</span>}
                                    </span>
                                </a>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );

    const healthCard = (
        <Card className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
            <div className="lg:w-56 lg:shrink-0">
                <CardHeader
                    title="Stock health"
                    description={`${s.supplies} supplies at ${locationName(location)}`}
                    actions={
                        <Button href={ROUTES.stock} color="link-color" size="sm" className="lg:hidden">
                            Open stock
                        </Button>
                    }
                />
            </div>
            <StockHealthBar location={location} className="min-w-0 flex-1" />
            <Button href={ROUTES.stock} color="secondary" size="sm" className="max-lg:hidden">
                Open stock
            </Button>
        </Card>
    );

    const activityCard = (
        <Card className="flex flex-col gap-3">
            <CardHeader
                title="Recent activity"
                actions={
                    <Button href={ROUTES.activity} color="link-color" size="sm">
                        View all
                    </Button>
                }
            />
            {recent.length ? (
                <ul className="flex flex-col gap-4">
                    {recent.map((a) => {
                        const who = userById(a.userId);
                        return (
                            <li key={a.id} className="flex items-start gap-3">
                                <Avatar size="sm" initials={initials(who?.name ?? "?")} />
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="text-sm text-tertiary">
                                        <span className="font-semibold text-primary">{who?.name ?? "Someone"}</span> {a.verb}{" "}
                                        {a.href ? (
                                            <a
                                                href={a.href}
                                                className="rounded-xs font-medium text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2"
                                            >
                                                {a.subject}
                                            </a>
                                        ) : (
                                            <span className="font-medium text-secondary">{a.subject}</span>
                                        )}
                                    </p>
                                    <p className="text-xs text-tertiary">
                                        {a.detail && (
                                            <span className={cx("first-letter:uppercase", a.tone === "warning" && "font-medium text-warning-primary")}>
                                                {a.detail} ·{" "}
                                            </span>
                                        )}
                                        <time dateTime={a.at}>
                                            {relativeDays(a.at, TODAY)}, {formatTime(a.at)}
                                        </time>
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="rounded-lg bg-secondary px-3 py-3 text-sm text-tertiary">
                    No activity recorded at {locationName(location)} yet. Counts, adjustments and orders will appear here.
                </p>
            )}
        </Card>
    );

    const scanButton = (
        <a
            href={ROUTES.scan}
            className="flex min-h-18 items-center gap-4 rounded-xl bg-brand-400 px-5 py-4 text-ink shadow-xs outline-focus-ring transition duration-100 ease-linear hover:bg-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            <QrCode02 className="size-8 shrink-0" aria-hidden="true" />
            <span className="flex flex-1 flex-col">
                <span className="text-lg font-semibold">Scan</span>
                <span className="text-sm">Scan a barcode to count, receive or log use</span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
        </a>
    );

    return (
        <AppShell activeUrl={ROUTES.home} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    eyebrow={`${day}, ${formatDate(TODAY, true)} · ${locationName(location)}`}
                    title={
                        <>
                            Good morning, <em>{firstName(user.name)}</em>
                        </>
                    }
                    description={headline}
                    actions={
                        isDesktop && !floor ? (
                            <>
                                <Button href={ROUTES.scan} color="secondary" size="md" iconLeading={QrCode02}>
                                    Scan
                                </Button>
                                <Button href={ROUTES.counts} size="md" iconLeading={ClipboardCheck}>
                                    Start a count
                                </Button>
                            </>
                        ) : undefined
                    }
                />

                {floor ? (
                    <>
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                            <div className="lg:col-span-1">{scanButton}</div>
                            <div className="lg:col-span-2">{todayCard}</div>
                        </div>
                        {stats}
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
                            <div className="flex flex-col gap-4 lg:col-span-2 lg:gap-6">
                                {reorderCard(!isDesktop)}
                                {healthCard}
                            </div>
                            <div className="flex flex-col gap-4 lg:gap-6">{activityCard}</div>
                        </div>
                    </>
                ) : (
                    <>
                        {isOwner && <LocationComparison current={location} onSelect={setLocation} />}
                        {stats}
                        {isDesktop ? (
                            <>
                                {!isOwner && healthCard}
                                <div className="grid grid-cols-3 items-start gap-6">
                                    <div className="col-span-2 flex flex-col gap-6">
                                        {isOwner && todayCard}
                                        {attentionCard}
                                        {!isOwner && reorderCard(false)}
                                    </div>
                                    <div className="flex flex-col gap-6">
                                        {isOwner ? reorderCard(true) : todayCard}
                                        {activityCard}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {todayCard}
                                {attentionCard}
                                {reorderCard(true)}
                                {!isOwner && healthCard}
                                {activityCard}
                            </div>
                        )}
                    </>
                )}

                <SampleDataNote>
                    Items, par levels, open orders and flags marked "From your sheets" come from Meraki's spreadsheets. Counts, staff names, most on-hand
                    numbers and all costs are sample values.
                </SampleDataNote>
            </PageContent>
        </AppShell>
    );
};
