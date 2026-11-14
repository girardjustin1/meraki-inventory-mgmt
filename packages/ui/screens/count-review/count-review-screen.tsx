"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle, EyeOff, Lock01, RefreshCcw01 } from "@untitledui/icons";
import { Table, TableCard } from "@/components/application/table/table";
import { Tabs } from "@/components/application/tabs/tabs";
import { Avatar } from "@/components/base/avatar/avatar";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote, initials } from "@/components/meraki/app-shell";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { shelfLabel } from "@/components/meraki/scan-lookup";
import { CountStatusBadge, SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, countSessions, getCountSession, getItem, getStock, locationName, userById, users } from "@/data/inventory";
import type { CountSession, Item, StockLevel, User } from "@/data/types";
import { formatDate, formatTime, relativeDays } from "@/engine/dates";
import { FLAG_THRESHOLDS } from "@/engine/flags";
import { formatCurrency, variancePct } from "@/engine/stock";
import { cx } from "@/utils/cx";

export interface CountReviewScreenProps {
    sessionId?: string;
    /** The person reviewing. They cannot approve a count they made themselves. */
    user?: User;
}

type TabId = "unmatched" | "matched" | "uncounted";
type Decision = "accepted" | "recount";

interface Row {
    item: Item;
    level?: StockLevel;
    expected: number;
    counted?: number;
    diff: number;
    pct: number;
    /** Variance at unit cost, in dollars. Sample costs for now. */
    value: number;
    note?: string;
    /** Far enough out to raise a count-variance flag when accepted. */
    overThreshold: boolean;
    tab: TabId;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));
