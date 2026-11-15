"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
    ArrowLeft,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    Copy01,
    Download01,
    Edit05,
    Folder,
    Plus,
    QrCode02,
    ShoppingCart01,
    Trash01,
    XClose,
} from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { NativeSelect } from "@/components/base/select/select-native";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, PageContent, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { CollectionAddItemsDialog } from "@/components/meraki/collection-add-items-dialog";
import { downloadCsv } from "@/components/meraki/collection-export";
import { ColumnHint, InlineNotice, KIND_HINT, KIND_LABEL, PURPOSE_HINT, PURPOSE_LABEL, PURPOSE_ORDER } from "@/components/meraki/collection-meta";
import { CollectionRulesEditor } from "@/components/meraki/collection-rules-editor";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { SaveBar } from "@/components/meraki/save-bar";
import { CountStatusBadge, SampleBadge, StockStatusBadge } from "@/components/meraki/status-badges";
import type { StockRow } from "@/data/inventory";
import { ROLE_LABEL, TODAY, collections, countSessions, getCollection, locationName, serviceRecipes, stockRows, userById, users } from "@/data/inventory";
import type { Collection, CollectionPurpose, LocationId, User } from "@/data/types";
import { resolveCollection } from "@/engine/collections";
import { addDays, formatDate, relativeDays } from "@/engine/dates";
import { can } from "@/engine/permissions";
import { STATUS_LABEL, formatCurrency, formatQty } from "@/engine/stock";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useViewer } from "@/utils/viewer";

const PAGE = 60;

type Editable = Pick<Collection, "name" | "description" | "purpose" | "kind" | "rules" | "match" | "itemIds">;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const isLow = (r: StockRow) => r.status === "low" || r.status === "out";
const unitOf = (unit: string) => (unit.toLowerCase() === "each" ? "unit" : unit.toLowerCase());

/** The parts of a collection a person can change here, in a stable order so two versions can be compared. */
const editable = (c: Collection): Editable => ({
    name: c.name,
    description: c.description || undefined,
    purpose: c.purpose,
    kind: c.kind,
    rules: c.kind === "smart" ? (c.rules ?? []) : undefined,
    match: c.kind === "smart" ? (c.match ?? "all") : undefined,
    itemIds: c.kind === "manual" ? (c.itemIds ?? []) : undefined,
});

const coverText = (r: StockRow) => {
    const days = r.forecast?.daysOfCover;
    if (days === undefined) return undefined;
    return days > 365 ? "365+ days" : plural(Math.round(days), "day");
};

/** The short code that finds the item on the shelf: the colour code for polish, the shelf label for supplies that have one. */
const shelfChip = (r: StockRow) =>
    r.item.kind === "polish" ? r.item.colorCode || r.level.shelf || undefined : r.level.shelf ? `Shelf ${r.level.shelf}` : undefined;

/** The example recipe that shares the most items with the collection, if any. */
const recipeFor = (rows: StockRow[]) => {
    const ids = new Set(rows.map((r) => r.item.id));
    const scored = serviceRecipes
        .map((recipe) => ({ recipe, hits: recipe.lines.filter((l) => l.itemId && ids.has(l.itemId)).length }))
        .sort((a, b) => b.hits - a.hits);
    return scored[0] && scored[0].hits > 0 ? scored[0].recipe : undefined;
};

/** Counts made of mostly the same items as this collection, at this location. */
const countsOf = (rows: StockRow[], location: LocationId) => {
    const ids = new Set(rows.map((r) => r.item.id));
    if (ids.size === 0) return [];
    return countSessions.filter((s) => {
        if (s.locationId !== location) return false;
        const shared = s.lines.filter((l) => ids.has(l.itemId)).length;
        return shared / Math.max(s.lines.length, ids.size) >= 0.6;
    });
};

// ------------------------------------------------------------------------------------ small pieces

const Dash = ({ label }: { label: string }) => (
    <span className="text-quaternary" aria-label={label}>
        –
    </span>
);

const Chip = ({ children }: { children: ReactNode }) => (
    <span className="shrink-0 rounded-md bg-secondary px-1.5 py-px text-xs font-medium whitespace-nowrap text-tertiary ring-1 ring-secondary ring-inset">
        {children}
    </span>
);

/** Polish finishes, each counted on its own: "Regular 3", "Gel 2", "Dip 1". */
const VariantChips = ({ row }: { row: StockRow }) =>
    row.level.variants?.length ? (
        <span className="flex flex-wrap gap-1" data-testid="variant-chips">
            {row.level.variants.map((v) => (
                <span key={v.id} className="rounded bg-secondary px-1.5 py-px text-xs text-tertiary tabular-nums">
                    {v.label} {v.onHand}
                </span>
            ))}
        </span>
    ) : null;

const RailSection = ({ title, badge, children, testId }: { title: string; badge?: ReactNode; children: ReactNode; testId?: string }) => (
    <section className="flex flex-col gap-2.5 py-5 first:pt-0 last:pb-0" data-testid={testId}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
            {title}
            {badge}
        </h2>
        {children}
    </section>
);

const DialogHeader = ({ title, description, onClose }: { title: string; description?: ReactNode; onClose: () => void }) => (
    <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {description && <p className="text-sm text-tertiary">{description}</p>}
        </div>
        <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="-mt-1 -mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
        >
            <XClose className="size-5" aria-hidden="true" />
        </button>
    </div>
);

const Confirmation = ({
    title,
    children,
    link,
    onClose,
    testId,
}: {
    title: string;
    children: ReactNode;
    link: { href: string; label: string };
    onClose: () => void;
    testId: string;
}) => (
    <div className="flex flex-col items-center gap-5 p-6 text-center" data-testid={testId}>
        <span className="flex size-12 items-center justify-center rounded-full bg-success-secondary text-fg-success-primary">
            <CheckCircle className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-1.5" role="status">
            <h2 className="text-lg font-semibold text-primary">{title}</h2>
            {children}
        </div>
        <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <Button size="md" color="secondary" onClick={onClose} className="max-sm:min-h-11 sm:min-w-28">
                Done
            </Button>
            <Button size="md" color="primary" href={link.href} className="max-sm:min-h-11">
                {link.label}
            </Button>
        </div>
    </div>
);

// ------------------------------------------------------------------------------------ count and order dialogs

interface ScheduledCount {
    assigneeId: string;
    dueAt: string;
    blind: boolean;
}

