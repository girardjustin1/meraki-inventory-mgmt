"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ArrowLeft, CheckCircle, CheckVerified02, FilterLines, HelpCircle, LinkExternal01, SearchLg, XClose } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, Card, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { FlagCard } from "@/components/meraki/flag-card";
import { FlagSeverityBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, ROLE_LABEL, flags as allFlags, locationName } from "@/data/inventory";
import type { Flag, FlagSeverity, FlagType, LocationId, User } from "@/data/types";
import { FLAG_THRESHOLDS, FLAG_TYPE_LABEL } from "@/engine/flags";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { FlagDetailBody, canReviewFlags, reviewersFor, useFlagReviews } from "@/screens/flag-detail/flag-detail-screen";
import { cx } from "@/utils/cx";

export type QueueTab = "open" | "reviewing" | "closed";
type Source = "all" | "real" | "sample";

const SEVERITIES: FlagSeverity[] = ["high", "medium", "low"];
const SEVERITY_LABEL: Record<FlagSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const SEVERITY_TEXT: Record<FlagSeverity, string> = { high: "text-error-primary", medium: "text-warning-primary", low: "text-primary" };
const PAGE = 30;

const inTab = (f: Flag, tab: QueueTab) => (tab === "closed" ? f.status === "resolved" || f.status === "dismissed" : f.status === tab);

// ------------------------------------------------------------------------------------ rules explainer

const T = FLAG_THRESHOLDS;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const hour = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** Each rule in plain language. Numbers come from FLAG_THRESHOLDS, so this text cannot drift from the engine. */
const FLAG_RULES: { type: FlagType; when: string; severity: string }[] = [
    {
        type: "count-variance",
        when: `A count differs from what the ledger expects by ${pct(T.countVariancePct)} or more, and by at least ${T.countVarianceMinUnits} units.`,
        severity: `High when the count is short by ${pct(T.countVarianceHighPct)} or more. Medium otherwise.`,
    },
    {
        type: "unexplained-adjustment",
        when: `Stock was written off as lost or suspected theft, or outside ${hour(T.openHour)} to ${hour(T.closeHour)}, or by ${T.adjustmentNoteUnits} or more units with no note.`,
        severity: "High for suspected theft, or when it is both after hours and has no note. Medium otherwise.",
    },
    {
        type: "received-mismatch",
        when: "The quantity logged at receiving is different from the quantity ordered.",
        severity: "Any difference raises it. High when it is off by half or more, medium from a quarter.",
    },
    {
        type: "overdue-receipt",
        when: `An order was sent and some lines still have no receipt after ${T.overdueReceiptDays} days, or after twice the vendor's lead time if that is longer.`,
        severity: "High when half or more of the lines are still open, medium from a fifth.",
    },
    {
        type: "order-spike",
        when: `An order line is at least ${T.orderSpikeMultiple}× the item's usual order, and at least ${T.orderSpikeMinExtraUnits} units more.`,
        severity: "The usual order is the median of the item's other orders, and needs at least two to compare. High from 3×.",
    },
    {
        type: "stockout-risk",
        when: "Going by usage, the stock on hand will run out before a new order from the vendor could arrive.",
        severity: "High at 2 days of cover or less. Medium otherwise.",
    },
    {
        type: "missed-count",
        when: "A scheduled count is past its due date and has not been started.",
        severity: "Medium from 5 days late, high from 14.",
    },
    {
        type: "variant-mismatch",
        when: "A different type arrived than was ordered, for example Gel when Regular was asked for.",
        severity: "Always low.",
    },
    {
        type: "over-par",
        when: `More than ${T.overParMultiple}× the par level is on the shelf.`,
        severity: "Always low.",
    },
    {
        type: "repeat-out-of-stock",
        when: "The vendor could not supply the same colour in two or more order cycles.",
        severity: "Always low.",
    },
    {
        type: "data-quality",
        when: "The catalogue has a gap that hides real numbers: the same product on two rows, or an item with no par level.",
        severity: "Always low.",
    },
];

