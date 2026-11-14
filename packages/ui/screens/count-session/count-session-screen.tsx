"use client";

import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle, EyeOff, PauseCircle, PlayCircle, QrCode02, XClose } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { ProgressBarBase } from "@/components/base/progress-indicators/progress-indicators";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { AppShell, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { BarcodeScanner } from "@/components/meraki/barcode-scanner";
import { FillLevelPicker } from "@/components/meraki/fill-level-picker";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { QuantityStepper, quantityText, unitWord } from "@/components/meraki/quantity-stepper";
import { describeCode, labelCodeForItem, lookupCode, shelfLabel } from "@/components/meraki/scan-lookup";
import { countSessions, getCountSession, getItem, getStock, locationName, userById, users } from "@/data/inventory";
import type { CountSession, FillLevel, Item, StockLevel } from "@/data/types";
import { FILL_FRACTION, FILL_LABEL } from "@/engine/stock";
import { cx } from "@/utils/cx";

type Step = "count" | "review" | "done";
type Filter = "all" | "uncounted" | "counted";

export interface CountSessionScreenProps {
    sessionId?: string;
    /** Open on a later step. Used by stories. */
    initialStep?: Step;
}

interface Line {
    item: Item;
    level?: StockLevel;
    /** Tracked by eye with a fill level, not by number. */
    byLevel: boolean;
}

interface Entry {
    qty: number;
    fill?: FillLevel;
    done: boolean;
    /** The counter could not find it. Recorded as zero and called out for the reviewer. */
    missing?: boolean;
    note?: string;
}

const QUICK_NOTES = ["Opened", "Damaged", "Found on another shelf", "Expired"];

const entryText = (line: Line, entry: Entry) => {
    if (entry.missing) return "Not found, recorded as 0";
    if (line.byLevel && entry.fill) return FILL_LABEL[entry.fill];
    return quantityText(entry.qty, line.item.unit);
};

interface LineCardProps {
    line: Line;
    entry: Entry;
    highlight: boolean;
    /** Only shown when the count is not blind. */
    expected?: number;
    onChange: (patch: Partial<Entry>) => void;
}

const LineCard = ({ line, entry, highlight, expected, onChange }: LineCardProps) => {
    const { item, level } = line;
    const [noteOpen, setNoteOpen] = useState(false);

    if (entry.done) {
        return (
            <li
                id={`line-${item.id}`}
                className={cx(
                    "flex scroll-mt-44 items-center gap-3 rounded-xl bg-primary py-1.5 pr-1.5 pl-4 ring-1 ring-inset",
                    highlight ? "ring-2 ring-brand" : "ring-secondary",
                )}
            >
                {entry.missing ? (
                    <AlertCircle className="size-5 shrink-0 text-fg-warning-primary" aria-hidden="true" />
                ) : (
                    <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1 py-1">
                    <p className="truncate text-sm font-medium text-primary">{item.name}</p>
                    <p className={cx("truncate text-sm", entry.missing ? "text-warning-primary" : "text-tertiary")}>
                        <span className="font-semibold">{entryText(line, entry)}</span>
                        {entry.note ? ` · Note: ${entry.note}` : ""}
                    </p>
                </div>
                <Button
                    size="md"
                    color="tertiary"
                    className="min-h-11"
                    onClick={() => onChange({ done: false, missing: false })}
                    aria-label={`Change the count for ${item.name}`}
                >
                    Edit
                </Button>
            </li>
        );
    }

    const canSave = !line.byLevel || Boolean(entry.fill);

    return (
        <li
            id={`line-${item.id}`}
            className={cx(
                "flex scroll-mt-44 flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-inset",
                highlight ? "ring-2 ring-brand" : "ring-secondary",
            )}
        >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ItemThumb item={item} size="lg" />
                    <div className="min-w-0">
                        <p className="text-md font-semibold text-primary">{item.name}</p>
                        <p className="text-sm text-tertiary">
                            {shelfLabel(level)} · {line.byLevel ? "how full is the open one?" : `count each ${unitWord(1, item.unit)}`}
                        </p>
                        {expected !== undefined && <p className="text-sm text-tertiary">System has {expected}</p>}
                    </div>
                </div>
                {line.byLevel ? (
                    <FillLevelPicker
                        size="lg"
                        label={`Fill level for ${item.name}`}
                        value={entry.fill}
                        onChange={(fill) => onChange({ fill, qty: FILL_FRACTION[fill] })}
                        className="w-full lg:w-80"
                    />
                ) : (
                    <QuantityStepper
                        size="lg"
                        label={`Counted quantity for ${item.name}`}
                        value={entry.qty}
                        onChange={(qty) => onChange({ qty })}
                        unit={unitWord(entry.qty, item.unit)}
                        className="flex w-full lg:w-60"
                    />
                )}
            </div>

            {noteOpen && (
                <div className="flex flex-col gap-2">
                    <TextArea
                        aria-label={`Note for ${item.name}`}
                        placeholder="What should the reviewer know?"
                        rows={2}
                        value={entry.note ?? ""}
                        onChange={(note) => onChange({ note })}
                    />
                    <div className="flex flex-wrap gap-2">
                        {QUICK_NOTES.map((q) => (
                            <button
                                key={q}
                                type="button"
                                onClick={() => onChange({ note: q })}
                                className="min-h-9 rounded-full bg-secondary px-3 text-sm font-medium text-secondary ring-1 ring-secondary outline-focus-ring ring-inset hover:bg-secondary_hover focus-visible:outline-2"
                            >
                                {q}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-1 lg:flex-row-reverse lg:items-center lg:justify-between">
                <Button
                    size="xl"
                    color="primary"
                    isDisabled={!canSave}
                    onClick={() => onChange({ done: true, missing: false })}
                    className="w-full lg:w-auto lg:min-w-44"
                >
                    {line.byLevel ? (entry.fill ? `Save: ${FILL_LABEL[entry.fill]}` : "Pick a level") : `Save ${quantityText(entry.qty, item.unit)}`}
                </Button>
                <div className="-mb-2 flex items-center justify-between gap-1 lg:mb-0 lg:justify-start">
                    <Button size="md" color="tertiary" className="min-h-11" onClick={() => onChange({ done: true, missing: true, qty: 0, fill: undefined })}>
                        Can&apos;t find it
                    </Button>
                    <Button size="md" color="tertiary" className="min-h-11" onClick={() => setNoteOpen((o) => !o)}>
                        {noteOpen ? "Hide note" : entry.note ? "Edit note" : "Add note"}
                    </Button>
                </div>
            </div>
        </li>
    );
};

const Tile = ({ label, value, tone }: { label: string; value: number; tone?: "warning" }) => (
    <div className="rounded-xl bg-primary p-3 ring-1 ring-secondary ring-inset">
        <p className="text-xs font-medium text-tertiary">{label}</p>
        <p className={cx("text-display-xs font-semibold tabular-nums", tone === "warning" && value > 0 ? "text-warning-primary" : "text-primary")}>{value}</p>
    </div>
);

const buildLines = (session: CountSession): Line[] =>
    session.lines.flatMap((l) => {
        const item = getItem(l.itemId);
        if (!item) return [];
        const level = getStock(l.itemId, session.locationId);
        return [{ item, level, byLevel: Boolean(level?.fillLevel) }];
    });

/**
 * Counting a shelf, phone first.
 * One card per item in shelf order. Blind by default: the expected quantity is never shown.
 * Nothing is written to stock here; submitting hands the count to a manager for review.
 */
export const CountSessionScreen = ({ sessionId = "cs-lyn-cleaning", initialStep = "count" }: CountSessionScreenProps) => {
    const session = getCountSession(sessionId) ?? (countSessions[0] as CountSession);
    const lines = buildLines(session);
    const counter = userById(session.assignedTo);

    const [entries, setEntries] = useState<Record<string, Entry>>(() =>
        Object.fromEntries(session.lines.map((l) => [l.itemId, { qty: l.counted ?? 0, done: l.counted !== undefined } satisfies Entry])),
    );
    const [step, setStep] = useState<Step>(initialStep);
    const [filter, setFilter] = useState<Filter>("all");
    const [paused, setPaused] = useState(false);
    const [scanOpen, setScanOpen] = useState(false);
    const [scanMessage, setScanMessage] = useState<string | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const [uncountedChoice, setUncountedChoice] = useState<"zero" | "later">("later");

    const entryOf = (id: string): Entry => entries[id] ?? { qty: 0, done: false };
    const patch = (id: string, change: Partial<Entry>) => setEntries((all) => ({ ...all, [id]: { ...(all[id] ?? { qty: 0, done: false }), ...change } }));

    const total = lines.length;
    const counted = lines.filter((l) => entryOf(l.item.id).done);
    const uncounted = lines.filter((l) => !entryOf(l.item.id).done);
    const missing = counted.filter((l) => entryOf(l.item.id).missing).length;
    const notes = lines.filter((l) => entryOf(l.item.id).note).length;

    const visible = filter === "all" ? lines : filter === "counted" ? counted : uncounted;
    const groups = new Map<string, Line[]>();
    for (const line of visible) {
        const key = line.level?.shelf ? `Shelf ${line.level.shelf}` : (line.level?.area ?? session.area);
        groups.set(key, [...(groups.get(key) ?? []), line]);
    }

    const reviewers = users
        .filter((u) => u.id !== session.assignedTo && (u.role === "manager" || u.role === "owner") && u.locations.includes(session.locationId))
        .map((u) => u.name);

    // A handful of this count's labels for the simulated scanner, plus one item from another shelf and one unknown code.
    const sample = [lines[5], lines[6], lines[0], lines[lines.length - 1]].flatMap((l) => (l ? [labelCodeForItem(l.item.id)] : []));
    const demoCodes = [...new Set([...sample, "766150110173", "0123456789012"])];

    const jumpTo = (itemId: string) => {
        setFilter("all");
        setStep("count");
        setPaused(false);
        setHighlight(itemId);
        window.setTimeout(() => document.getElementById(`line-${itemId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
        window.setTimeout(() => setHighlight((h) => (h === itemId ? null : h)), 3000);
    };

    const onScan = (code: string) => {
        const result = lookupCode(code, session.locationId);
        if (result.kind === "item" && entries[result.item.id]) {
            setScanMessage(null);
            setScanOpen(false);
            jumpTo(result.item.id);
            return;
        }
        setScanMessage(
            result.kind === "item"
                ? `${result.item.name} is not part of this count. It lives in ${shelfLabel(result.level)}.`
                : result.kind === "shelf"
                  ? "That is a shelf label. Scan the item itself to jump to its line."
                  : "No product has this barcode. Find the item in the list instead.",
        );
    };

    const submit = () => {
        if (uncounted.length > 0 && uncountedChoice === "later") {
            setStep("count");
            setPaused(true);
            return;
        }
        setEntries((all) => {
            const next = { ...all };
            for (const l of uncounted)
                next[l.item.id] = { ...(next[l.item.id] ?? { qty: 0, done: false }), qty: 0, fill: l.byLevel ? "empty" : undefined, done: true };
            return next;
        });
        setStep("done");
    };

    const column = "mx-auto w-full max-w-xl px-4 lg:max-w-3xl";
    const chips: { id: Filter; label: string; count: number }[] = [
        { id: "all", label: "All", count: total },
        { id: "uncounted", label: "Uncounted", count: uncounted.length },
        { id: "counted", label: "Counted", count: counted.length },
    ];

    return (
        <AppShell activeUrl={ROUTES.counts} location={session.locationId} user={counter} immersive>
            <div className="flex min-h-dvh flex-col">
                <header className="sticky top-0 z-20 border-b border-secondary bg-primary/95 pt-[env(safe-area-inset-top)] backdrop-blur">
                    <div className={cx(column, "flex flex-col gap-2 py-2.5")}>
                        <div className="flex items-center gap-2">
                            <a
                                href={ROUTES.counts}
                                aria-label="Back to counts. Your progress is kept."
                                className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-secondary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                            >
                                <ArrowLeft className="size-5" aria-hidden="true" />
                            </a>
                            <div className="min-w-0 flex-1">
                                <h1 className="truncate text-md font-semibold text-primary">{session.name}</h1>
                                <p className="flex items-center gap-1.5 truncate text-xs text-tertiary">
                                    {session.blind && <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />}
                                    {session.blind ? "Blind count" : "Count"} · {locationName(session.locationId)}
                                    {counter && <span className="max-sm:hidden"> · {counter.name}</span>}
                                </p>
                            </div>
                            {step === "count" && !paused && (
                                <Button size="md" color="secondary" iconLeading={PauseCircle} className="min-h-11" onClick={() => setPaused(true)}>
                                    Pause
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <ProgressBarBase value={counted.length} max={Math.max(total, 1)} className="flex-1" />
                            <p className="shrink-0 text-sm font-semibold text-secondary tabular-nums">
                                {counted.length} of {total} counted
                            </p>
                        </div>
                    </div>
                </header>

                <div className={cx(column, "flex flex-1 flex-col gap-4 py-4")}>
                    {step === "done" ? (
                        <section className="flex flex-col items-center gap-4 rounded-2xl bg-primary px-5 py-8 text-center shadow-xs ring-1 ring-secondary ring-inset">
                            <FeaturedIcon icon={CheckCircle} color="success" theme="light" size="xl" />
                            <div className="flex flex-col gap-1">
                                <h2 className="text-xl font-semibold text-primary">Count submitted</h2>
                                <p className="text-md text-tertiary">
                                    {reviewers.length ? `${reviewers.join(" or ")} will review it.` : "A manager will review it."} Stock on hand changes only
                                    after they approve.
                                </p>
                            </div>
                            <div className="grid w-full grid-cols-3 gap-2 text-left">
                                <Tile label="Lines counted" value={total} />
                                <Tile label="Not found" value={missing} tone="warning" />
                                <Tile label="Notes" value={notes} />
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button size="xl" color="primary" href={ROUTES.counts}>
                                    Back to counts
                                </Button>
                                <Button size="xl" color="secondary" onClick={() => setStep("count")}>
                                    Fix a line
                                </Button>
                            </div>
                        </section>
                    ) : paused ? (
                        <section className="flex flex-col items-center gap-4 rounded-2xl bg-primary px-5 py-8 text-center shadow-xs ring-1 ring-secondary ring-inset">
                            <FeaturedIcon icon={PauseCircle} color="gray" theme="light" size="xl" />
                            <div className="flex flex-col gap-1">
                                <h2 className="text-xl font-semibold text-primary">Count paused</h2>
                                <p className="text-md text-tertiary">
                                    {counted.length} of {total} lines are saved.{" "}
                                    {uncounted.length > 0 ? `${uncounted.length} still to count.` : "Everything is counted."} Pick it up again whenever you are
                                    back at the shelf.
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                                <Button size="xl" color="primary" iconLeading={PlayCircle} onClick={() => setPaused(false)}>
                                    Resume counting
                                </Button>
                                <Button size="xl" color="secondary" href={ROUTES.counts}>
                                    Back to counts
                                </Button>
                            </div>
                        </section>
                    ) : step === "review" ? (
                        <>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-xl font-semibold text-primary">Review and submit</h2>
                                <p className="text-sm text-tertiary">
                                    Check your numbers. After you submit, a manager compares them with what the system expects.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <Tile label="Counted" value={counted.length - missing} />
                                <Tile label="Not found" value={missing} tone="warning" />
                                <Tile label="Uncounted" value={uncounted.length} tone="warning" />
                                <Tile label="Notes" value={notes} />
                            </div>

                            {uncounted.length > 0 && (
                                <section className="flex flex-col gap-4 rounded-xl bg-warning-primary p-4 ring-1 ring-utility-yellow-200 ring-inset">
                                    <div className="flex flex-col gap-1">
                                        <h3 className="text-md font-semibold text-primary">
                                            {uncounted.length} {uncounted.length === 1 ? "line has" : "lines have"} not been counted
                                        </h3>
                                        <p className="text-sm text-secondary">
                                            {uncounted
                                                .slice(0, 4)
                                                .map((l) => l.item.name)
                                                .join(", ")}
                                            {uncounted.length > 4 ? ` and ${uncounted.length - 4} more` : ""}
                                        </p>
                                    </div>
                                    <RadioGroup
                                        aria-label="What to do with uncounted lines"
                                        size="md"
                                        value={uncountedChoice}
                                        onChange={(v) => setUncountedChoice(v as "zero" | "later")}
                                    >
                                        <RadioButton
                                            value="later"
                                            label="Leave them for later"
                                            hint="Saves what you have counted. The count stays open until the rest is done."
                                        />
                                        <RadioButton
                                            value="zero"
                                            label="Record them as zero"
                                            hint="Use this when those spots on the shelf are empty. The reviewer will see each one."
                                        />
                                    </RadioGroup>
                                    <Button
                                        size="lg"
                                        color="secondary"
                                        className="self-start"
                                        onClick={() => {
                                            setFilter("uncounted");
                                            setStep("count");
                                        }}
                                    >
                                        Go back and count them
                                    </Button>
                                </section>
                            )}

                            <section className="flex flex-col gap-2" aria-label="Counted lines">
                                <h3 className="text-sm font-semibold text-secondary">Counted ({counted.length})</h3>
                                {counted.length === 0 ? (
                                    <p className="rounded-xl bg-primary px-4 py-5 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">
                                        Nothing counted yet.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-secondary rounded-xl bg-primary ring-1 ring-secondary ring-inset">
                                        {counted.map((l) => {
                                            const e = entryOf(l.item.id);
                                            return (
                                                <li key={l.item.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-4">
                                                    <div className="min-w-0 flex-1 py-1">
                                                        <p className="truncate text-sm font-medium text-primary">{l.item.name}</p>
                                                        {e.note && <p className="truncate text-sm text-tertiary">Note: {e.note}</p>}
                                                    </div>
                                                    <p
                                                        className={cx(
                                                            "shrink-0 text-sm font-semibold tabular-nums",
                                                            e.missing ? "text-warning-primary" : "text-primary",
                                                        )}
                                                    >
                                                        {e.missing ? "Not found" : entryText(l, e)}
                                                    </p>
                                                    <Button
                                                        size="md"
                                                        color="tertiary"
                                                        className="min-h-11"
                                                        aria-label={`Change the count for ${l.item.name}`}
                                                        onClick={() => {
                                                            patch(l.item.id, { done: false, missing: false });
                                                            jumpTo(l.item.id);
                                                        }}
                                                    >
                                                        Edit
                                                    </Button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>
                        </>
                    ) : (
                        <>
                            <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4" role="group" aria-label="Filter lines">
                                {chips.map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        aria-pressed={filter === c.id}
                                        onClick={() => setFilter(c.id)}
                                        className={cx(
                                            "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2",
                                            filter === c.id
                                                ? "bg-brand-solid text-white ring-transparent"
                                                : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
                                        )}
                                    >
                                        {c.label}
                                        <span className={cx("tabular-nums", filter === c.id ? "text-white/80" : "text-tertiary")}>{c.count}</span>
                                    </button>
                                ))}
                            </div>

                            {session.blind && counted.length === 0 && (
                                <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-secondary ring-1 ring-utility-brand-200 ring-inset">
                                    <EyeOff className="mt-0.5 size-4 shrink-0 text-fg-brand-primary" aria-hidden="true" />
                                    This is a blind count. Write down what is on the shelf. The system quantity is hidden on purpose.
                                </p>
                            )}

                            {visible.length === 0 && (
                                <p className="rounded-xl bg-primary px-4 py-8 text-center text-sm text-tertiary ring-1 ring-secondary ring-inset">
                                    {filter === "uncounted" ? "Every line is counted. Review and submit when you are ready." : "No lines counted yet."}
                                </p>
                            )}

                            {[...groups.entries()].map(([shelf, shelfLines]) => (
                                <section key={shelf} className="flex flex-col gap-2" aria-label={shelf}>
                                    <h2 className="flex items-center justify-between text-sm font-semibold text-secondary">
                                        {shelf}
                                        <span className="font-medium text-tertiary tabular-nums">
                                            {shelfLines.filter((l) => entryOf(l.item.id).done).length} of {shelfLines.length}
                                        </span>
                                    </h2>
                                    <ul className="flex flex-col gap-2">
                                        {shelfLines.map((line) => (
                                            <LineCard
                                                key={line.item.id}
                                                line={line}
                                                entry={entryOf(line.item.id)}
                                                highlight={highlight === line.item.id}
                                                expected={session.blind ? undefined : session.lines.find((l) => l.itemId === line.item.id)?.expected}
                                                onChange={(change) => patch(line.item.id, change)}
                                            />
                                        ))}
                                    </ul>
                                </section>
                            ))}

                            <SampleDataNote>
                                Items and shelves come from Meraki&apos;s spreadsheets. This count session and its saved lines are sample values.
                            </SampleDataNote>
                        </>
                    )}
                </div>

                {step !== "done" && !paused && (
                    <div className="sticky bottom-0 z-20 border-t border-secondary bg-primary/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
                        <div className={cx(column, "flex gap-2 py-3")}>
                            {step === "count" ? (
                                <>
                                    <Button
                                        size="xl"
                                        color="secondary"
                                        iconLeading={QrCode02}
                                        onClick={() => {
                                            setScanMessage(null);
                                            setScanOpen(true);
                                        }}
                                    >
                                        Scan
                                    </Button>
                                    <Button size="xl" color="primary" className="flex-1" onClick={() => setStep("review")}>
                                        Review and submit
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button size="xl" color="secondary" onClick={() => setStep("count")}>
                                        Back
                                    </Button>
                                    <Button size="xl" color="primary" className="flex-1" isDisabled={counted.length === 0} onClick={submit}>
                                        {uncounted.length > 0 && uncountedChoice === "later" ? "Save and finish later" : "Submit count"}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <ModalOverlay isOpen={scanOpen} onOpenChange={setScanOpen} isDismissable className="px-0 pb-0 sm:px-8 sm:pb-8">
                <Modal className="max-w-md max-sm:rounded-b-none">
                    <Dialog aria-label="Scan an item to jump to its line">
                        <div className="flex flex-col">
                            <div className="flex items-center justify-between gap-3 py-2 pr-2 pl-5">
                                <h2 className="text-md font-semibold text-primary">Scan to find a line</h2>
                                <button
                                    type="button"
                                    aria-label="Close scanner"
                                    onClick={() => setScanOpen(false)}
                                    className="flex size-11 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring hover:bg-primary_hover focus-visible:outline-2"
                                >
                                    <XClose className="size-5" aria-hidden="true" />
                                </button>
                            </div>
                            <BarcodeScanner
                                onDetect={onScan}
                                simulate={{ codes: demoCodes, label: (code) => describeCode(code, session.locationId) }}
                                hint="Scan an item to jump to its line"
                                className="h-80"
                            />
                            <p role="status" className={cx("px-5 py-4 text-sm", scanMessage ? "font-medium text-warning-primary" : "text-tertiary")}>
                                {scanMessage ?? "The matching line opens in the list. Nothing is counted by scanning alone."}
                            </p>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