// Mounted only while the dialog is open, so every opening starts from a clean form.
const CountForm = ({
    name,
    itemCount,
    location,
    user,
    onSchedule,
    onClose,
}: {
    name: string;
    itemCount: number;
    location: LocationId;
    user: User;
    onSchedule: (count: ScheduledCount) => void;
    onClose: () => void;
}) => {
    const team = users.filter((u) => u.locations.includes(location) && can(u, "stock.count", location));
    // Default to someone who does not approve counts, so the person scheduling can review it afterwards.
    const [assigneeId, setAssigneeId] = useState(
        (team.find((u) => u.id !== user.id && !can(u, "counts.approve")) ?? team.find((u) => u.id !== user.id) ?? team[0])?.id ?? user.id,
    );
    const [dueAt, setDueAt] = useState(addDays(TODAY, 1));
    const [blind, setBlind] = useState(true);
    const [done, setDone] = useState(false);
    const assignee = userById(assigneeId);

    if (done) {
        return (
            <Confirmation title="Count scheduled" link={{ href: ROUTES.counts, label: "Go to counts" }} onClose={onClose} testId="count-confirmation">
                <p className="text-sm text-secondary">
                    {name}: {plural(itemCount, "item")} at {locationName(location)}, assigned to{" "}
                    {assignee?.id === user.id ? "you" : (assignee?.name ?? "the team")}, due {formatDate(dueAt)}
                    {blind ? ". Blind count." : "."}
                </p>
                <p className="text-sm text-tertiary">Stock on hand changes only after a manager approves the count. Prototype: no reminder is sent.</p>
            </Confirmation>
        );
    }

    return (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
            <DialogHeader title="Count this collection" description={`${name}: ${plural(itemCount, "item")} at ${locationName(location)}.`} onClose={onClose} />
            <NativeSelect
                label="Assigned to"
                size="lg"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.currentTarget.value)}
                options={team.map((u) => ({ label: `${u.name}${u.id === user.id ? " (you)" : ""}, ${ROLE_LABEL[u.role].toLowerCase()}`, value: u.id }))}
                data-testid="count-assignee"
            />
            <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-secondary">Due date</span>
                <input
                    type="date"
                    value={dueAt}
                    min={TODAY}
                    onChange={(event) => setDueAt(event.currentTarget.value || addDays(TODAY, 1))}
                    data-testid="count-due"
                    className="h-11 w-full rounded-lg bg-primary px-3.5 text-md text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset focus-visible:ring-2 focus-visible:ring-brand"
                />
            </label>
            <Toggle
                size="md"
                isSelected={blind}
                onChange={setBlind}
                label="Blind count"
                hint="The counter does not see the expected quantity, so they write down what is on the shelf."
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button size="md" color="secondary" onClick={onClose} className="max-sm:min-h-11">
                    Cancel
                </Button>
                <Button
                    size="md"
                    color="primary"
                    onClick={() => {
                        onSchedule({ assigneeId, dueAt, blind });
                        setDone(true);
                    }}
                    data-testid="count-schedule"
                    className="max-sm:min-h-11"
                >
                    Schedule count
                </Button>
            </div>
        </div>
    );
};

