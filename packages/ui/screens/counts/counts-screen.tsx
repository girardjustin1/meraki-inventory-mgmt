"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CalendarDate, ChevronDown, ClipboardCheck, Download01, Lock01, Plus, UserCheck01, XCircle } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import type { BulkAction } from "@/components/meraki/bulk-action-bar";
import { BulkActionBar } from "@/components/meraki/bulk-action-bar";
import { downloadCsv } from "@/components/meraki/collection-export";
import type { ActiveFilters, ToolbarFilter, ToolbarSort, ToolbarView } from "@/components/meraki/data-table-toolbar";
import { DataTableToolbar, passesFilters } from "@/components/meraki/data-table-toolbar";
import type { ListColumn, ListNoticeContent } from "@/components/meraki/list-table";
import {
    BULK_BAR_OVER_HEADER,
    ListCards,
    ListEmpty,
    ListNotice,
    ListTable,
    RowLink,
    SelectModeRow,
    norm,
    plural,
    skipped,
    useListSelection,
} from "@/components/meraki/list-table";
import { AbcBadge, COUNT_STATUS, CountStatusBadge } from "@/components/meraki/status-badges";
import { TODAY, countSessions, items, locationName, stock, userById, users } from "@/data/inventory";
import type { AbcClass, CountSession, CountStatus, LocationId, User } from "@/data/types";
import { addDays, daysBetween, formatDate, relativeDays } from "@/engine/dates";
import { can } from "@/engine/permissions";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

export type CountsView = "due" | "in-progress" | "review" | "done" | "all";
export type CountsSort = "due" | "variance";
type DialogId = "new" | "assign" | "reschedule";

// Views map straight onto the four statuses a count can have.
const VIEW_STATUS: Record<CountsView, CountStatus | null> = {
    due: "scheduled",
    "in-progress": "in-progress",
    review: "submitted",
    done: "approved",
    all: null,
};
const VIEW_LABEL: Record<CountsView, string> = { due: "Scheduled", "in-progress": "In progress", review: "To review", done: "Done", all: "All" };
const VIEWS: CountsView[] = ["due", "in-progress", "review", "done", "all"];

const SORTS: (ToolbarSort & { id: CountsSort })[] = [
    { id: "due", label: "Due date, soonest first" },
    { id: "variance", label: "Most variance first" },
];

const inView = (c: CountSession, view: CountsView) => VIEW_STATUS[view] === null || c.status === VIEW_STATUS[view];
/** Still to be counted: scheduled or under way. Only these can be late, reassigned or moved. */
const isActive = (c: CountSession) => c.status === "scheduled" || c.status === "in-progress";
const isOverdue = (c: CountSession) => isActive(c) && daysBetween(TODAY, c.dueAt) < 0;

const countedLines = (c: CountSession) => c.lines.filter((l) => l.counted !== undefined).length;

