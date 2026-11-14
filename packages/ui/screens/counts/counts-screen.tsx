"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight, CalendarPlus01, CheckCircle, ClipboardCheck, EyeOff, PlayCircle, XClose } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { StatCard, StatGrid } from "@/components/meraki/stat-card";
import { AbcBadge, CountStatusBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, countSessions, items, locationName, stock, userById, users } from "@/data/inventory";
import type { AbcClass, CountSession, LocationId } from "@/data/types";
import { addDays, daysBetween, formatDate, relativeDays } from "@/engine/dates";
import { formatCount } from "@/engine/stock";
import { cx } from "@/utils/cx";

export interface CountsScreenProps {
    location?: LocationId;
}

const countedLines = (c: CountSession) => c.lines.filter((l) => l.counted !== undefined).length;

const variance = (c: CountSession) => {
    const done = c.lines.filter((l) => l.counted !== undefined);
    const off = done.filter((l) => l.counted !== l.expected);
    const net = done.reduce((sum, l) => sum + ((l.counted ?? 0) - l.expected), 0);
    return { off: off.length, net };
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const dueText = (c: CountSession) => {
    const days = daysBetween(TODAY, c.dueAt);
    if (days < 0) return `Overdue by ${formatCount(-days, "day")}`;
    return `Due ${relativeDays(c.dueAt, TODAY)}`;
};

const Person = ({ id, prefix }: { id?: string; prefix?: string }) => {
    const user = userById(id);
    if (!user) return null;
    return (
        <span className="flex min-w-0 items-center gap-2 text-sm text-secondary">
            <Avatar size="xs" initials={initials(user.name)} />
            <span className="truncate">
                {prefix && <span className="text-tertiary">{prefix} </span>}
                {user.name}
            </span>
        </span>
    );
};

const OpenCountCard = ({ session }: { session: CountSession }) => {
    const done = countedLines(session);
    const total = session.lines.length;
    const overdue = daysBetween(TODAY, session.dueAt) < 0;
    const started = session.status === "in-progress";
    return (
        <article
            className={cx(
                "flex flex-col gap-4 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-inset lg:p-5",
                overdue ? "ring-2 ring-error_subtle" : "ring-secondary",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-md font-semibold text-primary">{session.name}</h3>
                    <p className="text-sm text-tertiary">
                        {session.area} · {formatCount(total, "line")}
                    </p>
                </div>
                {overdue ? (
                    <Badge type="pill-color" color="error" size="sm">
                        Overdue
                    </Badge>
                ) : (
                    <CountStatusBadge status={session.status} />
                )}
            </div>

            <div className="flex flex-col gap-1.5">
                <ProgressBarBase value={done} max={Math.max(total, 1)} />
                <p className="text-sm text-tertiary">
                    <span className="font-semibold text-secondary tabular-nums">
                        {done} of {total}
                    </span>{" "}
                    lines counted
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <Person id={session.assignedTo} />
                <p className={cx("flex items-center gap-1.5 text-sm font-medium", overdue ? "text-error-primary" : "text-secondary")}>
                    {overdue && <AlertTriangle className="size-4" aria-hidden="true" />}
                    {dueText(session)}
                    <span className="font-normal text-tertiary">· {formatDate(session.dueAt)}</span>
                </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-secondary pt-3">
                {session.blind ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-tertiary">
                        <EyeOff className="size-4" aria-hidden="true" />
                        Blind count
                    </span>
                ) : (
                    <span className="text-xs font-medium text-tertiary">Expected quantities shown</span>
                )}
                <Button
                    size="md"
                    color={started || overdue ? "primary" : "secondary"}
                    href={ROUTES.count(session.id)}
                    iconLeading={PlayCircle}
                    className="min-h-11 lg:min-h-0"
                >
                    {started ? "Resume" : "Start"}
                </Button>
            </div>
        </article>
    );
};

const ReviewCard = ({ session }: { session: CountSession }) => {
    const v = variance(session);
    return (
        <article className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset lg:flex-row lg:items-center lg:gap-6 lg:p-5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-md font-semibold text-primary">{session.name}</h3>
                    <CountStatusBadge status={session.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Person id={session.assignedTo} prefix="Counted by" />
                    {session.submittedAt && <span className="text-sm text-tertiary">Submitted {relativeDays(session.submittedAt, TODAY)}</span>}
                </div>
            </div>
            <dl className="flex gap-6">
                <div>
                    <dt className="text-xs font-medium text-tertiary">Lines that differ</dt>
                    <dd className={cx("text-lg font-semibold tabular-nums", v.off > 0 ? "text-warning-primary" : "text-primary")}>
                        {v.off} of {session.lines.length}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs font-medium text-tertiary">Net difference</dt>
                    <dd className={cx("text-lg font-semibold tabular-nums", v.net < 0 ? "text-error-primary" : "text-primary")}>
                        {signed(v.net)} {Math.abs(v.net) === 1 ? "unit" : "units"}
                    </dd>
                </div>
            </dl>
            <Button size="md" color="primary" href={ROUTES.count(session.id)} iconTrailing={ArrowRight} className="max-lg:min-h-11 max-lg:w-full">
                Review
            </Button>
        </article>
    );
};

const CompletedRow = ({ session }: { session: CountSession }) => {
    const v = variance(session);
    return (
        <li className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:gap-6 lg:px-5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary">{session.name}</p>
                    <p className="text-sm text-tertiary">
                        Counted by {userById(session.assignedTo)?.name ?? "someone"} on {formatDate(session.submittedAt ?? session.dueAt)}, approved by{" "}
                        {userById(session.approvedBy)?.name ?? "a manager"}
                    </p>
                </div>
            </div>
            <p className="pl-8 text-sm text-secondary tabular-nums lg:pl-0">
                {v.off === 0 ? "All lines matched" : `${formatCount(v.off, "line")} adjusted, net ${signed(v.net)} units`}
            </p>
            <div className="pl-8 lg:pl-0">
                <Button size="sm" color="link-color" href={ROUTES.count(session.id)} className="min-h-11 lg:min-h-0">
                    View count
                </Button>
            </div>
        </li>
    );
};

const CADENCE: { abc: AbcClass; every: string; why: string }[] = [
    { abc: "A", every: "Every week", why: "Most of the spend, and the items that stop a service when they run out." },
    { abc: "B", every: "Every month", why: "Steady back-bar stock. Covered by the full count due by the 25th." },
    { abc: "C", every: "Every quarter", why: "Slow, low-cost items. Shelves rotate so each is covered once a quarter." },
];

const CadenceCard = () => {
    const supplies = items.filter((i) => i.kind === "supply");
    return (
        <Card className="flex flex-col gap-4">
            <CardHeader title="How often things get counted" description="Counts are scheduled by shelf, so a weekly count is one short walk." />
            <ul className="flex flex-col divide-y divide-secondary">
                {CADENCE.map((c) => (
                    <li key={c.abc} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                        <AbcBadge abc={c.abc} size="md" />
                        <div className="min-w-0 flex-1">
                            <p className="flex items-baseline justify-between gap-2 text-sm font-semibold text-primary">
                                {c.every}
                                <span className="font-medium text-tertiary tabular-nums">
                                    {formatCount(supplies.filter((i) => i.abc === c.abc).length, "item")}
                                </span>
                            </p>
                            <p className="text-sm text-tertiary">{c.why}</p>
                        </div>
                    </li>
                ))}
            </ul>
            <p className="text-xs text-tertiary">Classes are ranked from usage and sample unit costs. They will be re-ranked once invoice costs are loaded.</p>
        </Card>
    );
};

const SectionTitle = ({ title, count, description }: { title: string; count: number; description?: string }) => (
    <div className="flex flex-col gap-0.5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
            {title}
            <Badge type="modern" color="gray" size="sm">
                {count}
            </Badge>
        </h2>
        {description && <p className="text-sm text-tertiary">{description}</p>}
    </div>
);

const Empty = ({ children }: { children: string }) => (
    <p className="rounded-xl bg-primary px-4 py-6 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">{children}</p>
);

/** Counts home: what is due, what is waiting for a manager, and what has been closed. */
export const CountsScreen = ({ location: initialLocation = "lynnfield" }: CountsScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [added, setAdded] = useState<CountSession[]>([]);
    const [open, setOpen] = useState(false);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    const areas = [...new Set(stock.filter((s) => s.locationId === location).map((s) => s.area))];
    const team = users.filter((u) => u.locations.includes(location));
    const [area, setArea] = useState("");
    const [assignee, setAssignee] = useState("");
    const [dueAt, setDueAt] = useState(addDays(TODAY, 7));
    const [blind, setBlind] = useState(true);

    const sessions = [...added, ...countSessions].filter((c) => c.locationId === location);
    const active = sessions.filter((c) => c.status === "scheduled" || c.status === "in-progress").sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const review = sessions.filter((c) => c.status === "submitted");
    const completed = sessions.filter((c) => c.status === "approved");
    const overdue = active.filter((c) => daysBetween(TODAY, c.dueAt) < 0);
    const dueSoon = active.filter((c) => {
        const d = daysBetween(TODAY, c.dueAt);
        return d >= 0 && d <= 7;
    });
    const inProgress = active.find((c) => c.status === "in-progress");

    const selectedArea = areas.includes(area) ? area : (areas[0] ?? "");
    const selectedAssignee = team.some((u) => u.id === assignee) ? assignee : (team.find((u) => u.role === "front-desk")?.id ?? team[0]?.id ?? CURRENT_USER.id);

    const schedule = () => {
        const lines = stock.filter((s) => s.locationId === location && s.area === selectedArea).slice(0, 60);
        const session: CountSession = {
            id: `cs-new-${added.length + 1}`,
            locationId: location,
            area: selectedArea,
            name: selectedArea,
            status: "scheduled",
            assignedTo: selectedAssignee,
            dueAt,
            blind,
            lines: lines.map((s) => ({ itemId: s.itemId, expected: s.onHand })),
            isSample: true,
        };
        setAdded((a) => [session, ...a]);
        setConfirmation(`${selectedArea} count scheduled for ${userById(selectedAssignee)?.name ?? "the team"}, due ${formatDate(dueAt)}.`);
        setOpen(false);
    };

    return (
        <AppShell activeUrl={ROUTES.counts} location={location} onLocationChange={setLocation}>
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Stock <em>counts</em>
                        </>
                    }
                    description={`${locationName(location)}. Count a shelf, then a manager checks the differences before stock changes.`}
                    actions={
                        <>
                            <Button size="md" color="primary" iconLeading={CalendarPlus01} onClick={() => setOpen(true)} className="max-lg:hidden">
                                Schedule count
                            </Button>
                            <Button size="lg" color="secondary" iconLeading={CalendarPlus01} onClick={() => setOpen(true)} className="w-full lg:hidden">
                                Schedule count
                            </Button>
                        </>
                    }
                />

                {confirmation && (
                    <div role="status" className="flex items-start gap-3 rounded-xl bg-success-primary px-4 py-3 ring-1 ring-utility-green-200 ring-inset">
                        <CheckCircle className="mt-0.5 size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
                        <p className="flex-1 text-sm font-medium text-success-primary">{confirmation}</p>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => setConfirmation(null)}
                            className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-success-primary outline-focus-ring focus-visible:outline-2"
                        >
                            <XClose className="size-4" aria-hidden="true" />
                        </button>
                    </div>
                )}

                <StatGrid columns={4}>
                    <StatCard
                        label="Due this week"
                        value={dueSoon.length}
                        hint={dueSoon[0] ? `Next: ${dueSoon[0].name}` : "Nothing scheduled"}
                        icon={ClipboardCheck}
                    />
                    <StatCard
                        label="Overdue"
                        value={overdue.length}
                        tone={overdue.length ? "bad" : "good"}
                        hint={overdue[0] ? `${overdue[0].name}, ${formatCount(-daysBetween(TODAY, overdue[0].dueAt), "day")} late` : "All counts on time"}
                        icon={AlertTriangle}
                    />
                    <StatCard
                        label="Needs review"
                        value={review.length}
                        tone={review.length ? "warning" : "neutral"}
                        hint={review.length ? "Waiting for a manager" : "Nothing waiting"}
                        icon={CheckCircle}
                    />
                    <StatCard label="Approved" value={completed.length} hint="In the last 30 days" icon={CheckCircle} />
                </StatGrid>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
                    <div className="flex min-w-0 flex-col gap-8">
                        <section className="flex flex-col gap-3" aria-label="Due and in progress">
                            <SectionTitle title="Due and in progress" count={active.length} />
                            {active.length === 0 ? (
                                <Empty>No counts are scheduled here. Schedule one to get started.</Empty>
                            ) : (
                                <div className="grid gap-3 xl:grid-cols-2 xl:gap-4">
                                    {active.map((c) => (
                                        <OpenCountCard key={c.id} session={c} />
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="flex flex-col gap-3" aria-label="Needs review">
                            <SectionTitle
                                title="Needs review"
                                count={review.length}
                                description="Submitted counts. Stock on hand changes only after a manager approves."
                            />
                            {review.length === 0 ? <Empty>No counts are waiting for review.</Empty> : review.map((c) => <ReviewCard key={c.id} session={c} />)}
                        </section>

                        <section className="flex flex-col gap-3" aria-label="Completed">
                            <SectionTitle title="Completed" count={completed.length} />
                            {completed.length === 0 ? (
                                <Empty>No approved counts yet.</Empty>
                            ) : (
                                <Card padded={false}>
                                    <ul className="divide-y divide-secondary">
                                        {completed.map((c) => (
                                            <CompletedRow key={c.id} session={c} />
                                        ))}
                                    </ul>
                                </Card>
                            )}
                        </section>
                    </div>

                    <aside className="flex flex-col gap-4">
                        <CadenceCard />
                        <SampleDataNote>
                            Shelves and items come from Meraki&apos;s spreadsheets. Count sessions, staff and counted quantities are sample values.
                        </SampleDataNote>
                    </aside>
                </div>
            </PageContent>

            {inProgress && (
                <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 px-4 pb-3 lg:hidden">
                    <Button size="xl" color="primary" href={ROUTES.count(inProgress.id)} iconLeading={PlayCircle} className="w-full shadow-lg">
                        Resume {inProgress.name} · {countedLines(inProgress)} of {inProgress.lines.length}
                    </Button>
                </div>
            )}

            <ModalOverlay isOpen={open} onOpenChange={setOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Schedule a count">
                        <div className="flex flex-col gap-5 p-5 sm:p-6">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">Schedule a count</h2>
                                <p className="text-sm text-tertiary">{locationName(location)}. The counter gets a reminder the morning it is due.</p>
                            </div>
                            <NativeSelect
                                label="Area"
                                size="lg"
                                value={selectedArea}
                                onChange={(e) => setArea(e.currentTarget.value)}
                                options={areas.map((a) => ({ label: a, value: a }))}
                            />
                            <NativeSelect
                                label="Assigned to"
                                size="lg"
                                value={selectedAssignee}
                                onChange={(e) => setAssignee(e.currentTarget.value)}
                                options={team.map((u) => ({ label: u.name, value: u.id }))}
                            />
                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm font-medium text-secondary">Due date</span>
                                <input
                                    type="date"
                                    value={dueAt}
                                    min={TODAY}
                                    onChange={(e) => setDueAt(e.currentTarget.value || addDays(TODAY, 7))}
                                    className="h-11 w-full rounded-lg bg-primary px-3.5 text-md text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset focus-visible:ring-2 focus-visible:ring-brand"
                                />
                            </label>
                            <Toggle
                                size="md"
                                isSelected={blind}
                                onChange={setBlind}
                                label="Blind count"
                                hint="The counter does not see the expected quantity, so they write down what is on the shelf and not what the system says."
                            />
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button size="lg" color="secondary" onClick={() => setOpen(false)}>
                                    Cancel
                                </Button>
                                <Button size="lg" color="primary" onClick={schedule} isDisabled={!selectedArea}>
                                    Schedule count
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