const OrderForm = ({ rows, location, onOrder, onClose }: { rows: StockRow[]; location: LocationId; onOrder: (lines: number) => void; onClose: () => void }) => {
    const [done, setDone] = useState(false);
    const low = rows.filter(isLow);
    const vendorNames = [...new Set(low.map((r) => r.vendor.name))];
    const shown = low.slice(0, 8);

    if (done) {
        return (
            <Confirmation
                title={`${plural(low.length, "item")} added to a draft order`}
                link={{ href: ROUTES.newOrder, label: "Open the draft order" }}
                onClose={onClose}
                testId="order-confirmation"
            >
                <p className="text-sm text-secondary">
                    {vendorNames.length === 1
                        ? `One draft for ${vendorNames[0]}.`
                        : `${plural(vendorNames.length, "draft")}, one per vendor: ${vendorNames.join(", ")}.`}{" "}
                    The quantities are suggestions: check them before you send.
                </p>
                <p className="text-sm text-tertiary">Nothing has been sent to a vendor.</p>
            </Confirmation>
        );
    }

    return (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
            <DialogHeader
                title="Order what's low"
                description={
                    <span data-testid="order-summary">
                        {low.length === 0
                            ? `Nothing in this collection is at or below its reorder point at ${locationName(location)}.`
                            : `${low.length} of ${rows.length} ${low.length === 1 ? "is" : "are"} at or below ${low.length === 1 ? "its" : "their"} reorder point.`}
                    </span>
                }
                onClose={onClose}
            />
            {low.length > 0 && (
                <>
                    <ul className="divide-y divide-secondary rounded-xl ring-1 ring-secondary ring-inset">
                        {shown.map((r) => {
                            const qty = r.forecast?.suggestedOrderQty || r.level.reorderQty;
                            return (
                                <li key={r.item.id} className="flex items-center gap-3 px-3 py-2.5">
                                    <ItemThumb item={r.item} size="sm" />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-sm font-medium text-primary">{r.item.name}</span>
                                        <span className="truncate text-xs text-tertiary">
                                            {STATUS_LABEL[r.status]} · {formatQty(r.level, r.item.unit)}
                                            {r.level.fillLevel ? "" : " on hand"}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-sm text-secondary tabular-nums">{qty ? `Order ${qty}` : "Set on the order"}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="text-sm text-tertiary">
                        {low.length > shown.length ? `And ${low.length - shown.length} more. ` : ""}
                        {vendorNames.length === 1
                            ? `They go on one draft order for ${vendorNames[0]}.`
                            : `They go on ${vendorNames.length} draft orders, one per vendor.`}{" "}
                        Suggested quantities come from the forecast.
                    </p>
                </>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button size="md" color="secondary" onClick={onClose} className="max-sm:min-h-11">
                    {low.length === 0 ? "Close" : "Cancel"}
                </Button>
                {low.length > 0 && (
                    <Button
                        size="md"
                        color="primary"
                        onClick={() => {
                            onOrder(low.length);
                            setDone(true);
                        }}
                        data-testid="order-confirm"
                        className="max-sm:min-h-11"
                    >
                        Add {low.length} to a draft order
                    </Button>
                )}
            </div>
        </div>
    );
};

// ------------------------------------------------------------------------------------ screen

export interface CollectionDetailScreenProps {
    collectionId?: string;
    location?: LocationId;
    /** Defaults to the person using the app. */
    user?: User;
    /** Open with the add-items dialog showing (manual collections). */
    addingItems?: boolean;
    /** Open with the form to add a rule showing (smart collections). */
    editingRules?: boolean;
    /** Edits already made and not yet saved, so the save bar shows. */
    initialChanges?: Partial<Editable>;
}

/**
 * One collection: its items at this location, and what defines it (a hand-picked list or rules).
 * From here people count it, order what is low in it, and change what it holds.
 */
export const CollectionDetailScreen = (props: CollectionDetailScreenProps) => <CollectionDetail key={props.collectionId ?? "col-pedicure"} {...props} />;

const CollectionDetail = ({
    collectionId = "col-pedicure",
    location: initialLocation = "lynnfield",
    user: userProp,
    addingItems = false,
    editingRules = false,
    initialChanges,
}: CollectionDetailScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const isDesktop = useBreakpoint("lg");
    const canEdit = can(user, "stock.adjust");
    const showCosts = can(user, "costs.view");

    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [saved, setSaved] = useState<Collection | undefined>(() => getCollection(collectionId));
    const [draft, setDraft] = useState<Collection | undefined>(() => {
        const found = getCollection(collectionId);
        return found && initialChanges && canEdit ? { ...found, ...initialChanges } : found;
    });
    const [lastEditor, setLastEditor] = useState(saved?.createdBy);
    const [notice, setNotice] = useState<ReactNode>(null);
    const [typeNote, setTypeNote] = useState<string>();
    const [nameInput, setNameInput] = useState<string>();
    const [describing, setDescribing] = useState(false);
    const [addOpen, setAddOpen] = useState(addingItems && canEdit);
    const [ruleFormOpen, setRuleFormOpen] = useState(editingRules && canEdit);
    const [rulesKey, setRulesKey] = useState(0);
    const [countOpen, setCountOpen] = useState(false);
    const [orderOpen, setOrderOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleted, setDeleted] = useState(false);
    const [scheduled, setScheduled] = useState<ScheduledCount[]>([]);
    const [drafted, setDrafted] = useState(0);
    const [costView, setCostView] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const rulesRef = useRef<HTMLDivElement>(null);

    const allRows = useMemo(() => stockRows(location), [location]);
    const rows = useMemo(() => (draft ? resolveCollection(draft, allRows) : []), [draft, allRows]);

    if (!saved || !draft) {
        return (
            <AppShell activeUrl={ROUTES.collections} location={location} onLocationChange={setLocation} user={userProp}>
                <PageContent>
                    <div className="flex flex-col items-start gap-3">
                        <h1 className="text-xl font-semibold text-primary lg:text-display-xs">This collection does not exist</h1>
                        <p className="text-sm text-tertiary">It may have been deleted, or the link is wrong.</p>
                        <Button href={ROUTES.collections} color="secondary" size="md" iconLeading={ArrowLeft}>
                            Back to collections
                        </Button>
                    </div>
                </PageContent>
            </AppShell>
        );
    }

    const place = locationName(location);
    const canCount = can(user, "counts.schedule", location);
    const canOrder = can(user, "orders.create", location);
    const dirty = JSON.stringify(editable(draft)) !== JSON.stringify(editable(saved));
    const manual = draft.kind === "manual";
    const itemIds = draft.itemIds ?? [];
    const low = rows.filter(isLow);
    const incoming = rows.filter((r) => r.incoming > 0).length;
    const value = rows.reduce((sum, r) => sum + r.value, 0);
    const notStockedHere = manual ? itemIds.length - rows.length : 0;
    const shown = rows.slice(0, limit);
    // When every item is in the same room, say so once, under the table.
    const areas = new Set(rows.map((r) => r.level.area));
    const sameArea = rows.length > 1 && areas.size === 1 ? [...areas][0] : undefined;
    const editor = userById(lastEditor);

    const recipe = draft.purpose === "service-kit" ? recipeFor(rows) : undefined;
    const recipeLine = (itemId: string) => recipe?.lines.find((l) => l.itemId === itemId);
    const kitView = Boolean(recipe) && costView;
    const kitCost = recipe
        ? rows.reduce(
              (sum, r) => sum + (recipeLine(r.item.id)?.servicesPerUnit ? (r.item.unitCost ?? 0) / (recipeLine(r.item.id)?.servicesPerUnit ?? 1) : 0),
              0,
          )
        : 0;

    const linkedCounts = countsOf(rows, location);
    const usedFor = linkedCounts.length > 0 || scheduled.length > 0 || drafted > 0 || Boolean(recipe);
    const index = collections.findIndex((c) => c.id === saved.id);
    const previous = index > 0 ? collections[index - 1] : undefined;
    const next = index >= 0 ? collections[index + 1] : undefined;

    const update = (patch: Partial<Editable>) => setDraft((d) => (d ? { ...d, ...patch } : d));

    const move = (rowIndex: number, by: -1 | 1) => {
        const from = rows[rowIndex]?.item.id;
        const to = rows[rowIndex + by]?.item.id;
        if (!from || !to) return;
        update({ itemIds: itemIds.map((id) => (id === from ? to : id === to ? from : id)) });
    };
    const remove = (itemId: string) => update({ itemIds: itemIds.filter((id) => id !== itemId) });

    const setKind = (kind: Collection["kind"]) => {
        if (kind === draft.kind) return;
        if (kind === "manual") {
            // Freeze: the items the rules matched become the fixed list. Without rules there is nothing to freeze.
            const frozen = (draft.rules ?? []).length > 0 ? rows.map((r) => r.item.id) : itemIds;
            update({ kind, itemIds: frozen });
            setTypeNote(
                frozen.length
                    ? `The ${plural(frozen.length, "item")} the rules matched ${frozen.length === 1 ? "is" : "are"} now a fixed list. New stock no longer joins on its own.`
                    : "Rules no longer choose the items. Add them by hand.",
            );
        } else {
            update({ kind, rules: draft.rules ?? [], match: draft.match ?? "all" });
            setTypeNote(itemIds.length ? "Rules now choose the items, and the hand-picked list is set aside." : undefined);
        }
    };

    const scrollToRules = () => requestAnimationFrame(() => rulesRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    const showRuleForm = () => {
        setRuleFormOpen(true);
        setRulesKey((k) => k + 1);
        scrollToRules();
    };

    const save = () => {
        setSaved({ ...draft, updatedAt: TODAY });
        setDraft({ ...draft, updatedAt: TODAY });
        setLastEditor(user.id);
        setTypeNote(undefined);
        setNotice("Changes saved. Prototype: they stay until the page is reloaded.");
    };
    const discard = () => {
        setDraft(saved);
        setTypeNote(undefined);
        setNameInput(undefined);
        setDescribing(false);
        setRuleFormOpen(false);
        setRulesKey((k) => k + 1);
    };

    const commitName = () => {
        const trimmed = nameInput?.trim();
        if (trimmed) update({ name: trimmed });
        setNameInput(undefined);
    };

    const exportItems = () => {
        const done = downloadCsv(
            `${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${location}.csv`,
            ["Item", "Brand", "Where", "Status", "On hand", "Unit", "Incoming", "Par", "Days of cover"],
            rows.map((r) => [
                r.item.name,
                r.item.brand,
                [r.level.area, r.level.shelf].filter(Boolean).join(", "),
                STATUS_LABEL[r.status],
                r.level.onHand,
                r.item.unit,
                r.incoming,
                r.level.par,
                r.forecast?.daysOfCover,
            ]),
        );
        if (done) setNotice(`Exported ${plural(rows.length, "item")} as a spreadsheet file.`);
    };

    const menu = (
        <Dropdown.Root>
            <Button
                size="md"
                color="secondary"
                iconTrailing={ChevronDown}
                data-testid="more-actions"
                className={cx("max-lg:min-h-11", !canCount && "max-lg:flex-1")}
            >
                {isDesktop ? "More actions" : "More"}
            </Button>
            <Dropdown.Popover className="w-64">
                <Dropdown.Menu aria-label="More actions">
                    {!isDesktop && canOrder && (
                        <Dropdown.Item icon={ShoppingCart01} onAction={() => setOrderOpen(true)}>
                            Order what&apos;s low
                        </Dropdown.Item>
                    )}
                    {canEdit && (
                        <Dropdown.Item
                            icon={Copy01}
                            onAction={() =>
                                setNotice(
                                    <>
                                        <span className="font-semibold">{draft.name} copy</span> was created with the same {manual ? "items" : "rules"}.
                                        Prototype: it is not added to the list.
                                    </>,
                                )
                            }
                        >
                            Duplicate
                        </Dropdown.Item>
                    )}
                    <Dropdown.Item
                        icon={QrCode02}
                        isDisabled={rows.length === 0}
                        onAction={() =>
                            setNotice(`Label printing is not connected in the prototype. This would print ${plural(rows.length, "QR label")}, one per item.`)
                        }
                    >
                        Print QR labels for these items
                    </Dropdown.Item>
                    <Dropdown.Item icon={Download01} isDisabled={rows.length === 0} onAction={exportItems}>
                        Export
                    </Dropdown.Item>
                    {canEdit && <Dropdown.Separator />}
                    {canEdit && (
                        <Dropdown.Item icon={Trash01} onAction={() => setDeleteOpen(true)}>
                            Delete collection
                        </Dropdown.Item>
                    )}
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    if (deleted) {
        return (
            <AppShell activeUrl={ROUTES.collections} location={location} onLocationChange={setLocation} user={userProp}>
                <PageContent>
                    <div className="flex flex-col items-start gap-3" role="status" data-testid="deleted">
                        <h1 className="text-xl font-semibold text-primary lg:text-display-xs">{saved.name} was deleted</h1>
                        <p className="max-w-xl text-sm text-tertiary">
                            The items are still in stock, and counts already made from it are kept. Prototype: nothing was removed.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button href={ROUTES.collections} color="primary" size="md" iconLeading={ArrowLeft} className="max-lg:min-h-11">
                                Back to collections
                            </Button>
                            <Button color="secondary" size="md" onClick={() => setDeleted(false)} className="max-lg:min-h-11">
                                Undo
                            </Button>
                        </div>
                    </div>
                </PageContent>
            </AppShell>
        );
    }

    const emptyState = manual ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="empty-collection">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-fg-quaternary">
                <Folder className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
                <h3 className="text-md font-semibold text-primary">
                    {notStockedHere > 0 ? `Nothing in this collection is stocked at ${place}` : "No items in this collection yet"}
                </h3>
                <p className="text-sm text-tertiary">
                    {canEdit ? "Pick the items by hand, or let rules choose them for you." : "Someone who can adjust stock can add items."}
                </p>
            </div>
            {canEdit && (
                <div className="flex flex-col items-center gap-2">
                    <Button
                        size="md"
                        color="primary"
                        iconLeading={Plus}
                        onClick={() => setAddOpen(true)}
                        data-testid="empty-add-items"
                        className="max-lg:min-h-11"
                    >
                        Add items
                    </Button>
                    <Button
                        size="md"
                        color="link-color"
                        onClick={() => {
                            setKind("smart");
                            showRuleForm();
                        }}
                        data-testid="make-smart"
                        className="max-lg:min-h-11"
                    >
                        Or make it smart: add a rule
                    </Button>
                </div>
            )}
        </div>
    ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="empty-collection">
            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-fg-quaternary">
                <Folder className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
                <h3 className="text-md font-semibold text-primary">{(draft.rules ?? []).length ? `No items match the rules at ${place}` : "No rules yet"}</h3>
                <p className="text-sm text-tertiary">
                    {(draft.rules ?? []).length
                        ? "Change the rules to change the list, or check another location."
                        : "Add a rule and the matching items appear here."}
                </p>
            </div>
            {canEdit && (
                <Button size="md" color="secondary" iconLeading={Plus} onClick={showRuleForm} className="max-lg:min-h-11">
                    Add a rule
                </Button>
            )}
        </div>
    );

    const nameCell = (r: StockRow) => (
        <span className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
                <a
                    href={ROUTES.item(r.item.id)}
                    className="truncate rounded-xs text-sm font-medium text-primary outline-focus-ring hover:underline focus-visible:outline-2 max-lg:-my-3 max-lg:py-3"
                    title={r.item.name}
                >
                    {r.item.name}
                </a>
                {shelfChip(r) && <Chip>{shelfChip(r)}</Chip>}
            </span>
            <VariantChips row={r} />
        </span>
    );

    const rowMenu = (r: StockRow, i: number) => (
        <Dropdown.Root>
            <Dropdown.DotsButton className="flex size-11 items-center justify-center" />
            <Dropdown.Popover className="w-56">
                <Dropdown.Menu aria-label={`Actions for ${r.item.name}`}>
                    <Dropdown.Item icon={ChevronUp} isDisabled={i === 0} onAction={() => move(i, -1)}>
                        Move up
                    </Dropdown.Item>
                    <Dropdown.Item icon={ChevronDown} isDisabled={i === rows.length - 1} onAction={() => move(i, 1)}>
                        Move down
                    </Dropdown.Item>
                    <Dropdown.Separator />
                    <Dropdown.Item icon={Trash01} onAction={() => remove(r.item.id)}>
                        Remove from collection
                    </Dropdown.Item>
                </Dropdown.Menu>
            </Dropdown.Popover>
        </Dropdown.Root>
    );

    const th = "px-2 py-2.5 font-semibold";
    const num = "px-2 py-2.5 text-right text-secondary tabular-nums whitespace-nowrap";

    return (
        <AppShell activeUrl={ROUTES.collections} location={location} onLocationChange={setLocation} user={userProp}>
            <PageContent className="lg:gap-6">
                <SaveBar isDirty={dirty} onSave={save} onDiscard={discard} />

                <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                    <div className="flex min-w-0 flex-col gap-1">
                        <a
                            href={ROUTES.collections}
                            className="flex w-fit items-center gap-1.5 rounded-xs text-sm font-medium text-tertiary outline-focus-ring transition duration-100 ease-linear hover:text-secondary focus-visible:outline-2 max-lg:min-h-11"
                        >
                            <ArrowLeft className="size-4" aria-hidden="true" />
                            Collections
                        </a>
                        {nameInput !== undefined ? (
                            <input
                                aria-label="Collection name"
                                autoFocus
                                value={nameInput}
                                onChange={(event) => setNameInput(event.currentTarget.value)}
                                onBlur={commitName}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") commitName();
                                    if (event.key === "Escape") setNameInput(undefined);
                                }}
                                data-testid="name-input"
                                className="-mx-2 w-full max-w-xl rounded-lg bg-primary px-2 py-0.5 text-xl font-semibold text-primary ring-2 ring-brand outline-hidden ring-inset lg:text-display-xs"
                            />
                        ) : (
                            <div className="flex min-w-0 items-center gap-1">
                                <h1 className="min-w-0 text-xl font-semibold text-primary lg:text-display-xs" data-testid="collection-name">
                                    {draft.name}
                                </h1>
                                {canEdit && (
                                    <button
                                        type="button"
                                        aria-label="Rename collection"
                                        onClick={() => setNameInput(draft.name)}
                                        data-testid="rename"
                                        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 lg:size-9"
                                    >
                                        <Edit05 className="size-4" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        )}
                        <p className="text-sm text-tertiary" data-testid="meta-line">
                            {PURPOSE_LABEL[draft.purpose]} · {KIND_LABEL[draft.kind]} · {plural(rows.length, "item")} at {place} · updated{" "}
                            {relativeDays(saved.updatedAt, TODAY)}
                            {editor ? ` by ${editor.name}` : ""}
                            {!canEdit && " · view only"}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {canCount && (
                            <Button
                                size="md"
                                color="primary"
                                iconLeading={ClipboardCheck}
                                onClick={() => setCountOpen(true)}
                                isDisabled={rows.length === 0}
                                data-testid="count-collection"
                                className="max-lg:min-h-11 max-lg:flex-1"
                            >
                                Count this collection
                            </Button>
                        )}
                        {canOrder && (
                            <Button
                                size="md"
                                color="secondary"
                                onClick={() => setOrderOpen(true)}
                                isDisabled={rows.length === 0}
                                data-testid="order-low"
                                className="max-lg:hidden"
                            >
                                Order what&apos;s low
                            </Button>
                        )}
                        {menu}
                        <div className="hidden lg:flex">
                            <Button
                                size="md"
                                color="secondary"
                                iconLeading={ChevronUp}
                                href={previous ? ROUTES.collection(previous.id) : "#"}
                                isDisabled={!previous}
                                aria-label={previous ? `Previous collection: ${previous.name}` : "No previous collection"}
                                className="rounded-r-none"
                            />
                            <Button
                                size="md"
                                color="secondary"
                                iconLeading={ChevronDown}
                                href={next ? ROUTES.collection(next.id) : "#"}
                                isDisabled={!next}
                                aria-label={next ? `Next collection: ${next.name}` : "No next collection"}
                                className="-ml-px rounded-l-none"
                            />
                        </div>
                    </div>
                </header>

                <SampleDataNote className="-mt-2">
                    This collection is an example. Items, shelves and par levels come from Meraki&apos;s spreadsheets; on-hand numbers, costs, counts and the
                    service recipe are sample values.
                </SampleDataNote>

                {notice && <InlineNotice onDismiss={() => setNotice(null)}>{notice}</InlineNotice>}

                <div className="grid gap-6 min-[1360px]:grid-cols-[minmax(0,1fr)_19rem] min-[1360px]:items-start min-[1360px]:gap-8">
                    <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
                        {/* (a) Description */}
                        {describing ? (
                            <Card className="flex flex-col gap-1.5">
                                <label htmlFor="collection-description" className="text-sm font-medium text-secondary">
                                    Description
                                </label>
                                <textarea
                                    id="collection-description"
                                    autoFocus
                                    rows={2}
                                    value={draft.description ?? ""}
                                    onChange={(event) => update({ description: event.currentTarget.value || undefined })}
                                    onFocus={(event) =>
                                        event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)
                                    }
                                    onBlur={() => setDescribing(false)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") event.currentTarget.blur();
                                    }}
                                    placeholder="What it is for, in a sentence."
                                    data-testid="description-input"
                                    className="w-full rounded-lg bg-primary p-3 text-md text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset placeholder:text-placeholder focus:ring-2 focus:ring-brand lg:text-sm"
                                />
                            </Card>
                        ) : draft.description ? (
                            <Card className="flex items-start justify-between gap-3 py-3 lg:py-3.5">
                                <p className="min-w-0 py-1 text-sm text-secondary" data-testid="description">
                                    {draft.description}
                                </p>
                                {canEdit && (
                                    <Button
                                        size="sm"
                                        color="link-color"
                                        onClick={() => setDescribing(true)}
                                        data-testid="edit-description"
                                        className="shrink-0 max-lg:min-h-11"
                                    >
                                        Edit
                                    </Button>
                                )}
                            </Card>
                        ) : (
                            canEdit && (
                                <button
                                    type="button"
                                    onClick={() => setDescribing(true)}
                                    data-testid="add-description"
                                    className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-tertiary ring-1 ring-primary outline-focus-ring transition duration-100 ease-linear ring-inset hover:bg-primary_hover hover:text-secondary focus-visible:outline-2 max-lg:min-h-11"
                                >
                                    <Plus className="size-4" aria-hidden="true" />
                                    Add a description
                                </button>
                            )
                        )}

                        {/* (b) Items */}
                        <Card padded={false} className="overflow-hidden">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 lg:px-5">
                                <h2 className="text-md font-semibold text-primary">
                                    Items <span className="font-medium text-tertiary tabular-nums">{rows.length.toLocaleString("en-US")}</span>
                                </h2>
                                <div className="flex items-center gap-2">
                                    {recipe && rows.length > 0 && (
                                        <ButtonGroup
                                            size="sm"
                                            aria-label="Columns"
                                            selectedKeys={[kitView ? "costs" : "stock"]}
                                            disallowEmptySelection
                                            onSelectionChange={(keys) => setCostView([...keys][0] === "costs")}
                                        >
                                            <ButtonGroupItem id="stock" className="max-lg:min-h-11">
                                                Stock
                                            </ButtonGroupItem>
                                            <ButtonGroupItem id="costs" data-testid="kit-view" className="max-lg:min-h-11">
                                                Per service
                                            </ButtonGroupItem>
                                        </ButtonGroup>
                                    )}
                                    {manual && canEdit && rows.length > 0 && (
                                        <Button
                                            size="sm"
                                            color="secondary"
                                            iconLeading={Plus}
                                            onClick={() => setAddOpen(true)}
                                            data-testid="add-items"
                                            className="max-lg:min-h-11"
                                        >
                                            Add items
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {!manual && (
                                <p
                                    className="flex flex-wrap items-center gap-x-2 border-t border-secondary px-4 py-2.5 text-sm text-tertiary lg:px-5"
                                    data-testid="smart-note"
                                >
                                    Items are chosen by the rules. Change the rules to change the list.
                                    {canEdit && (
                                        <Button size="sm" color="link-color" onClick={scrollToRules} className="max-lg:min-h-11 min-[1360px]:hidden">
                                            Go to the rules
                                        </Button>
                                    )}
                                </p>
                            )}

                            {rows.length === 0 ? (
                                <div className="border-t border-secondary">{emptyState}</div>
                            ) : (
                                <>
                                    {/* Desktop: one line per item. */}
                                    <div className="hidden overflow-x-auto border-t border-secondary lg:block">
                                        <table className="w-full min-w-[38rem] table-fixed text-left text-sm" data-testid="items-table">
                                            <caption className="sr-only">
                                                Items in {draft.name} at {place}
                                            </caption>
                                            <thead className="border-b border-secondary bg-secondary text-xs text-tertiary">
                                                <tr>
                                                    {manual && canEdit && (
                                                        <th scope="col" className="w-9 py-2.5 pl-3">
                                                            <span className="sr-only">Order</span>
                                                        </th>
                                                    )}
                                                    <th scope="col" className={cx(th, manual && canEdit ? "pl-1" : "pl-5")}>
                                                        Item
                                                    </th>
                                                    <th scope="col" className={cx(th, "w-[7.25rem]")}>
                                                        Status
                                                    </th>
                                                    <th scope="col" className={cx(th, "w-20 text-right")}>
                                                        On hand
                                                    </th>
                                                    {kitView ? (
                                                        <>
                                                            <th scope="col" className={cx(th, "w-36 text-right")}>
                                                                <ColumnHint
                                                                    label="Services per container"
                                                                    hint={`How many services one container covers. Example numbers from the ${recipe?.service.toLowerCase()} recipe.`}
                                                                />
                                                            </th>
                                                            {showCosts && (
                                                                <th scope="col" className={cx(th, "w-28 text-right")}>
                                                                    <ColumnHint
                                                                        label="Cost per service"
                                                                        hint="Unit cost divided by services per container. Unit costs are sample values."
                                                                    />
                                                                </th>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <th scope="col" className={cx(th, "w-[4.5rem] text-right")}>
                                                                <ColumnHint label="Incoming" hint="Ordered in the last 120 days and not yet received." />
                                                            </th>
                                                            <th scope="col" className={cx(th, "w-12 text-right")}>
                                                                <ColumnHint label="Par" hint="The quantity this shelf should hold." />
                                                            </th>
                                                            <th scope="col" className={cx(th, "w-24 text-right")}>
                                                                <ColumnHint
                                                                    label="Days of cover"
                                                                    hint="How long what is on hand lasts at the usual rate of use."
                                                                />
                                                            </th>
                                                        </>
                                                    )}
                                                    <th scope="col" className={manual && canEdit ? "w-10" : "w-3"}>
                                                        {manual && canEdit && <span className="sr-only">Remove</span>}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-secondary">
                                                {shown.map((r, i) => {
                                                    const line = recipeLine(r.item.id);
                                                    return (
                                                        <tr
                                                            key={r.item.id}
                                                            data-testid="item-row"
                                                            data-item={r.item.id}
                                                            className="transition duration-100 ease-linear hover:bg-primary_hover"
                                                        >
                                                            {manual && canEdit && (
                                                                <td className="py-1 pl-3">
                                                                    <div className="flex flex-col">
                                                                        <button
                                                                            type="button"
                                                                            aria-label={`Move ${r.item.name} up`}
                                                                            disabled={i === 0}
                                                                            onClick={() => move(i, -1)}
                                                                            data-testid="move-up"
                                                                            className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-secondary_hover hover:text-fg-secondary focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30"
                                                                        >
                                                                            <ChevronUp className="size-4" aria-hidden="true" />
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            aria-label={`Move ${r.item.name} down`}
                                                                            disabled={i === rows.length - 1}
                                                                            onClick={() => move(i, 1)}
                                                                            data-testid="move-down"
                                                                            className="flex h-5 w-6 cursor-pointer items-center justify-center rounded text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-secondary_hover hover:text-fg-secondary focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30"
                                                                        >
                                                                            <ChevronDown className="size-4" aria-hidden="true" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            <td className={cx("py-2.5 pr-2", manual && canEdit ? "pl-1" : "pl-5")}>
                                                                <div className="flex min-w-0 items-center gap-2.5">
                                                                    <ItemThumb item={r.item} size="sm" />
                                                                    {nameCell(r)}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-2.5">
                                                                <StockStatusBadge status={r.status} />
                                                            </td>
                                                            <td className={num}>{formatQty(r.level, r.item.unit)}</td>
                                                            {kitView ? (
                                                                <>
                                                                    <td className={cx(num, "text-tertiary")}>
                                                                        {line ? (
                                                                            `${line.servicesPerUnit} per ${unitOf(r.item.unit)}`
                                                                        ) : (
                                                                            <Dash label="Not in the recipe" />
                                                                        )}
                                                                    </td>
                                                                    {showCosts && (
                                                                        <td className={cx(num, "text-tertiary")}>
                                                                            {line && line.servicesPerUnit > 0 && r.item.unitCost !== undefined ? (
                                                                                formatCurrency(r.item.unitCost / line.servicesPerUnit, true)
                                                                            ) : (
                                                                                <Dash label="Not in the recipe" />
                                                                            )}
                                                                        </td>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td className={num}>
                                                                        {r.incoming > 0 ? `+${r.incoming}` : <Dash label="Nothing on order" />}
                                                                    </td>
                                                                    <td className={num}>{r.level.par ?? <Dash label="No par set" />}</td>
                                                                    <td className={num}>{coverText(r) ?? <Dash label="No forecast" />}</td>
                                                                </>
                                                            )}
                                                            <td className="pr-2">
                                                                {manual && canEdit && (
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Remove ${r.item.name} from the collection`}
                                                                        onClick={() => remove(r.item.id)}
                                                                        data-testid="remove-item"
                                                                        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-secondary_hover hover:text-fg-secondary focus-visible:outline-2"
                                                                    >
                                                                        <XClose className="size-4" aria-hidden="true" />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Phone: the same facts as compact rows. */}
                                    <ul className="divide-y divide-secondary border-t border-secondary lg:hidden" data-testid="items-list">
                                        {shown.map((r, i) => {
                                            const line = recipeLine(r.item.id);
                                            const facts = kitView
                                                ? line
                                                    ? [
                                                          `${line.servicesPerUnit} services per ${unitOf(r.item.unit)}`,
                                                          showCosts && line.servicesPerUnit > 0 && r.item.unitCost !== undefined
                                                              ? `${formatCurrency(r.item.unitCost / line.servicesPerUnit, true)} per service`
                                                              : undefined,
                                                      ]
                                                    : ["Not in the recipe"]
                                                : [
                                                      formatQty(r.level, r.item.unit),
                                                      r.level.par !== undefined ? `par ${r.level.par}` : undefined,
                                                      r.incoming > 0 ? `${r.incoming} incoming` : undefined,
                                                      coverText(r) ? `${coverText(r)} of cover` : undefined,
                                                  ];
                                            return (
                                                <li
                                                    key={r.item.id}
                                                    data-testid="item-card"
                                                    className={cx("flex items-center gap-3 py-3 pl-4", manual && canEdit ? "pr-1" : "pr-4")}
                                                >
                                                    <ItemThumb item={r.item} size="md" />
                                                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                                                        {nameCell(r)}
                                                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                                            <StockStatusBadge status={r.status} />
                                                            <span className="text-sm text-tertiary tabular-nums">{facts.filter(Boolean).join(" · ")}</span>
                                                        </div>
                                                    </div>
                                                    {manual && canEdit && rowMenu(r, i)}
                                                </li>
                                            );
                                        })}
                                    </ul>

                                    {rows.length > shown.length && (
                                        <div className="flex items-center justify-center gap-3 border-t border-secondary px-4 py-2.5">
                                            <Button size="sm" color="link-color" onClick={() => setLimit((n) => n + PAGE)} className="max-lg:min-h-11">
                                                Show more
                                            </Button>
                                            <span className="text-xs text-tertiary">
                                                Showing {shown.length} of {rows.length.toLocaleString("en-US")}
                                            </span>
                                        </div>
                                    )}

                                    {/* (c) Summary */}
                                    <p
                                        className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-secondary bg-secondary px-4 py-2.5 text-sm text-tertiary lg:px-5"
                                        data-testid="summary-line"
                                    >
                                        <span>
                                            {plural(rows.length, "item")}
                                            {sameArea ? `, all in ${sameArea}` : ""} · {low.length ? `${low.length} low or out` : "none low or out"}
                                            {incoming > 0 ? ` · ${incoming} with stock on the way` : ""}
                                            {notStockedHere > 0 ? ` · ${notStockedHere} not stocked at ${place}` : ""}
                                        </span>
                                        {kitView && showCosts && recipe ? (
                                            <span className="flex items-center gap-1.5">
                                                · about {formatCurrency(kitCost, true)} of product per {recipe.service.toLowerCase()}
                                                <SampleBadge label="Example" />
                                            </span>
                                        ) : (
                                            showCosts && (
                                                <span className="flex items-center gap-1.5">
                                                    · {formatCurrency(value)} on hand
                                                    <SampleBadge />
                                                </span>
                                            )
                                        )}
                                    </p>
                                </>
                            )}
                        </Card>
                    </div>

                    {/* Right rail: what defines the collection and where it is used. */}
                    <aside className="flex flex-col divide-y divide-secondary" aria-label="Collection settings">
                        <RailSection title="Type" testId="type-section">
                            {canEdit ? (
                                <ButtonGroup
                                    size="sm"
                                    aria-label="Type"
                                    selectedKeys={[draft.kind]}
                                    disallowEmptySelection
                                    onSelectionChange={(keys) => {
                                        const kind = [...keys][0];
                                        if (kind === "manual" || kind === "smart") setKind(kind);
                                    }}
                                    className="w-full"
                                >
                                    <ButtonGroupItem id="manual" data-testid="type-manual" className="min-h-10 flex-1 justify-center lg:min-h-0">
                                        Manual
                                    </ButtonGroupItem>
                                    <ButtonGroupItem id="smart" data-testid="type-smart" className="min-h-10 flex-1 justify-center lg:min-h-0">
                                        Smart
                                    </ButtonGroupItem>
                                </ButtonGroup>
                            ) : (
                                <p className="text-sm font-medium text-secondary">{KIND_LABEL[draft.kind]}</p>
                            )}
                            <p className="text-sm text-tertiary" data-testid="type-note" aria-live="polite">
                                {typeNote ?? KIND_HINT[draft.kind]}
                            </p>
                        </RailSection>

                        {!manual && (
                            <RailSection title="Rules" testId="rules-section">
                                <div ref={rulesRef}>
                                    <CollectionRulesEditor
                                        key={rulesKey}
                                        rules={draft.rules ?? []}
                                        match={draft.match ?? "all"}
                                        rows={allRows}
                                        onChange={({ rules, match }) => update({ rules, match })}
                                        readOnly={!canEdit}
                                        defaultAdding={ruleFormOpen}
                                        locationLabel={place}
                                    />
                                </div>
                            </RailSection>
                        )}

                        <RailSection title="Purpose" testId="purpose-section">
                            {canEdit ? (
                                <NativeSelect
                                    aria-label="Purpose"
                                    size="sm"
                                    value={draft.purpose}
                                    onChange={(event) => update({ purpose: event.currentTarget.value as CollectionPurpose })}
                                    options={PURPOSE_ORDER.map((p) => ({ label: PURPOSE_LABEL[p], value: p }))}
                                    selectClassName="min-h-10 lg:min-h-0"
                                    data-testid="purpose"
                                />
                            ) : (
                                <p className="text-sm font-medium text-secondary">{PURPOSE_LABEL[draft.purpose]}</p>
                            )}
                            <p className="text-sm text-tertiary">{PURPOSE_HINT[draft.purpose]}</p>
                        </RailSection>

                        <RailSection title="Used for" testId="used-for" badge={usedFor ? <SampleBadge /> : undefined}>
                            {!usedFor ? (
                                <p className="text-sm text-tertiary">Nothing yet. Counts made from this collection are listed here.</p>
                            ) : (
                                <ul className="flex flex-col gap-2.5">
                                    {scheduled.map((count, i) => (
                                        <li key={`new-${i}`} className="flex flex-col gap-0.5" data-testid="scheduled-count">
                                            <span className="flex items-center gap-2">
                                                <a
                                                    href={ROUTES.counts}
                                                    className="truncate rounded-xs text-sm font-medium text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2 max-lg:-my-3 max-lg:py-3"
                                                >
                                                    Count of {draft.name}
                                                </a>
                                                <CountStatusBadge status="scheduled" />
                                            </span>
                                            <span className="text-sm text-tertiary">
                                                Due {formatDate(count.dueAt)} · {userById(count.assigneeId)?.name}
                                            </span>
                                        </li>
                                    ))}
                                    {drafted > 0 && (
                                        <li className="flex flex-col gap-0.5" data-testid="drafted-order">
                                            <a
                                                href={ROUTES.newOrder}
                                                className="w-fit rounded-xs text-sm font-medium text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2 max-lg:-my-3 max-lg:py-3"
                                            >
                                                Draft order
                                            </a>
                                            <span className="text-sm text-tertiary">{plural(drafted, "line")} from this collection, not sent yet.</span>
                                        </li>
                                    )}
                                    {linkedCounts.map((session) => (
                                        <li key={session.id} className="flex flex-col gap-0.5">
                                            <span className="flex items-center gap-2">
                                                <a
                                                    href={ROUTES.count(session.id)}
                                                    className="truncate rounded-xs text-sm font-medium text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2 max-lg:-my-3 max-lg:py-3"
                                                >
                                                    Count: {session.name}
                                                </a>
                                                <CountStatusBadge status={session.status} />
                                            </span>
                                            <span className="text-sm text-tertiary">
                                                Due {formatDate(session.dueAt)} · {userById(session.assignedTo)?.name}
                                            </span>
                                        </li>
                                    ))}
                                    {recipe && (
                                        <li className="flex flex-col gap-0.5">
                                            <a
                                                href={ROUTES.insights}
                                                className="w-fit rounded-xs text-sm font-medium text-brand-secondary outline-focus-ring hover:underline focus-visible:outline-2 max-lg:-my-3 max-lg:py-3"
                                            >
                                                Recipe: {recipe.service}
                                            </a>
                                            <span className="text-sm text-tertiary">Cost per service, in Insights. An example recipe.</span>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </RailSection>

                        <RailSection title="Details" testId="details">
                            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                                <dt className="text-tertiary">Created by</dt>
                                <dd className="text-secondary">{userById(saved.createdBy)?.name ?? "Unknown"}</dd>
                                <dt className="text-tertiary">Updated</dt>
                                <dd className="text-secondary">
                                    {formatDate(saved.updatedAt, true)}
                                    {editor ? `, ${editor.name}` : ""}
                                </dd>
                                <dt className="text-tertiary">Location</dt>
                                <dd className="text-secondary">Same collection at every location; the items shown are {place}&apos;s.</dd>
                            </dl>
                        </RailSection>
                    </aside>
                </div>
            </PageContent>

            <CollectionAddItemsDialog
                isOpen={addOpen}
                onOpenChange={setAddOpen}
                rows={allRows.filter((r) => !itemIds.includes(r.item.id))}
                collectionName={draft.name}
                onAdd={(ids) => update({ itemIds: [...itemIds, ...ids] })}
            />

            <ModalOverlay isOpen={countOpen} onOpenChange={setCountOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Count this collection">
                        <CountForm
                            name={draft.name}
                            itemCount={rows.length}
                            location={location}
                            user={user}
                            onSchedule={(count) => setScheduled((list) => [count, ...list])}
                            onClose={() => setCountOpen(false)}
                        />
                    </Dialog>
                </Modal>
            </ModalOverlay>

            <ModalOverlay isOpen={orderOpen} onOpenChange={setOrderOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Order what's low">
                        <OrderForm rows={rows} location={location} onOrder={setDrafted} onClose={() => setOrderOpen(false)} />
                    </Dialog>
                </Modal>
            </ModalOverlay>

            <ModalOverlay isOpen={deleteOpen} onOpenChange={setDeleteOpen} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Delete collection" role="alertdialog">
                        <div className="flex flex-col gap-5 p-5 sm:p-6">
                            <DialogHeader
                                title={`Delete ${saved.name}?`}
                                description="The items stay in stock and keep their history. Counts already made from this collection are kept."
                                onClose={() => setDeleteOpen(false)}
                            />
                            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <Button size="md" color="secondary" onClick={() => setDeleteOpen(false)} className="max-sm:min-h-11">
                                    Keep it
                                </Button>
                                <Button
                                    size="md"
                                    color="primary-destructive"
                                    onClick={() => {
                                        setDeleteOpen(false);
                                        setDeleted(true);
                                    }}
                                    data-testid="delete-confirm"
                                    className="max-sm:min-h-11"
                                >
                                    Delete collection
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