/** Lines that differ from the expected quantity, and the net difference. Only known once the count is handed in. */
const variance = (c: CountSession) => {
    if (isActive(c)) return undefined;
    const done = c.lines.filter((l) => l.counted !== undefined);
    return { off: done.filter((l) => l.counted !== l.expected).length, net: done.reduce((sum, l) => sum + ((l.counted ?? 0) - l.expected), 0) };
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

const varianceText = (c: CountSession) => {
    const v = variance(c);
    if (!v) return undefined;
    return v.off === 0 ? "None" : `${plural(v.off, "line")}, ${signed(v.net)} ${Math.abs(v.net) === 1 ? "unit" : "units"}`;
};

const dueText = (c: CountSession) => {
    const days = daysBetween(TODAY, c.dueAt);
    if (!isActive(c)) return undefined;
    return days < 0 ? `overdue by ${plural(-days, "day")}` : relativeDays(c.dueAt, TODAY);
};

const FILTER_READ: Record<string, (c: CountSession) => string> = {
    assignee: (c) => c.assignedTo,
    area: (c) => c.area,
};

const Dash = ({ label }: { label: string }) => (
    <span className="text-quaternary">
        <span aria-hidden="true">–</span>
        <span className="sr-only">{label}</span>
    </span>
);

const AreaChip = ({ area }: { area: string }) => (
    <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset">{area}</span>
);

const CADENCE: { abc: AbcClass; every: string; why: string }[] = [
    { abc: "A", every: "Every week", why: "Most of the spend, and the items that stop a service when they run out." },
    { abc: "B", every: "Every month", why: "Steady back-bar stock. Covered by the full count due by the 25th." },
    { abc: "C", every: "Every quarter", why: "Slow, low-cost items. Shelves rotate so each is covered once a quarter." },
];

/** The counting rhythm, closed until someone asks for it. */
const Cadence = () => {
    const supplies = items.filter((i) => i.kind === "supply");
    return (
        <details className="group rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-secondary outline-focus-ring focus-visible:outline-2 [&::-webkit-details-marker]:hidden">
                How often things get counted
                <ChevronDown className="size-4 shrink-0 text-fg-quaternary transition duration-100 ease-linear group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="flex flex-col divide-y divide-secondary border-t border-secondary px-4">
                {CADENCE.map((c) => (
                    <li key={c.abc} className="flex items-start gap-3 py-3">
                        <AbcBadge abc={c.abc} size="md" />
                        <p className="min-w-0 flex-1 text-sm text-tertiary">
                            <span className="font-semibold text-primary">{c.every}</span> · {plural(supplies.filter((i) => i.abc === c.abc).length, "item")}.{" "}
                            {c.why}
                        </p>
                    </li>
                ))}
            </ul>
            <p className="border-t border-secondary px-4 py-2.5 text-xs text-tertiary">
                Counts are scheduled by shelf, so a weekly count is one short walk. Classes are ranked from usage and sample unit costs.
            </p>
        </details>
    );
};

/** A small dialog for one bulk choice: a title, one or two fields and the button that applies it. */
const ChoiceDialog = ({
    title,
    description,
    isOpen,
    onClose,
    confirmLabel,
    onConfirm,
    canConfirm = true,
    children,
}: {
    title: string;
    description: string;
    isOpen: boolean;
    onClose: () => void;
    confirmLabel: string;
    onConfirm: () => void;
    canConfirm?: boolean;
    children: ReactNode;
}) => (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable>
        <Modal className="max-w-md">
            <Dialog aria-label={title}>
                <div className="flex flex-col gap-5 p-5 sm:p-6">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-lg font-semibold text-primary">{title}</h2>
                        <p className="text-sm text-tertiary">{description}</p>
                    </div>
                    {children}
                    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <Button size="lg" color="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button size="lg" color="primary" onClick={onConfirm} isDisabled={!canConfirm} data-testid="dialog-confirm">
                            {confirmLabel}
                        </Button>
                    </div>
                </div>
            </Dialog>
        </Modal>
    </ModalOverlay>
);

const DateField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-secondary">{label}</span>
        <input
            type="date"
            value={value}
            min={TODAY}
            onChange={(e) => onChange(e.currentTarget.value)}
            className="h-11 w-full rounded-lg bg-primary px-3.5 text-md text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset focus-visible:ring-2 focus-visible:ring-brand"
        />
    </label>
);

const validDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= TODAY;

/** Changes made on this screen. The prototype has no backend, so they last until the page is left. */
interface Edits {
    added: CountSession[];
    removed: string[];
    patch: Record<string, Partial<Pick<CountSession, "assignedTo" | "dueAt">>>;
}

// ------------------------------------------------------------------------------------ screen

export interface CountsScreenProps {
    location?: LocationId;
    /** Who is looking. Defaults to the person using the app; stories pass a sample person. */
    user?: User;
    /** View to open on (deep link `?view=`). */
    initialView?: CountsView;
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Filters to start with (deep link `?assignee=`, `?area=`, comma-separated). */
    initialFilters?: ActiveFilters;
    /** Sort to start with (deep link `?sort=`). */
    initialSort?: CountsSort;
    /** Count ids selected on first render, which brings up the bulk bar. */
    initialSelected?: string[];
    /** Dialog to open on (for stories). */
    initialDialog?: DialogId;
}