const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${formatCurrency(Math.abs(n), true)}`;
const signedPct = (p: number) => `${p > 0 ? "+" : ""}${Math.round(p * 100)}%`;
const units = (n: number) => (Math.abs(n) === 1 ? "unit" : "units");
const varianceTone = (diff: number) => (diff < 0 ? "text-error-primary" : diff > 0 ? "text-warning-primary" : "text-tertiary");

const TAB_HELP: Record<TabId, string> = {
    unmatched:
        "The amount counted was more or less than the system expected. Accept the count to correct stock on hand, or send the line back for a second count.",
    matched: "The amount counted equals what the system expected. Accepting records that the shelf was checked.",
    uncounted: "These lines were left without a count. Stock on hand stays as it is until someone counts them.",
};

const buildRows = (session: CountSession): Row[] =>
    session.lines.flatMap((line) => {
        const item = getItem(line.itemId);
        if (!item) return [];
        const diff = line.counted === undefined ? 0 : line.counted - line.expected;
        const pct = line.counted === undefined ? 0 : variancePct(line.expected, line.counted);
        return [
            {
                item,
                level: getStock(line.itemId, session.locationId),
                expected: line.expected,
                counted: line.counted,
                diff,
                pct,
                value: diff * (item.unitCost ?? 0),
                note: line.note,
                overThreshold: Math.abs(pct) >= FLAG_THRESHOLDS.countVariancePct && Math.abs(diff) >= FLAG_THRESHOLDS.countVarianceMinUnits,
                tab: line.counted === undefined ? "uncounted" : diff === 0 ? "matched" : "unmatched",
            } satisfies Row,
        ];
    });

const Variance = ({ row }: { row: Row }) =>
    row.counted === undefined ? (
        <span className="text-tertiary">Not counted</span>
    ) : (
        <span className={cx("font-semibold tabular-nums", varianceTone(row.diff))}>
            {row.diff === 0 ? "0" : `${signed(row.diff)} ${units(row.diff)}`}
            {row.diff !== 0 && <span className="font-medium"> ({signedPct(row.pct)})</span>}
        </span>
    );

interface DecisionProps {
    row: Row;
    decision?: Decision;
    locked: boolean;
    readOnly: boolean;
    onDecide: (decision: Decision | undefined) => void;
    stacked?: boolean;
}

const DecisionControl = ({ row, decision, locked, readOnly, onDecide, stacked }: DecisionProps) => {
    if (decision) {
        return (
            <div className={cx("flex items-center gap-2", stacked ? "justify-between" : "justify-end")}>
                <Badge type="pill-color" size="md" color={decision === "accepted" ? "success" : "warning"}>
                    {decision === "accepted" ? "Count accepted" : "Recount requested"}
                </Badge>
                {!readOnly && (
                    <Button
                        size="sm"
                        color="tertiary"
                        className="min-h-11 lg:min-h-0"
                        onClick={() => onDecide(undefined)}
                        aria-label={`Undo the decision for ${row.item.name}`}
                    >
                        Undo
                    </Button>
                )}
            </div>
        );
    }
    if (readOnly) return <span className="text-sm text-tertiary">No decision</span>;
    return (
        <div className={cx("flex gap-2", stacked ? "*:flex-1" : "justify-end")}>
            {row.counted !== undefined && (
                <Button
                    size="sm"
                    color="secondary"
                    className="min-h-11 lg:min-h-0"
                    isDisabled={locked}
                    onClick={() => onDecide("accepted")}
                    aria-label={`Accept the count for ${row.item.name}`}
                >
                    {stacked ? "Accept count" : "Accept"}
                </Button>
            )}
            {row.tab !== "matched" && (
                <Button
                    size="sm"
                    color="tertiary"
                    className="min-h-11 lg:min-h-0"
                    isDisabled={locked}
                    onClick={() => onDecide("recount")}
                    aria-label={`Request a recount of ${row.item.name}`}
                >
                    {stacked ? (row.counted === undefined ? "Request count" : "Request recount") : "Recount"}
                </Button>
            )}
        </div>
    );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-xs font-medium text-tertiary">{label}</dt>
        <dd className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary">{children}</dd>
    </div>
);

const PersonFact = ({ user }: { user?: User }) =>
    user ? (
        <>
            <Avatar size="xs" initials={initials(user.name)} />
            <span className="truncate">{user.name}</span>
        </>
    ) : (
        <span className="text-tertiary">Not yet</span>
    );

/**
 * Manager review of a submitted count.
 * Expected quantities appear here for the first time. Nothing changes on hand until "Approve count",
 * and the person who counted cannot be the person who approves.
 */
export const CountReviewScreen = ({ sessionId = "cs-lyn-closet", user = CURRENT_USER }: CountReviewScreenProps) => {
    const session = getCountSession(sessionId) ?? (countSessions[0] as CountSession);
    const rows = buildRows(session);
    const counter = userById(session.assignedTo);
    const alreadyApproved = session.status === "approved";

    const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
        alreadyApproved ? Object.fromEntries(rows.filter((r) => r.counted !== undefined).map((r) => [r.item.id, "accepted" as const])) : {},
    );
    const [approvedNow, setApprovedNow] = useState(false);
    const [tab, setTab] = useState<TabId>(rows.some((r) => r.tab === "unmatched") ? "unmatched" : "matched");

    const approved = alreadyApproved || approvedNow;
    const ownCount = user.id === session.assignedTo;
    const hasRole = user.role === "owner" || user.role === "manager";
    const submitted = session.status === "submitted" || alreadyApproved;
    const locked = ownCount || !hasRole || !submitted;
    const reviewer = alreadyApproved ? userById(session.approvedBy) : locked ? undefined : user;
    const others = users.filter((u) => u.id !== user.id && (u.role === "owner" || u.role === "manager") && u.locations.includes(session.locationId));

    const byTab: Record<TabId, Row[]> = {
        unmatched: rows.filter((r) => r.tab === "unmatched"),
        matched: rows.filter((r) => r.tab === "matched"),
        uncounted: rows.filter((r) => r.tab === "uncounted"),
    };
    const needDecision = rows.filter((r) => r.counted !== undefined && !decisions[r.item.id]);
    const undecidedMatched = byTab.matched.filter((r) => !decisions[r.item.id]);
    const accepted = rows.filter((r) => decisions[r.item.id] === "accepted");
    const changed = accepted.filter((r) => r.diff !== 0);
    const flagsRaised = accepted.filter((r) => r.overThreshold);
    const recounts = rows.filter((r) => decisions[r.item.id] === "recount");

    const counted = rows.filter((r) => r.counted !== undefined);
    const netUnits = counted.reduce((sum, r) => sum + r.diff, 0);
    const netValue = counted.reduce((sum, r) => sum + r.value, 0);
    const over = counted.filter((r) => r.overThreshold);

    const decide = (id: string, decision: Decision | undefined) =>
        setDecisions((all) => {
            const next = { ...all };
            if (decision) next[id] = decision;
            else delete next[id];
            return next;
        });
    const acceptAllMatched = () => setDecisions((all) => ({ ...all, ...Object.fromEntries(undecidedMatched.map((r) => [r.item.id, "accepted" as const])) }));

    const canApprove = !locked && !approved && needDecision.length === 0 && counted.length > 0;
    const approveHint = approved
        ? null
        : ownCount
          ? "You counted this, so someone else has to approve it."
          : !hasRole
            ? "Only a manager or the owner can approve a count."
            : !submitted
              ? "This count has not been submitted yet."
              : needDecision.length > 0
                ? `${needDecision.length} ${needDecision.length === 1 ? "line still needs" : "lines still need"} a decision.`
                : "Every line has a decision. Approving posts the adjustments.";

    const tabs: { id: TabId; label: string }[] = [
        { id: "unmatched", label: `Unmatched ${byTab.unmatched.length}` },
        { id: "matched", label: `Matched ${byTab.matched.length}` },
        { id: "uncounted", label: `Uncounted ${byTab.uncounted.length}` },
    ];

    const approveButton = (className?: string) => (
        <Button
            size="lg"
            color="primary"
            iconLeading={locked ? Lock01 : CheckCircle}
            isDisabled={!canApprove}
            onClick={() => setApprovedNow(true)}
            className={className}
        >
            Approve count
        </Button>
    );

    return (
        <AppShell activeUrl={ROUTES.counts} location={session.locationId} user={user}>
            <PageContent>
                <PageHeader
                    eyebrow={
                        <a
                            href={ROUTES.counts}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2 lg:min-h-0"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Counts
                        </a>
                    }
                    title={
                        <>
                            {session.name} <em>count</em>
                        </>
                    }
                    description={`${locationName(session.locationId)} · ${session.area} · ${rows.length} lines`}
                    actions={
                        !approved && (
                            <div className="hidden flex-col items-end gap-1.5 lg:flex">
                                {approveButton()}
                                <p className="text-sm text-tertiary">{approveHint}</p>
                            </div>
                        )
                    }
                />

                {approved && (
                    <div
                        role="status"
                        className="flex flex-col gap-3 rounded-xl bg-success-primary p-4 ring-1 ring-utility-green-200 ring-inset lg:flex-row lg:items-center lg:p-5"
                    >
                        <CheckCircle className="size-6 shrink-0 text-fg-success-primary" aria-hidden="true" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <p className="text-md font-semibold text-primary">
                                {alreadyApproved ? `Approved by ${reviewer?.name ?? "a manager"}` : "Count approved"}
                            </p>
                            <p className="text-sm text-secondary">
                                {alreadyApproved ? `Counted on ${formatDate(session.submittedAt ?? session.dueAt)}. ` : ""}
                                {changed.length} on-hand {changed.length === 1 ? "value" : "values"} changed and {flagsRaised.length}{" "}
                                {flagsRaised.length === 1 ? "flag was" : "flags were"} raised.{" "}
                                {recounts.length > 0
                                    ? `${recounts.length} ${recounts.length === 1 ? "line went" : "lines went"} back to ${counter?.name ?? "the counter"} for a recount.`
                                    : `${accepted.length - changed.length} lines matched and were confirmed.`}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {flagsRaised.length > 0 && (
                                <Button size="md" color="secondary" href={ROUTES.flags} className="min-h-11 lg:min-h-0">
                                    View flags
                                </Button>
                            )}
                            {!alreadyApproved && (
                                <Button size="md" color="tertiary" className="min-h-11 lg:min-h-0" onClick={() => setApprovedNow(false)}>
                                    Undo approval
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                {!approved && (ownCount || !hasRole) && (
                    <div className="flex items-start gap-3 rounded-xl bg-warning-primary p-4 ring-1 ring-utility-yellow-200 ring-inset">
                        <Lock01 className="mt-0.5 size-5 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                        <div className="flex flex-col gap-0.5">
                            <p className="text-md font-semibold text-primary">
                                {ownCount ? "You counted this, so you cannot approve it" : "Your role can view this count but not approve it"}
                            </p>
                            <p className="text-sm text-secondary">
                                A count is checked by a second person before stock on hand changes.{" "}
                                {others.length > 0 ? `${others.map((u) => u.name).join(" or ")} can review it.` : "Ask the owner to review it."}
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
                    <Card className="flex flex-col gap-4">
                        <CardHeader title="Who and when" actions={<CountStatusBadge status={approvedNow ? "approved" : session.status} />} />
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                            <Fact label="Counted by">
                                <PersonFact user={counter} />
                            </Fact>
                            <Fact label={approved || locked ? "Reviewed by" : "Reviewing now"}>
                                <PersonFact user={reviewer} />
                            </Fact>
                            <Fact label="Submitted">
                                {session.submittedAt ? (
                                    <span>
                                        {formatDate(session.submittedAt)}, {formatTime(session.submittedAt)}
                                        <span className="font-normal text-tertiary"> · {relativeDays(session.submittedAt, TODAY)}</span>
                                    </span>
                                ) : (
                                    <span className="text-tertiary">Not submitted</span>
                                )}
                            </Fact>
                            <Fact label="Blind count">
                                {session.blind && <EyeOff className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />}
                                <span>{session.blind ? "Yes, expected was hidden" : "No, expected was shown"}</span>
                            </Fact>
                        </dl>
                    </Card>

                    <Card className="flex flex-col gap-4">
                        <CardHeader title="Variance summary" description="Counted minus expected, across every counted line." />
                        <dl className="grid grid-cols-3 gap-3">
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs font-medium text-tertiary">Net units</dt>
                                <dd
                                    className={cx(
                                        "text-xl font-semibold tabular-nums xl:text-display-xs",
                                        netUnits === 0 ? "text-primary" : varianceTone(netUnits),
                                    )}
                                >
                                    {signed(netUnits)}
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="flex items-center gap-1.5 text-xs font-medium text-tertiary">Net value</dt>
                                <dd
                                    className={cx(
                                        "text-xl font-semibold tabular-nums xl:text-display-xs",
                                        netValue === 0 ? "text-primary" : varianceTone(netValue),
                                    )}
                                >
                                    {signedMoney(netValue)}
                                </dd>
                                <dd>
                                    <SampleBadge label="Sample costs" />
                                </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                                <dt className="text-xs font-medium text-tertiary">Over threshold</dt>
                                <dd
                                    className={cx("text-xl font-semibold tabular-nums xl:text-display-xs", over.length ? "text-error-primary" : "text-primary")}
                                >
                                    {over.length} <span className="text-sm font-medium text-tertiary">of {counted.length}</span>
                                </dd>
                            </div>
                        </dl>
                        <p className="text-sm text-tertiary">
                            A line off by {Math.round(FLAG_THRESHOLDS.countVariancePct * 100)}% or more, and by at least {FLAG_THRESHOLDS.countVarianceMinUnits}{" "}
                            units, raises a flag when its count is accepted. At {Math.round(FLAG_THRESHOLDS.countVarianceHighPct * 100)}% the flag is high
                            severity.
                        </p>
                    </Card>
                </div>

                <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(key as TabId)} className="gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Tabs.List aria-label="Lines by result" type="button-border" size="sm" fullWidth className="max-lg:w-full">
                            {tabs.map((t) => (
                                <Tabs.Item key={t.id} id={t.id} className="min-h-11 min-w-0 lg:px-4">
                                    {t.label}
                                </Tabs.Item>
                            ))}
                        </Tabs.List>
                        {!approved && (
                            <Button
                                size="md"
                                color="secondary"
                                className="min-h-11"
                                isDisabled={locked || undecidedMatched.length === 0}
                                onClick={acceptAllMatched}
                            >
                                {undecidedMatched.length === 0 && byTab.matched.length > 0
                                    ? "All matched lines accepted"
                                    : `Accept all matched (${undecidedMatched.length})`}
                            </Button>
                        )}
                    </div>

                    {tabs.map((t) => {
                        const list = byTab[t.id];
                        return (
                            <Tabs.Panel key={t.id} id={t.id} className="flex flex-col gap-3">
                                <p className="text-sm text-tertiary">{TAB_HELP[t.id]}</p>

                                {list.length === 0 ? (
                                    <p className="rounded-xl bg-primary px-4 py-8 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">
                                        {t.id === "unmatched"
                                            ? "Every counted line matched what the system expected."
                                            : t.id === "uncounted"
                                              ? "Every line was counted."
                                              : "No lines matched."}
                                    </p>
                                ) : (
                                    <>
                                        {/* Desktop: table */}
                                        <TableCard.Root size="sm" className="hidden xl:block">
                                            <Table aria-label={`${t.label} lines`}>
                                                <Table.Header>
                                                    <Table.Head id="item" label="Item" isRowHeader className="w-full" />
                                                    <Table.Head id="expected" label="Expected" className="px-3" />
                                                    <Table.Head id="counted" label="Counted" className="px-3" />
                                                    <Table.Head id="variance" label="Variance" className="px-3" />
                                                    <Table.Head
                                                        id="value"
                                                        label="Value"
                                                        className="px-3"
                                                        tooltip="Variance at unit cost. Unit costs are sample values until invoices are loaded."
                                                    >
                                                        <SampleBadge />
                                                    </Table.Head>
                                                    <Table.Head id="note" label="Note" className="max-[1400px]:hidden" />
                                                    <Table.Head id="decision" label="Decision" />
                                                </Table.Header>
                                                <Table.Body items={list.map((r) => ({ ...r, id: r.item.id }))}>
                                                    {(row) => (
                                                        <Table.Row id={row.id}>
                                                            <Table.Cell>
                                                                <div className="flex min-w-52 items-center gap-3">
                                                                    <ItemThumb item={row.item} />
                                                                    <div className="min-w-0">
                                                                        <a
                                                                            href={ROUTES.item(row.item.id)}
                                                                            className="rounded text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2"
                                                                        >
                                                                            {row.item.name}
                                                                        </a>
                                                                        <p className="text-sm text-tertiary">
                                                                            {shelfLabel(row.level)}
                                                                            {row.overThreshold && (
                                                                                <span className="font-medium text-error-primary"> · Over threshold</span>
                                                                            )}
                                                                        </p>
                                                                        {row.note && (
                                                                            <p className="text-sm text-secondary min-[1400px]:hidden">Note: {row.note}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </Table.Cell>
                                                            <Table.Cell className="px-3 whitespace-nowrap tabular-nums">{num(row.expected)}</Table.Cell>
                                                            <Table.Cell className="px-3 font-semibold whitespace-nowrap text-primary tabular-nums">
                                                                {row.counted === undefined ? "–" : num(row.counted)}
                                                            </Table.Cell>
                                                            <Table.Cell className="px-3 whitespace-nowrap">
                                                                <Variance row={row} />
                                                            </Table.Cell>
                                                            <Table.Cell
                                                                className={cx(
                                                                    "px-3 whitespace-nowrap tabular-nums",
                                                                    row.value !== 0 && varianceTone(row.value),
                                                                )}
                                                            >
                                                                {row.counted === undefined ? "–" : signedMoney(row.value)}
                                                            </Table.Cell>
                                                            <Table.Cell className="max-w-48 max-[1400px]:hidden">
                                                                {row.note ?? <span className="whitespace-nowrap text-quaternary">No note</span>}
                                                            </Table.Cell>
                                                            <Table.Cell className="whitespace-nowrap">
                                                                <DecisionControl
                                                                    row={row}
                                                                    decision={decisions[row.item.id]}
                                                                    locked={locked}
                                                                    readOnly={approved}
                                                                    onDecide={(d) => decide(row.item.id, d)}
                                                                />
                                                            </Table.Cell>
                                                        </Table.Row>
                                                    )}
                                                </Table.Body>
                                            </Table>
                                        </TableCard.Root>

                                        {/* Phone: one card per line */}
                                        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 xl:hidden">
                                            {list.map((row) => (
                                                <li
                                                    key={row.item.id}
                                                    className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset"
                                                >
                                                    <a
                                                        href={ROUTES.item(row.item.id)}
                                                        className="flex items-center gap-3 rounded-lg outline-focus-ring focus-visible:outline-2"
                                                    >
                                                        <ItemThumb item={row.item} size="lg" />
                                                        <span className="min-w-0">
                                                            <span className="block text-md font-semibold text-primary">{row.item.name}</span>
                                                            <span className="block text-sm text-tertiary">{shelfLabel(row.level)}</span>
                                                        </span>
                                                    </a>
                                                    <dl className="grid grid-cols-3 gap-2 rounded-lg bg-secondary p-3">
                                                        <div>
                                                            <dt className="text-xs font-medium text-tertiary">Expected</dt>
                                                            <dd className="text-lg font-semibold text-secondary tabular-nums">{num(row.expected)}</dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-xs font-medium text-tertiary">Counted</dt>
                                                            <dd className="text-lg font-semibold text-primary tabular-nums">
                                                                {row.counted === undefined ? "–" : num(row.counted)}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt className="text-xs font-medium text-tertiary">Variance</dt>
                                                            <dd
                                                                className={cx(
                                                                    "text-lg font-semibold tabular-nums",
                                                                    row.counted === undefined ? "text-tertiary" : varianceTone(row.diff),
                                                                )}
                                                            >
                                                                {row.counted === undefined ? "–" : signed(row.diff)}
                                                                {row.diff !== 0 && <span className="text-sm font-medium"> ({signedPct(row.pct)})</span>}
                                                            </dd>
                                                        </div>
                                                    </dl>
                                                    {row.counted !== undefined && row.diff !== 0 && (
                                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
                                                            <span className={cx("font-semibold tabular-nums", varianceTone(row.value))}>
                                                                {signedMoney(row.value)}
                                                            </span>
                                                            at unit cost <SampleBadge />
                                                            {row.overThreshold && (
                                                                <Badge type="pill-color" color="error" size="sm">
                                                                    Over threshold
                                                                </Badge>
                                                            )}
                                                        </p>
                                                    )}
                                                    {row.note && <p className="text-sm text-secondary">Note: {row.note}</p>}
                                                    <DecisionControl
                                                        row={row}
                                                        decision={decisions[row.item.id]}
                                                        locked={locked}
                                                        readOnly={approved}
                                                        onDecide={(d) => decide(row.item.id, d)}
                                                        stacked
                                                    />
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </Tabs.Panel>
                        );
                    })}
                </Tabs>

                {recounts.length > 0 && !approved && (
                    <p className="flex items-start gap-2 text-sm text-tertiary">
                        <RefreshCcw01 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {recounts.length} {recounts.length === 1 ? "line goes" : "lines go"} back to {counter?.name ?? "the counter"} for a second blind count
                        when you approve. Those lines keep their current on-hand value until then.
                    </p>
                )}

                <SampleDataNote>
                    Items and shelves come from Meraki&apos;s spreadsheets. This count, the counted quantities, staff names and unit costs are sample values.
                </SampleDataNote>
            </PageContent>

            {!approved && (
                <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-secondary bg-primary/95 px-4 py-3 backdrop-blur after:absolute after:inset-x-0 after:top-full after:h-6 after:bg-primary lg:hidden">
                    <p className="mb-2 text-center text-sm text-tertiary">{approveHint}</p>
                    {approveButton("w-full")}
                </div>
            )}
        </AppShell>
    );
};