const HowFlagsWork = ({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) => (
    <SlideoutMenu isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="z-50">
        {({ close }) => (
            <>
                <SlideoutMenu.Header onClose={close}>
                    <h2 className="pr-8 text-lg font-semibold text-primary">How flags work</h2>
                    <p className="mt-1 text-sm text-tertiary">
                        Flags come from fixed rules run over counts, receipts, orders and adjustments. Every flag shows the numbers behind it. None of them says
                        why something happened: that is what the review is for.
                    </p>
                </SlideoutMenu.Header>
                <SlideoutMenu.Content>
                    <ul className="flex flex-col divide-y divide-secondary pb-6">
                        {FLAG_RULES.map((rule) => (
                            <li key={rule.type} className="flex flex-col gap-1 py-3.5 first:pt-0">
                                <h3 className="text-sm font-semibold text-primary">{FLAG_TYPE_LABEL[rule.type]}</h3>
                                <p className="text-sm text-secondary">{rule.when}</p>
                                <p className="text-xs text-tertiary">{rule.severity}</p>
                            </li>
                        ))}
                    </ul>
                </SlideoutMenu.Content>
                <SlideoutMenu.Footer className="flex items-center justify-between gap-3">
                    <p className="text-xs text-tertiary">Thresholds can be tuned for each location.</p>
                    <Button color="secondary" size="md" onClick={close}>
                        Close
                    </Button>
                </SlideoutMenu.Footer>
            </>
        )}
    </SlideoutMenu>
);

// ------------------------------------------------------------------------------------ small pieces

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

const TabLabel = ({ label, count }: { label: string; count: number }) => (
    <>
        {label}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular-nums ring-1 ring-secondary ring-inset">{count}</span>
    </>
);

const DismissDialog = ({ count, skipped, onClose, onConfirm }: { count: number; skipped: number; onClose: () => void; onConfirm: (note: string) => void }) => {
    const [note, setNote] = useState("");
    const [tried, setTried] = useState(false);
    const ok = note.trim().length >= 3;
    return (
        <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="sm:max-w-md">
                <Dialog aria-label="Dismiss selected flags">
                    <div className="flex w-full flex-col gap-5 p-4 sm:p-6">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-lg font-semibold text-primary">
                                Dismiss {count} flag{count === 1 ? "" : "s"}
                            </h2>
                            <p className="text-sm text-tertiary">
                                Dismiss flags that should not have been raised. The same note is recorded on each one. Flags that need a decision are resolved
                                one at a time.
                            </p>
                        </div>
                        {skipped > 0 && (
                            <p className="rounded-lg bg-warning-primary px-3 py-2 text-sm text-secondary">
                                {skipped} selected flag{skipped === 1 ? " has" : "s have"} your login on the record and will be left for someone else.
                            </p>
                        )}
                        <TextArea
                            label="Reason for dismissing"
                            isRequired
                            rows={3}
                            value={note}
                            onChange={setNote}
                            isInvalid={tried && !ok}
                            hint={tried && !ok ? "A note is required." : "For example: known data entry quirk from the spreadsheet import."}
                        />
                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <Button color="secondary" size="md" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                color="primary"
                                size="md"
                                isDisabled={count === 0}
                                onClick={() => {
                                    setTried(true);
                                    if (ok) onConfirm(note.trim());
                                }}
                            >
                                Dismiss {count} flag{count === 1 ? "" : "s"}
                            </Button>
                        </div>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
};

// ------------------------------------------------------------------------------------ screen

interface FlagsScreenProps {
    location?: LocationId;
    user?: User;
    /** Tab to open on. */
    tab?: QueueTab;
    /** Severity filter to start with. */
    severity?: FlagSeverity[];
    /** Replace the flag list (used for the empty state). */
    flags?: Flag[];
}

export const FlagsScreen = ({
    location: initialLocation = "lynnfield",
    user = CURRENT_USER,
    tab: initialTab = "open",
    severity: initialSeverity = [],
    flags: source = allFlags,
}: FlagsScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [tab, setTab] = useState<QueueTab>(initialTab);
    const [severities, setSeverities] = useState<FlagSeverity[]>(initialSeverity);
    const [type, setType] = useState<FlagType | "all">("all");
    const [sourceFilter, setSourceFilter] = useState<Source>("all");
    const [mine, setMine] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [mobileDetail, setMobileDetail] = useState(false);
    const [checked, setChecked] = useState<string[]>([]);
    const [limit, setLimit] = useState(PAGE);
    const [howOpen, setHowOpen] = useState(false);
    const [dismissOpen, setDismissOpen] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const isDesktop = useBreakpoint("lg");
    const { get, act, current } = useFlagReviews(source);
    const canReview = canReviewFlags(user);

    const here = source.filter((f) => f.locationId === location).map(current);
    const tabCount = (t: QueueTab) => here.filter((f) => inTab(f, t)).length;
    const needsReview = here.filter((f) => f.status === "open" || f.status === "reviewing");
    const bySeverity = (s: FlagSeverity) => needsReview.filter((f) => f.severity === s).length;
    const commonTypes = Object.entries(needsReview.reduce<Partial<Record<FlagType, number>>>((acc, f) => ({ ...acc, [f.type]: (acc[f.type] ?? 0) + 1 }), {}))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3) as [FlagType, number][];
    const typesHere = [...new Set(here.map((f) => f.type))].sort((a, b) => FLAG_TYPE_LABEL[a].localeCompare(FLAG_TYPE_LABEL[b]));

    const filtersOn = severities.length > 0 || type !== "all" || sourceFilter !== "all" || mine;
    const filtered = here.filter(
        (f) =>
            inTab(f, tab) &&
            (severities.length === 0 || severities.includes(f.severity)) &&
            (type === "all" || f.type === type) &&
            (sourceFilter === "all" || (sourceFilter === "real") === f.fromRealData) &&
            (!mine || f.assignedTo === user.id),
    );
    const shown = filtered.slice(0, limit);
    const active = filtered.find((f) => f.id === activeId) ?? (isDesktop ? filtered[0] : undefined);
    const activeSource = active ? source.find((f) => f.id === active.id) : undefined;

    const selectable = canReview && tab !== "closed";
    const checkedHere = checked.filter((id) => filtered.some((f) => f.id === id));
    const dismissable = checkedHere.filter((id) => source.find((f) => f.id === id)?.userId !== user.id);

    const clearFilters = () => {
        setSeverities([]);
        setType("all");
        setSourceFilter("all");
        setMine(false);
    };
    const resetView = () => {
        setChecked([]);
        setLimit(PAGE);
        setMessage(null);
    };
    const toggleSeverity = (s: FlagSeverity) => {
        setSeverities((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
        resetView();
    };
    const openFlag = (id: string) => {
        setActiveId(id);
        setMobileDetail(true);
    };

    // ---- phone: the flag opens as its own page -------------------------------------------------
    if (!isDesktop && mobileDetail && active && activeSource) {
        return (
            <AppShell activeUrl={ROUTES.flags} location={location} onLocationChange={setLocation} user={user}>
                <PageContent>
                    <PageHeader
                        eyebrow={
                            <button
                                type="button"
                                onClick={() => setMobileDetail(false)}
                                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md text-brand-secondary outline-focus-ring focus-visible:outline-2"
                            >
                                <ArrowLeft className="size-4" aria-hidden="true" />
                                Review queue
                            </button>
                        }
                        title={active.title}
                        description={`${FLAG_TYPE_LABEL[active.type]} · ${locationName(active.locationId)}`}
                    />
                    <FlagDetailBody
                        key={active.id}
                        flag={activeSource}
                        review={get(activeSource)}
                        user={user}
                        onAction={(action) => act([active.id], action, user)}
                        layout="panel"
                        showTitle={false}
                    />
                </PageContent>
            </AppShell>
        );
    }

    const filters = (
        <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0">
            <FilterLines className="hidden size-4 shrink-0 text-fg-quaternary lg:block" aria-hidden="true" />
            {SEVERITIES.map((s) => (
                <Chip key={s} isSelected={severities.includes(s)} onPress={() => toggleSeverity(s)}>
                    {SEVERITY_LABEL[s]}
                </Chip>
            ))}
            <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border-secondary" />
            <NativeSelect
                aria-label="Flag type"
                size="sm"
                className="w-48 shrink-0"
                selectClassName="min-h-11 lg:min-h-9 pr-8"
                value={type}
                onChange={(e) => {
                    setType(e.target.value as FlagType | "all");
                    resetView();
                }}
                options={[{ label: "All types", value: "all" }, ...typesHere.map((t) => ({ label: FLAG_TYPE_LABEL[t], value: t }))]}
            />
            <NativeSelect
                aria-label="Source"
                size="sm"
                className="w-44 shrink-0"
                selectClassName="min-h-11 lg:min-h-9 pr-8"
                value={sourceFilter}
                onChange={(e) => {
                    setSourceFilter(e.target.value as Source);
                    resetView();
                }}
                options={[
                    { label: "Any source", value: "all" },
                    { label: "From your sheets", value: "real" },
                    { label: "Sample data", value: "sample" },
                ]}
            />
            <Chip
                isSelected={mine}
                onPress={() => {
                    setMine((v) => !v);
                    resetView();
                }}
            >
                Assigned to me
            </Chip>
            {filtersOn && (
                <Button color="link-gray" size="sm" className="shrink-0" iconLeading={XClose} onClick={clearFilters}>
                    Clear
                </Button>
            )}
        </div>
    );

    const bulkBar = selectable && checkedHere.length > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 order-last flex flex-wrap items-center gap-2 rounded-xl bg-primary p-2.5 shadow-lg ring-1 ring-secondary lg:static lg:order-none lg:shadow-xs">
            <span className="px-1 text-sm font-semibold text-primary">{checkedHere.length} selected</span>
            <NativeSelect
                aria-label="Assign selected flags to"
                size="sm"
                className="min-w-36 flex-1"
                selectClassName="min-h-11 lg:min-h-9 pr-8"
                value=""
                onChange={(e) => {
                    const assignee = reviewersFor(location).find((u) => u.id === e.target.value);
                    if (!assignee) return;
                    act(checkedHere, { type: "assign", userId: assignee.id }, user);
                    setMessage(`${checkedHere.length} flag${checkedHere.length === 1 ? "" : "s"} assigned to ${assignee.name}.`);
                    setChecked([]);
                }}
                options={[
                    { label: "Assign to…", value: "" },
                    ...reviewersFor(location).map((u) => ({ label: `${u.name} (${ROLE_LABEL[u.role]})`, value: u.id })),
                ]}
            />
            <Button color="secondary" size="sm" className="max-lg:min-h-11" onClick={() => setDismissOpen(true)}>
                Dismiss with note
            </Button>
            <Button color="tertiary" size="sm" className="max-lg:min-h-11" onClick={() => setChecked([])}>
                Clear
            </Button>
        </div>
    );

    const list =
        filtered.length === 0 ? (
            <Card className="py-10 lg:col-span-2 lg:py-16">
                <EmptyState size="md">
                    <EmptyState.Header pattern="none">
                        <EmptyState.FeaturedIcon
                            icon={filtersOn ? SearchLg : CheckVerified02}
                            color={filtersOn ? "gray" : "success"}
                            theme={filtersOn ? "modern" : "light"}
                        />
                    </EmptyState.Header>
                    <EmptyState.Content>
                        <EmptyState.Title>
                            {filtersOn
                                ? "No flags match these filters"
                                : tab === "open"
                                  ? "Nothing waiting for review"
                                  : tab === "reviewing"
                                    ? "Nothing in review"
                                    : "No closed flags yet"}
                        </EmptyState.Title>
                        <EmptyState.Description>
                            {filtersOn
                                ? "Try a different severity, type or source."
                                : tab === "open"
                                  ? `No open flags at ${locationName(location)}. New ones appear here when a count, receipt, order or adjustment falls outside the rules.`
                                  : tab === "reviewing"
                                    ? "Flags move here when someone starts a review."
                                    : "Resolved and dismissed flags are kept here with their outcome and notes."}
                        </EmptyState.Description>
                    </EmptyState.Content>
                    <EmptyState.Footer>
                        {filtersOn ? (
                            <Button color="secondary" size="md" onClick={clearFilters}>
                                Clear filters
                            </Button>
                        ) : (
                            <Button color="secondary" size="md" iconLeading={HelpCircle} onClick={() => setHowOpen(true)}>
                                How flags work
                            </Button>
                        )}
                    </EmptyState.Footer>
                </EmptyState>
            </Card>
        ) : (
            <>
                <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:rounded-xl lg:p-0.5 lg:pr-1">
                    <div className="flex min-h-9 items-center justify-between gap-3">
                        {selectable ? (
                            <Checkbox
                                label={`Select all ${filtered.length}`}
                                isSelected={checkedHere.length === filtered.length}
                                isIndeterminate={checkedHere.length > 0 && checkedHere.length < filtered.length}
                                onChange={(on) => setChecked(on ? filtered.map((f) => f.id) : [])}
                            />
                        ) : (
                            <span className="text-sm text-tertiary">
                                {filtered.length} flag{filtered.length === 1 ? "" : "s"}
                            </span>
                        )}
                        <span className="text-xs text-tertiary">Highest severity first</span>
                    </div>
                    {bulkBar}
                    <ul className="flex flex-col gap-3">
                        {shown.map((f) => (
                            <li key={f.id}>
                                <FlagCard
                                    flag={f}
                                    href={ROUTES.flag(f.id)}
                                    onPress={() => openFlag(f.id)}
                                    isActive={isDesktop && active?.id === f.id}
                                    showLocation={false}
                                    selection={
                                        selectable
                                            ? {
                                                  isSelected: checked.includes(f.id),
                                                  onChange: (on) => setChecked((prev) => (on ? [...prev, f.id] : prev.filter((id) => id !== f.id))),
                                              }
                                            : undefined
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                    {filtered.length > shown.length && (
                        <Button color="secondary" size="md" onClick={() => setLimit((n) => n + PAGE)}>
                            Show {Math.min(PAGE, filtered.length - shown.length)} more
                        </Button>
                    )}
                </div>

                {isDesktop && active && activeSource && (
                    <div className="hidden min-w-0 flex-col gap-3 lg:flex">
                        <div className="flex min-h-9 items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-secondary">Selected flag</h2>
                            <Button href={ROUTES.flag(active.id)} color="link-color" size="sm" iconTrailing={LinkExternal01}>
                                Open full page
                            </Button>
                        </div>
                        <FlagDetailBody
                            key={active.id}
                            flag={activeSource}
                            review={get(activeSource)}
                            user={user}
                            onAction={(action) => act([active.id], action, user)}
                            layout="panel"
                        />
                    </div>
                )}
            </>
        );

    return (
        <AppShell activeUrl={ROUTES.flags} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Review <em>queue</em>
                        </>
                    }
                    description="What the records say is worth a second look. Each flag shows its numbers and needs a person to check it and write down what they found."
                    actions={
                        <Button color="secondary" size="md" iconLeading={HelpCircle} onClick={() => setHowOpen(true)}>
                            How flags work
                        </Button>
                    }
                />

                <section aria-label="Flags needing review" className="grid grid-cols-3 gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2fr)] lg:gap-4">
                    {SEVERITIES.map((s) => (
                        <button
                            key={s}
                            type="button"
                            aria-pressed={severities.length === 1 && severities[0] === s}
                            onClick={() => {
                                setSeverities(severities.length === 1 && severities[0] === s ? [] : [s]);
                                resetView();
                            }}
                            className="flex cursor-pointer flex-col gap-2 rounded-xl bg-primary p-3 text-left shadow-xs ring-1 ring-secondary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2 lg:p-5"
                        >
                            <FlagSeverityBadge severity={s} />
                            <span
                                className={cx(
                                    "text-display-xs font-semibold tabular-nums lg:text-display-sm",
                                    bySeverity(s) > 0 ? SEVERITY_TEXT[s] : "text-quaternary",
                                )}
                            >
                                {bySeverity(s)}
                            </span>
                            <span className="text-xs text-tertiary lg:text-sm">to review</span>
                        </button>
                    ))}
                    <Card className="col-span-3 flex flex-col gap-2 lg:col-span-1">
                        <h2 className="text-sm font-medium text-tertiary">Most common</h2>
                        {commonTypes.length ? (
                            <ul className="flex flex-col gap-0.5">
                                {commonTypes.map(([t, n]) => (
                                    <li key={t}>
                                        <button
                                            type="button"
                                            aria-pressed={type === t}
                                            onClick={() => {
                                                setType(type === t ? "all" : t);
                                                resetView();
                                            }}
                                            className={cx(
                                                "-mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 rounded-md px-2 text-left text-sm outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 lg:min-h-8",
                                                type === t ? "font-semibold text-brand-secondary" : "font-medium text-secondary",
                                            )}
                                        >
                                            <span className="truncate">{FLAG_TYPE_LABEL[t]}</span>
                                            <span className="text-tertiary tabular-nums">{n}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-tertiary">No open flags.</p>
                        )}
                    </Card>
                </section>

                <Tabs
                    selectedKey={tab}
                    onSelectionChange={(key) => {
                        setTab(key as QueueTab);
                        setActiveId(null);
                        resetView();
                    }}
                    className="gap-4"
                >
                    <Tabs.List type="underline" size="md" aria-label="Flag status" className="overflow-x-auto">
                        <Tabs.Item id="open">
                            <TabLabel label="Open" count={tabCount("open")} />
                        </Tabs.Item>
                        <Tabs.Item id="reviewing">
                            <TabLabel label="Reviewing" count={tabCount("reviewing")} />
                        </Tabs.Item>
                        <Tabs.Item id="closed">
                            <TabLabel label="Resolved" count={tabCount("closed")} />
                        </Tabs.Item>
                    </Tabs.List>

                    {filters}

                    {message && (
                        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success-primary">
                            <CheckCircle className="size-4" aria-hidden="true" />
                            {message}
                        </p>
                    )}

                    <Tabs.Panel id={tab} className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
                        {list}
                    </Tabs.Panel>
                </Tabs>

                <SampleDataNote>
                    Flags marked &ldquo;From your sheets&rdquo; were found in Meraki&apos;s 2026 order and stock spreadsheets. Flags marked &ldquo;Sample&rdquo;
                    come from generated counts and adjustments, and show how those rules will read once real counts exist. Staff names are sample values.
                </SampleDataNote>
            </PageContent>

            <HowFlagsWork isOpen={howOpen} onOpenChange={setHowOpen} />
            {dismissOpen && (
                <DismissDialog
                    count={dismissable.length}
                    skipped={checkedHere.length - dismissable.length}
                    onClose={() => setDismissOpen(false)}
                    onConfirm={(note) => {
                        act(dismissable, { type: "dismiss", note }, user);
                        setMessage(`${dismissable.length} flag${dismissable.length === 1 ? "" : "s"} dismissed. They are under Resolved with your note.`);
                        setChecked([]);
                        setDismissOpen(false);
                    }}
                />
            )}
        </AppShell>
    );
};