/** Every count at one location: what is scheduled, under way, waiting for a manager and done. */
export const CountsScreen = ({ location: initialLocation = "lynnfield", user: userProp, ...initial }: CountsScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [edits, setEdits] = useState<Edits>({ added: [], removed: [], patch: {} });
    const [notice, setNotice] = useState<ListNoticeContent | null>(null);
    const [newOpen, setNewOpen] = useState(initial.initialDialog === "new");

    const sessions = useMemo(
        () =>
            [...edits.added, ...countSessions]
                .filter((c) => c.locationId === location && !edits.removed.includes(c.id))
                .map((c) => (edits.patch[c.id] ? { ...c, ...edits.patch[c.id] } : c)),
        [location, edits],
    );
    const place = locationName(location);
    const canSee = can(user, "stock.count", location);
    const canSchedule = can(user, "counts.schedule", location);
    const team = users.filter((u) => u.locations.includes(location) && can(u, "stock.count", location));
    const areas = [...new Set(stock.filter((s) => s.locationId === location).map((s) => s.area))];

    const overdue = sessions.filter(isOverdue).length;
    const dueSoon = sessions.filter((c) => isActive(c) && !isOverdue(c) && daysBetween(TODAY, c.dueAt) <= 7).length;
    const review = sessions.filter((c) => c.status === "submitted").length;
    const headline = [overdue ? `${overdue} overdue` : "", dueSoon ? `${dueSoon} due this week` : "", review ? `${review} waiting for review` : ""].filter(
        Boolean,
    );

    // ---------------------------------------------------------------- new count

    const [area, setArea] = useState("");
    const [assignee, setAssignee] = useState("");
    const [dueAt, setDueAt] = useState(addDays(TODAY, 7));
    const [blind, setBlind] = useState(true);
    const selectedArea = areas.includes(area) ? area : (areas[0] ?? "");
    const selectedAssignee = team.some((u) => u.id === assignee) ? assignee : (team.find((u) => u.role === "front-desk")?.id ?? team[0]?.id ?? user.id);

    const schedule = () => {
        const lines = stock.filter((s) => s.locationId === location && s.area === selectedArea).slice(0, 60);
        const session: CountSession = {
            id: `cs-new-${edits.added.length + 1}`,
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
        const before = edits;
        setEdits({ ...edits, added: [session, ...edits.added] });
        setNotice({
            text: `${selectedArea} count scheduled for ${userById(selectedAssignee)?.name ?? "the team"}, due ${formatDate(dueAt)}. Nothing is saved in the prototype.`,
            onUndo: () => {
                setEdits(before);
                setNotice(null);
            },
        });
        setNewOpen(false);
    };

    return (
        <AppShell
            activeUrl={ROUTES.counts}
            location={location}
            onLocationChange={(next) => {
                setLocation(next);
                setNotice(null);
            }}
            user={userProp}
        >
            <PageContent className="gap-4 lg:gap-5">
                <div className="flex flex-col gap-2.5">
                    <PageHeader
                        title={
                            <>
                                Stock <em>counts</em>
                            </>
                        }
                        description={canSee ? (headline.length ? `${headline.join(", ")} at ${place}.` : `Nothing is due this week at ${place}.`) : undefined}
                        actions={
                            canSchedule && (
                                <Button
                                    size="md"
                                    color="primary"
                                    iconLeading={Plus}
                                    onClick={() => setNewOpen(true)}
                                    className="max-lg:min-h-11 max-lg:w-full"
                                    data-testid="new-count"
                                >
                                    New count
                                </Button>
                            )
                        }
                    />
                    {canSee && (
                        <SampleDataNote>
                            Shelves and items come from Meraki&apos;s spreadsheets. Count sessions, staff and counted quantities are sample values.
                        </SampleDataNote>
                    )}
                </div>

                {canSee ? (
                    <>
                        {/* Keyed by location so the view, filters and selection start fresh when the salon changes. */}
                        <CountsList
                            key={location}
                            location={location}
                            user={user}
                            sessions={sessions}
                            team={team}
                            edits={edits}
                            onEdits={setEdits}
                            notify={setNotice}
                            onNewCount={canSchedule ? () => setNewOpen(true) : undefined}
                            {...initial}
                        />
                        <Cadence />
                    </>
                ) : (
                    <ListEmpty
                        icon={Lock01}
                        title="Counts are not part of your access"
                        action={
                            <Button href={ROUTES.stock} color="secondary" size="md" className="max-lg:min-h-11">
                                Go to stock
                            </Button>
                        }
                    >
                        Your role does not include counting at {place}. An admin can change that on the Team page.
                    </ListEmpty>
                )}

                <ListNotice notice={notice} onDismiss={() => setNotice(null)} />
            </PageContent>

            <ChoiceDialog
                title="New count"
                description={`${place}. The counter gets a reminder the morning it is due.`}
                isOpen={newOpen}
                onClose={() => setNewOpen(false)}
                confirmLabel="Schedule count"
                onConfirm={schedule}
                canConfirm={Boolean(selectedArea) && validDate(dueAt)}
            >
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
                <DateField label="Due date" value={dueAt} onChange={setDueAt} />
                <Toggle
                    size="md"
                    isSelected={blind}
                    onChange={setBlind}
                    label="Blind count"
                    hint="The counter does not see the expected quantity, so they write down what is on the shelf and not what the system says."
                />
            </ChoiceDialog>
        </AppShell>
    );
};

interface CountsListProps extends Omit<CountsScreenProps, "location" | "user"> {
    location: LocationId;
    user: User;
    /** Counts at this location, with this session's changes applied. */
    sessions: CountSession[];
    /** People who can be given a count here. */
    team: User[];
    edits: Edits;
    onEdits: (next: Edits) => void;
    notify: (notice: ListNoticeContent | null) => void;
    onNewCount?: () => void;
}

const CountsList = ({
    location,
    user,
    sessions,
    team,
    edits,
    onEdits,
    notify,
    onNewCount,
    initialView = "all",
    initialQuery = "",
    initialFilters = {},
    initialSort = "due",
    initialSelected,
    initialDialog,
}: CountsListProps) => {
    const isDesktop = useBreakpoint("lg");
    const canSchedule = can(user, "counts.schedule", location);
    const place = locationName(location);

    const [view, setView] = useState<CountsView>(initialView);
    const [query, setQuery] = useState(initialQuery);
    const [filters, setFilters] = useState<ActiveFilters>(initialFilters);
    const [sort, setSort] = useState<CountsSort>(initialSort);
    const [selectMode, setSelectMode] = useState((initialSelected?.length ?? 0) > 0);
    const [dialog, setDialog] = useState<"assign" | "reschedule" | null>(initialDialog === "assign" || initialDialog === "reschedule" ? initialDialog : null);
    const [person, setPerson] = useState(team[0]?.id ?? "");
    const [newDue, setNewDue] = useState(addDays(TODAY, 7));

    // null (not undefined) removes a parameter: useUrlSync serialises its input, which drops undefined keys before it can clear them.
    useUrlSync({
        view: view === "all" ? null : view,
        q: query,
        assignee: filters.assignee?.join(",") ?? null,
        area: filters.area?.join(",") ?? null,
        sort: sort === "due" ? null : sort,
    });

    const views: ToolbarView[] = VIEWS.map((v) => ({ id: v, label: VIEW_LABEL[v], count: sessions.filter((c) => inView(c, v)).length }));

    const filterDefs: ToolbarFilter[] = useMemo(() => {
        const tally = (read: (c: CountSession) => string) => {
            const counts = new Map<string, number>();
            for (const c of sessions) counts.set(read(c), (counts.get(read(c)) ?? 0) + 1);
            return counts;
        };
        return [
            {
                id: "assignee",
                label: "Assigned to",
                options: [...tally((c) => c.assignedTo)]
                    .map(([id, count]) => ({ id, label: userById(id)?.name ?? "Someone", count }))
                    .sort((a, b) => a.label.localeCompare(b.label)),
            },
            {
                id: "area",
                label: "Area",
                options: [...tally((c) => c.area)].map(([id, count]) => ({ id, label: id, count })).sort((a, b) => a.label.localeCompare(b.label)),
            },
        ];
    }, [sessions]);

    const filtered = useMemo(() => {
        const q = norm(query);
        const out = sessions.filter(
            (c) =>
                inView(c, view) &&
                passesFilters(c, filters, FILTER_READ) &&
                (!q || [c.name, c.area, userById(c.assignedTo)?.name ?? ""].some((f) => norm(f).includes(q))),
        );
        // Work still to do comes first, soonest due at the top; finished counts follow, most recent first.
        const rank = (c: CountSession) => (isActive(c) ? 0 : c.status === "submitted" ? 1 : 2);
        const byDue = (a: CountSession, b: CountSession) =>
            rank(a) - rank(b) || (rank(a) === 0 ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt)) || a.name.localeCompare(b.name);
        const off = (c: CountSession) => variance(c)?.off ?? -1;
        const net = (c: CountSession) => Math.abs(variance(c)?.net ?? 0);
        return out.sort(sort === "variance" ? (a, b) => off(b) - off(a) || net(b) - net(a) || byDue(a, b) : byDue);
    }, [sessions, view, filters, query, sort]);

    const selection = useListSelection(
        filtered.map((c) => c.id),
        initialSelected,
    );
    const selectedCounts = filtered.filter((c) => selection.has(c.id));
    const narrowed = query.trim() !== "" || Object.keys(filters).length > 0;

    // Changing what is listed drops the selection, so actions never hit rows that are out of sight.
    const relist = () => selection.clear();
    const clearAll = () => {
        setQuery("");
        setFilters({});
        relist();
    };

    // ---------------------------------------------------------------- bulk actions

    const apply = (next: Edits, text: string, changed: number) => {
        const before = edits;
        if (changed) onEdits(next);
        setDialog(null);
        notify({
            text: changed ? `${text} Nothing is saved in the prototype.` : text,
            onUndo: changed
                ? () => {
                      onEdits(before);
                      notify(null);
                  }
                : undefined,
        });
    };

    const finished = selectedCounts.filter((c) => !isActive(c)).length;

    const assign = () => {
        const name = userById(person)?.name ?? "them";
        const theirs = selectedCounts.filter((c) => isActive(c) && c.assignedTo === person).length;
        const targets = selectedCounts.filter((c) => isActive(c) && c.assignedTo !== person);
        const patch = { ...edits.patch };
        for (const c of targets) patch[c.id] = { ...patch[c.id], assignedTo: person };
        apply(
            { ...edits, patch },
            `${targets.length ? `${targets.length} assigned to ${name}.` : "Nothing reassigned."}${skipped(theirs, `already assigned to ${name}`)}${skipped(finished, "already counted")}`,
            targets.length,
        );
    };

    const reschedule = () => {
        const targets = selectedCounts.filter(isActive);
        const patch = { ...edits.patch };
        for (const c of targets) patch[c.id] = { ...patch[c.id], dueAt: newDue };
        apply(
            { ...edits, patch },
            `${targets.length ? `${targets.length} rescheduled to ${formatDate(newDue)}.` : "Nothing rescheduled."}${skipped(finished, "already counted")}`,
            targets.length,
        );
    };

    const cancel = () => {
        const targets = selectedCounts.filter((c) => c.status === "scheduled");
        apply(
            { ...edits, removed: [...edits.removed, ...targets.map((c) => c.id)] },
            `${targets.length ? `${plural(targets.length, "count")} cancelled.` : "Nothing cancelled."}${skipped(selectedCounts.length - targets.length, "only counts that have not started can be cancelled")}`,
            targets.length,
        );
    };

    const exportCsv = () => {
        const name = `counts-${location}-${TODAY}.csv`;
        const rows = selectedCounts.map((c) => {
            const v = variance(c);
            return [
                c.name,
                c.area,
                COUNT_STATUS[c.status].label,
                userById(c.assignedTo)?.name,
                c.dueAt,
                countedLines(c),
                c.lines.length,
                v?.off,
                v?.net,
                c.blind ? "Yes" : "No",
            ];
        });
        const header = ["Count", "Area", "Status", "Assigned to", "Due", "Lines counted", "Lines", "Lines that differ", "Net difference", "Blind"];
        if (downloadCsv(name, header, rows)) notify({ text: `${plural(rows.length, "count")} exported to ${name}.` });
    };

    const actions: BulkAction[] = [
        ...(canSchedule
            ? [
                  { id: "assign", label: "Assign to…", icon: UserCheck01, onAction: () => setDialog("assign") },
                  { id: "reschedule", label: "Reschedule", icon: CalendarDate, onAction: () => setDialog("reschedule") },
                  { id: "cancel", label: "Cancel", icon: XCircle, onAction: cancel },
              ]
            : []),
        { id: "export", label: "Export CSV", icon: Download01, onAction: exportCsv },
    ];

    // ---------------------------------------------------------------- columns

    const due = (c: CountSession) => {
        const text = dueText(c);
        return (
            <>
                {formatDate(c.dueAt)}
                {text && <span className={cx(isOverdue(c) ? "font-medium text-error-primary" : "text-tertiary")}> · {text}</span>}
            </>
        );
    };

    const columns: ListColumn<CountSession>[] = [
        {
            id: "count",
            label: "Count",
            primary: true,
            cell: (c) => (
                <>
                    <RowLink href={ROUTES.count(c.id)}>{c.name}</RowLink>
                    {c.area !== c.name && <AreaChip area={c.area} />}
                </>
            ),
        },
        { id: "status", label: "Status", cell: (c) => <CountStatusBadge status={c.status} /> },
        { id: "assignee", label: "Assigned to", cell: (c) => userById(c.assignedTo)?.name ?? <Dash label="Nobody" /> },
        { id: "due", label: "Due", cell: due },
        {
            id: "counted",
            label: "Counted",
            align: "right",
            tooltip: "Lines counted so far, out of the lines on the count.",
            cell: (c) => `${countedLines(c)} of ${c.lines.length}`,
        },
        {
            id: "variance",
            label: "Variance",
            align: "right",
            tooltip: "Lines where the count differs from the expected quantity, and the net difference. Known once the count is handed in.",
            cell: (c) => varianceText(c) ?? <Dash label="Not counted yet" />,
        },
        {
            id: "blind",
            label: "Blind",
            wideOnly: true,
            tooltip: "A blind count hides the expected quantity, so the counter writes down what is on the shelf.",
            cell: (c) => (c.blind ? "Yes" : "No"),
        },
    ];

    const card = (c: CountSession) => {
        const v = variance(c);
        const text = dueText(c);
        return (
            <span className="flex flex-col gap-1">
                <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-primary">{c.name}</span>
                    <span className="shrink-0 text-sm text-secondary tabular-nums">
                        {countedLines(c)} of {c.lines.length}
                    </span>
                </span>
                <span className="flex items-center gap-2">
                    <CountStatusBadge status={c.status} />
                    <span className="min-w-0 truncate text-xs text-tertiary">
                        {userById(c.assignedTo)?.name ?? "Nobody"} ·{" "}
                        {v ? (
                            v.off === 0 ? (
                                "no variance"
                            ) : (
                                `${plural(v.off, "line")} off, net ${signed(v.net)}`
                            )
                        ) : (
                            <span className={cx(isOverdue(c) && "font-medium text-error-primary")}>
                                {isOverdue(c) ? `Overdue by ${plural(-daysBetween(TODAY, c.dueAt), "day")}` : `Due ${text}`}
                            </span>
                        )}
                    </span>
                </span>
            </span>
        );
    };

    // The view picker already carries each view's count, so the result line only appears once search or filters narrow it.
    const inThisView = sessions.filter((c) => inView(c, view)).length;
    const summaryText = narrowed ? `${filtered.length} of ${plural(inThisView, "count")}` : undefined;
    const bulkBar = (className?: string) => (
        <BulkActionBar
            count={selection.count}
            noun="count"
            totalMatching={filtered.length}
            onSelectAll={selection.selectAll}
            onClear={() => {
                selection.clear();
                setSelectMode(false);
            }}
            onToggleAll={isDesktop ? selection.toggleAll : undefined}
            actions={actions}
            className={className}
        />
    );
    const active = selectedCounts.filter(isActive).length;

    return (
        <div className={cx("flex flex-col gap-3", !isDesktop && selection.count > 0 && "pb-28")}>
            <DataTableToolbar
                label={`counts at ${place}`}
                views={views}
                view={view}
                onViewChange={(id) => {
                    setView(id as CountsView);
                    relist();
                }}
                query={query}
                onQueryChange={(value) => {
                    setQuery(value);
                    relist();
                }}
                searchPlaceholder="Search by count, area or person"
                compactSearchPlaceholder="Search"
                filters={filterDefs}
                activeFilters={filters}
                onFiltersChange={(next) => {
                    setFilters(next);
                    relist();
                }}
                sorts={SORTS}
                sort={sort}
                onSortChange={(id) => setSort(id as CountsSort)}
                summary={isDesktop ? summaryText : undefined}
            />

            {!isDesktop && filtered.length > 0 && (
                <SelectModeRow
                    summary={summaryText ?? plural(inThisView, "count")}
                    selectMode={selectMode}
                    onToggle={() => {
                        if (selectMode) selection.clear();
                        setSelectMode(!selectMode);
                    }}
                />
            )}

            {filtered.length === 0 ? (
                narrowed ? (
                    <ListEmpty
                        title="No counts match"
                        action={
                            <Button color="secondary" size="md" className="max-lg:min-h-11" onClick={clearAll}>
                                Clear search and filters
                            </Button>
                        }
                    >
                        Nothing in {VIEW_LABEL[view]} at {place} fits this search and these filters.
                    </ListEmpty>
                ) : (
                    <ListEmpty
                        icon={ClipboardCheck}
                        title={view === "all" ? "No counts yet" : view === "review" ? "Nothing to review" : `No counts ${VIEW_LABEL[view].toLowerCase()}`}
                        action={
                            view !== "all" && sessions.length > 0 ? (
                                <Button color="secondary" size="md" className="max-lg:min-h-11" onClick={() => setView("all")}>
                                    Show all {plural(sessions.length, "count")}
                                </Button>
                            ) : onNewCount ? (
                                <Button color="secondary" size="md" className="max-lg:min-h-11" iconLeading={Plus} onClick={onNewCount}>
                                    New count
                                </Button>
                            ) : undefined
                        }
                    >
                        {view === "all" ? `No count has been scheduled at ${place}.` : `No count at ${place} is in this state.`}
                    </ListEmpty>
                )
            ) : isDesktop ? (
                <ListTable
                    label={`Counts at ${place}`}
                    noun="counts"
                    rows={filtered}
                    rowId={(c) => c.id}
                    rowName={(c) => c.name}
                    columns={columns}
                    selection={selection}
                    bulkBar={bulkBar(BULK_BAR_OVER_HEADER)}
                />
            ) : (
                <ListCards
                    label={`Counts at ${place}`}
                    rows={filtered}
                    rowId={(c) => c.id}
                    href={(c) => ROUTES.count(c.id)}
                    selection={selection}
                    selectMode={selectMode}
                    onSelectMode={setSelectMode}
                    card={card}
                />
            )}

            {!isDesktop && bulkBar()}

            <ChoiceDialog
                title={`Assign ${plural(selection.count, "count")}`}
                description={
                    finished
                        ? `${plural(active, "count")} can be reassigned. ${finished} already counted will be left as ${finished === 1 ? "it is" : "they are"}.`
                        : "The new counter gets a reminder the morning it is due."
                }
                isOpen={dialog === "assign"}
                onClose={() => setDialog(null)}
                confirmLabel="Assign"
                onConfirm={assign}
                canConfirm={Boolean(person)}
            >
                <NativeSelect
                    label="Assign to"
                    size="lg"
                    value={person}
                    onChange={(e) => setPerson(e.currentTarget.value)}
                    options={team.map((u) => ({ label: u.name, value: u.id }))}
                />
            </ChoiceDialog>

            <ChoiceDialog
                title={`Reschedule ${plural(selection.count, "count")}`}
                description={
                    finished
                        ? `${plural(active, "count")} can be moved. ${finished} already counted will be left as ${finished === 1 ? "it is" : "they are"}.`
                        : "Pick the new due date. Today or later."
                }
                isOpen={dialog === "reschedule"}
                onClose={() => setDialog(null)}
                confirmLabel="Reschedule"
                onConfirm={reschedule}
                canConfirm={validDate(newDue)}
            >
                <DateField label="New due date" value={newDue} onChange={setNewDue} />
            </ChoiceDialog>
        </div>
    );
};
