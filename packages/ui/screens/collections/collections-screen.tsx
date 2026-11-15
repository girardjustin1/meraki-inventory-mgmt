"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, ChevronSelectorVertical, Download01, Folder, Plus, SearchLg, Upload01, XClose } from "@untitledui/icons";
import { Button as AriaButton, Radio as AriaRadio, RadioGroup as AriaRadioGroup } from "react-aria-components";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { Input } from "@/components/base/input/input";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import { TextArea } from "@/components/base/textarea/textarea";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { downloadCsv } from "@/components/meraki/collection-export";
import {
    CollectionPurposeChip,
    ColumnHint,
    InlineNotice,
    KIND_HINT,
    KIND_LABEL,
    PURPOSE_HINT,
    PURPOSE_LABEL,
    PURPOSE_ORDER,
    summariseRules,
} from "@/components/meraki/collection-meta";
import { TODAY, locationName, collections as seedCollections, stockRows } from "@/data/inventory";
import type { Collection, CollectionPurpose, LocationId, User } from "@/data/types";
import { resolveCollection } from "@/engine/collections";
import { relativeDays } from "@/engine/dates";
import { can } from "@/engine/permissions";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";

export type CollectionsView = "all" | CollectionPurpose;

const VIEWS: { id: CollectionsView; label: string }[] = [
    { id: "all", label: "All" },
    { id: "shelf", label: "Shelves" },
    { id: "service-kit", label: "Service kits" },
    { id: "count-list", label: "Count lists" },
    { id: "general", label: "Other" },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "5 days ago" reads better with a capital at the start of a cell. */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

interface CollectionInfo {
    collection: Collection;
    items: number;
    lowOrOut: number;
    /** The oldest count date among the items that have one. */
    oldestCount?: string;
    /** Items with no count on record. */
    neverCounted: number;
    isNew: boolean;
}

const kindText = (c: Collection) => (c.kind === "smart" ? summariseRules(c) : undefined);

const countedText = (info: CollectionInfo) => {
    if (info.items === 0) return undefined;
    if (!info.oldestCount) return "Not counted yet";
    const oldest = sentence(relativeDays(info.oldestCount, TODAY));
    return info.neverCounted > 0 ? `${oldest}, ${info.neverCounted} not yet` : oldest;
};

// ------------------------------------------------------------------------------------ small pieces

const RadioCard = ({ value, title, hint }: { value: string; title: string; hint: string }) => (
    <AriaRadio
        value={value}
        className={({ isSelected, isFocusVisible }) =>
            cx(
                "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 transition duration-100 ease-linear ring-inset",
                isSelected ? "bg-brand-primary_alt ring-2 ring-brand" : "bg-primary ring-secondary hover:bg-primary_hover",
                isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring",
            )
        }
    >
        {({ isSelected, isFocusVisible }) => (
            <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-primary">{title}</span>
                    <span className="text-sm text-tertiary">{hint}</span>
                </span>
                <RadioButtonBase size="md" isSelected={isSelected} isFocusVisible={isFocusVisible} className="mt-0.5" />
            </>
        )}
    </AriaRadio>
);

// ------------------------------------------------------------------------------------ new collection

interface NewCollectionFormProps {
    creatorId: string;
    /** Names already in use, lower-cased, so two collections do not end up with the same name. */
    taken: string[];
    onCreate: (collection: Collection) => void;
    onClose: () => void;
}

// Mounted only while the dialog is open, so every opening starts from a clean form.
const NewCollectionForm = ({ creatorId, taken, onCreate, onClose }: NewCollectionFormProps) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [purpose, setPurpose] = useState<CollectionPurpose>("shelf");
    const [kind, setKind] = useState<Collection["kind"]>("manual");
    const [tried, setTried] = useState(false);

    const trimmed = name.trim();
    const duplicate = taken.includes(trimmed.toLowerCase());
    const error = !trimmed ? "Give the collection a name." : duplicate ? "A collection with this name already exists." : undefined;

    const create = () => {
        setTried(true);
        if (error) return;
        onCreate({
            id: `col-new-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            name: trimmed,
            description: description.trim() || undefined,
            kind,
            purpose,
            ...(kind === "smart" ? { rules: [], match: "all" as const } : { itemIds: [] }),
            createdBy: creatorId,
            updatedAt: TODAY,
        });
    };

    return (
        <form
            className="flex flex-col gap-5 p-4 sm:p-6"
            onSubmit={(event) => {
                event.preventDefault();
                create();
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold text-primary">New collection</h2>
                    <p className="text-sm text-tertiary">A saved set of items you can count, restock or order together.</p>
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

            <Input
                label="Name"
                placeholder="Manicure station"
                size="md"
                value={name}
                onChange={setName}
                autoFocus
                isRequired
                hideRequiredIndicator
                isInvalid={tried && Boolean(error)}
                hint={tried ? error : undefined}
                inputClassName="min-h-11"
                data-testid="new-collection-name"
            />
            <TextArea
                label="Description"
                placeholder="What it is for, in a sentence. Optional."
                size="sm"
                rows={2}
                value={description}
                onChange={setDescription}
                data-testid="new-collection-description"
            />

            <AriaRadioGroup aria-label="What it is for" value={purpose} onChange={(v) => setPurpose(v as CollectionPurpose)} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-secondary">What it is for</span>
                <div className="grid gap-2 sm:grid-cols-2">
                    {PURPOSE_ORDER.map((p) => (
                        <RadioCard key={p} value={p} title={PURPOSE_LABEL[p]} hint={PURPOSE_HINT[p]} />
                    ))}
                </div>
            </AriaRadioGroup>

            <AriaRadioGroup aria-label="How items get in" value={kind} onChange={(v) => setKind(v as Collection["kind"])} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-secondary">How items get in</span>
                <div className="grid gap-2 sm:grid-cols-2">
                    <RadioCard value="manual" title={KIND_LABEL.manual} hint={KIND_HINT.manual} />
                    <RadioCard value="smart" title={KIND_LABEL.smart} hint={KIND_HINT.smart} />
                </div>
            </AriaRadioGroup>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button size="md" color="secondary" onClick={onClose} className="max-sm:min-h-11">
                    Cancel
                </Button>
                <Button type="submit" size="md" color="primary" data-testid="new-collection-create" className="max-sm:min-h-11">
                    Create collection
                </Button>
            </div>
        </form>
    );
};

// ------------------------------------------------------------------------------------ screen

export interface CollectionsScreenProps {
    location?: LocationId;
    /** Defaults to the person using the app. */
    user?: User;
    /** The view to open on: all collections, or one purpose. */
    initialView?: CollectionsView;
    initialQuery?: string;
    /** Open with the "New collection" dialog showing. */
    creating?: boolean;
}

/**
 * Collections: saved sets of items (shelves, service kits, count lists) that people count,
 * restock and order together. One row per collection, with what it holds at this location.
 */
export const CollectionsScreen = ({
    location: initialLocation = "lynnfield",
    user: userProp,
    initialView = "all",
    initialQuery = "",
    creating = false,
}: CollectionsScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const canEdit = can(user, "stock.adjust");

    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [view, setView] = useState<CollectionsView>(initialView);
    const [query, setQuery] = useState(initialQuery);
    const [created, setCreated] = useState<Collection[]>([]);
    const [dialogOpen, setDialogOpen] = useState(creating && canEdit);
    const [notice, setNotice] = useState<ReactNode>(null);

    useUrlSync({ view: view === "all" ? undefined : view, q: query });

    const rows = useMemo(() => stockRows(location), [location]);
    const all = useMemo<CollectionInfo[]>(
        () =>
            [...created, ...seedCollections].map((collection) => {
                const members = resolveCollection(collection, rows);
                const counted = members
                    .map((r) => r.level.lastCountedAt)
                    .filter((d): d is string => Boolean(d))
                    .sort();
                return {
                    collection,
                    items: members.length,
                    lowOrOut: members.filter((r) => r.status === "low" || r.status === "out").length,
                    oldestCount: counted[0],
                    neverCounted: members.length - counted.length,
                    isNew: created.includes(collection),
                };
            }),
        [created, rows],
    );

    const counts = useMemo(() => {
        const out: Record<CollectionsView, number> = { all: all.length, shelf: 0, "service-kit": 0, "count-list": 0, general: 0 };
        for (const info of all) out[info.collection.purpose] += 1;
        return out;
    }, [all]);

    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter((info) => {
        if (view !== "all" && info.collection.purpose !== view) return false;
        const c = info.collection;
        const text = [c.name, c.description, PURPOSE_LABEL[c.purpose], KIND_LABEL[c.kind], kindText(c)].filter(Boolean).join(" ").toLowerCase();
        return words.every((w) => text.includes(w));
    });

    const currentView = VIEWS.find((v) => v.id === view) ?? (VIEWS[0] as (typeof VIEWS)[number]);
    const place = locationName(location);

    const exportList = () => {
        const done = downloadCsv(
            `collections-${location}.csv`,
            ["Collection", "Purpose", "Type", "Rules", `Items at ${place}`, "Low or out", "Oldest count", "Updated"],
            shown.map((i) => [
                i.collection.name,
                PURPOSE_LABEL[i.collection.purpose],
                KIND_LABEL[i.collection.kind],
                kindText(i.collection),
                i.items,
                i.lowOrOut,
                i.oldestCount,
                i.collection.updatedAt,
            ]),
        );
        if (done) setNotice(`Exported ${plural(shown.length, "collection")} as a spreadsheet file.`);
    };

    const clearFilters = () => {
        setQuery("");
        setView("all");
    };

    return (
        <AppShell activeUrl={ROUTES.collections} location={location} onLocationChange={setLocation} user={userProp}>
            <PageContent className="lg:gap-6">
                <PageHeader
                    title={
                        <>
                            Stock <em>collections</em>
                        </>
                    }
                    description="Saved sets of items. Use one to count a shelf, restock a station or order what is low, all in one go."
                    actions={
                        <>
                            <Dropdown.Root>
                                <Button
                                    size="md"
                                    color="secondary"
                                    iconTrailing={ChevronDown}
                                    data-testid="more-actions"
                                    className={cx(!canEdit && "max-lg:flex-1")}
                                >
                                    More actions
                                </Button>
                                <Dropdown.Popover className="w-64">
                                    <Dropdown.Menu aria-label="More actions">
                                        <Dropdown.Item icon={Download01} onAction={exportList}>
                                            Export this list
                                        </Dropdown.Item>
                                        {canEdit && (
                                            <Dropdown.Item
                                                icon={Upload01}
                                                onAction={() =>
                                                    setNotice("Importing from a spreadsheet is not connected in the prototype. Nothing was changed.")
                                                }
                                            >
                                                Import from a spreadsheet
                                            </Dropdown.Item>
                                        )}
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown.Root>
                            {canEdit && (
                                <Button
                                    size="md"
                                    color="primary"
                                    iconLeading={Plus}
                                    onClick={() => setDialogOpen(true)}
                                    data-testid="new-collection"
                                    className="max-lg:flex-1"
                                >
                                    New collection
                                </Button>
                            )}
                        </>
                    }
                />

                <div className="flex flex-col gap-3">
                    <SampleDataNote>
                        These collections are examples built from Meraki&apos;s catalogue. Items, shelves and par levels come from the spreadsheets; on-hand
                        numbers, count dates and all Newburyport stock are sample values.
                    </SampleDataNote>

                    {notice && <InlineNotice onDismiss={() => setNotice(null)}>{notice}</InlineNotice>}

                    {/* One control bar: the view picker and the search. */}
                    <div
                        className="flex items-center gap-1 rounded-xl bg-primary p-1 shadow-xs ring-1 ring-secondary ring-inset has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-brand"
                        data-testid="control-bar"
                    >
                        {/* Phone: the views fold into one picker so the search keeps its room. */}
                        <div className="lg:hidden">
                            <Dropdown.Root>
                                <AriaButton
                                    aria-label={`View: ${currentView.label}`}
                                    data-testid="view-picker"
                                    className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg pr-2 pl-3 text-sm font-semibold whitespace-nowrap text-secondary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                >
                                    {currentView.label}
                                    <span className="font-medium text-quaternary tabular-nums">{counts[view]}</span>
                                    <ChevronSelectorVertical className="size-4 text-fg-quaternary" aria-hidden="true" />
                                </AriaButton>
                                <Dropdown.Popover placement="bottom left" className="w-56">
                                    <Dropdown.Menu
                                        aria-label="View"
                                        selectionMode="single"
                                        selectedKeys={[view]}
                                        onSelectionChange={(keys) => {
                                            const next = [...keys][0];
                                            if (typeof next === "string") setView(next as CollectionsView);
                                        }}
                                    >
                                        {VIEWS.map((v) => (
                                            <Dropdown.Item key={v.id} id={v.id} addon={String(counts[v.id])} textValue={v.label}>
                                                {v.label}
                                            </Dropdown.Item>
                                        ))}
                                    </Dropdown.Menu>
                                </Dropdown.Popover>
                            </Dropdown.Root>
                        </div>

                        <div role="group" aria-label="View" className="hidden items-center gap-0.5 lg:flex">
                            {VIEWS.map((v) => (
                                <button
                                    key={v.id}
                                    type="button"
                                    aria-pressed={view === v.id}
                                    data-testid={`view-${v.id}`}
                                    onClick={() => setView(v.id)}
                                    className={cx(
                                        "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2",
                                        view === v.id ? "bg-secondary text-primary" : "text-tertiary hover:bg-primary_hover hover:text-secondary",
                                    )}
                                >
                                    {v.label}
                                    <span className={cx("text-xs font-medium tabular-nums", view === v.id ? "text-tertiary" : "text-quaternary")}>
                                        {counts[v.id]}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <span className="mx-1 h-6 w-px shrink-0 bg-border-secondary" aria-hidden="true" />

                        <label className="flex min-w-0 flex-1 items-center gap-2 pr-1 pl-1.5">
                            <SearchLg className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                            <input
                                type="search"
                                aria-label="Search collections"
                                placeholder="Search collections"
                                value={query}
                                onChange={(event) => setQuery(event.currentTarget.value)}
                                data-testid="collections-search"
                                className="min-h-11 w-full min-w-0 bg-transparent text-md text-primary outline-hidden placeholder:text-placeholder lg:min-h-9 lg:text-sm [&::-webkit-search-cancel-button]:hidden"
                            />
                        </label>
                        {query && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setQuery("")}
                                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 lg:size-9"
                            >
                                <XClose className="size-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>

                    {shown.length === 0 ? (
                        <div
                            className="flex flex-col items-center gap-3 rounded-xl bg-primary px-4 py-12 text-center shadow-xs ring-1 ring-secondary ring-inset"
                            data-testid="empty"
                        >
                            <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-fg-quaternary">
                                <Folder className="size-5" aria-hidden="true" />
                            </span>
                            <div className="flex flex-col gap-1">
                                <h2 className="text-md font-semibold text-primary">
                                    {query.trim() ? `No collections match "${query.trim()}"` : `No ${currentView.label.toLowerCase()} yet`}
                                </h2>
                                <p className="text-sm text-tertiary">
                                    {query.trim()
                                        ? view === "all"
                                            ? "Check the spelling, or search by purpose or rule, such as “kit” or “Wax Room”."
                                            : `Searched in ${currentView.label.toLowerCase()} only.`
                                        : "Create one to see it here."}
                                </p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                {(query || view !== "all") && (
                                    <Button size="md" color="secondary" onClick={clearFilters} className="max-lg:min-h-11">
                                        Show all collections
                                    </Button>
                                )}
                                {canEdit && !query.trim() && (
                                    <Button size="md" color="primary" iconLeading={Plus} onClick={() => setDialogOpen(true)} className="max-lg:min-h-11">
                                        New collection
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Desktop: one line per collection. */}
                            <div className="hidden overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset lg:block">
                                <table className="w-full table-fixed text-left text-sm" data-testid="collections-table">
                                    <caption className="sr-only">Collections at {place}</caption>
                                    <thead className="border-b border-secondary bg-secondary text-xs font-semibold text-tertiary">
                                        <tr>
                                            <th scope="col" className="py-2.5 pr-3 pl-4 font-semibold">
                                                Name
                                            </th>
                                            <th scope="col" className="w-[26%] px-3 py-2.5 font-semibold">
                                                Type
                                            </th>
                                            <th scope="col" className="w-20 px-3 py-2.5 text-right font-semibold">
                                                Items
                                            </th>
                                            <th scope="col" className="w-28 px-3 py-2.5 font-semibold">
                                                <ColumnHint label="Low or out" hint={`Items at or below their reorder point at ${place}.`} />
                                            </th>
                                            <th scope="col" className="w-36 px-3 py-2.5 font-semibold">
                                                <ColumnHint label="Last counted" hint="The date of the item in the collection that was counted longest ago." />
                                            </th>
                                            <th scope="col" className="w-32 py-2.5 pr-4 pl-3 font-semibold">
                                                Updated
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-secondary">
                                        {shown.map((info) => {
                                            const c = info.collection;
                                            const rules = kindText(c);
                                            return (
                                                <tr
                                                    key={c.id}
                                                    data-testid="collection-row"
                                                    className="relative transition duration-100 ease-linear hover:bg-primary_hover"
                                                >
                                                    <td className="py-3 pr-3 pl-4">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <a
                                                                href={ROUTES.collection(c.id)}
                                                                className="truncate rounded-xs font-semibold text-primary outline-focus-ring after:absolute after:inset-0 focus-visible:outline-2"
                                                            >
                                                                {c.name}
                                                            </a>
                                                            {c.purpose !== "general" && <CollectionPurposeChip purpose={c.purpose} />}
                                                            {info.isNew && (
                                                                <Badge type="pill-color" color="success" size="sm">
                                                                    New
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="truncate px-3 py-3 text-secondary">
                                                        {KIND_LABEL[c.kind]}
                                                        {rules && <span className="text-tertiary"> · {rules}</span>}
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-secondary tabular-nums">{info.items.toLocaleString("en-US")}</td>
                                                    <td className="px-3 py-3">
                                                        {info.lowOrOut > 0 ? (
                                                            <Badge type="pill-color" color="warning" size="sm">
                                                                {info.lowOrOut}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-quaternary" aria-label="None">
                                                                –
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="truncate px-3 py-3 text-tertiary">
                                                        {countedText(info) ?? (
                                                            <span className="text-quaternary" aria-label="No items">
                                                                –
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="truncate py-3 pr-4 pl-3 text-tertiary">{sentence(relativeDays(c.updatedAt, TODAY))}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Phone: the same facts as a compact card per collection. */}
                            <ul
                                className="divide-y divide-secondary overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset lg:hidden"
                                data-testid="collections-cards"
                            >
                                {shown.map((info) => {
                                    const c = info.collection;
                                    const rules = kindText(c);
                                    const counted = countedText(info);
                                    return (
                                        <li key={c.id}>
                                            <a
                                                href={ROUTES.collection(c.id)}
                                                data-testid="collection-card"
                                                className="flex min-h-16 items-center gap-3 px-4 py-3 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:-outline-offset-2"
                                            >
                                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                    <span className="flex min-w-0 items-center gap-2">
                                                        <span className="truncate text-md font-semibold text-primary">{c.name}</span>
                                                        {c.purpose !== "general" && <CollectionPurposeChip purpose={c.purpose} />}
                                                        {info.isNew && (
                                                            <Badge type="pill-color" color="success" size="sm">
                                                                New
                                                            </Badge>
                                                        )}
                                                    </span>
                                                    <span className="truncate text-sm text-tertiary">
                                                        {KIND_LABEL[c.kind]}
                                                        {rules ? ` · ${rules}` : ""}
                                                    </span>
                                                    <span className="flex min-w-0 items-center gap-2 text-sm text-tertiary">
                                                        <span className="truncate">
                                                            {plural(info.items, "item")}
                                                            {counted ? ` · counted ${counted.toLowerCase()}` : ""}
                                                        </span>
                                                        {info.lowOrOut > 0 && (
                                                            <Badge type="pill-color" color="warning" size="sm">
                                                                {info.lowOrOut} low or out
                                                            </Badge>
                                                        )}
                                                    </span>
                                                </span>
                                                <ChevronRight className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>

                            <p className="text-sm text-tertiary" data-testid="list-summary">
                                {plural(shown.length, "collection")}
                                {shown.length !== all.length ? ` of ${all.length}` : ""} · item counts are for {place}
                            </p>
                        </>
                    )}
                </div>
            </PageContent>

            <ModalOverlay
                isOpen={dialogOpen}
                onOpenChange={setDialogOpen}
                isDismissable
                className="max-sm:items-stretch max-sm:px-0 max-sm:[--modal-pb:0px] max-sm:[--modal-pt:0px]"
            >
                <Modal className="max-sm:rounded-none sm:max-w-xl">
                    <Dialog aria-label="New collection" className="max-sm:h-(--visual-viewport-height)">
                        <NewCollectionForm
                            creatorId={user.id}
                            taken={all.map((i) => i.collection.name.toLowerCase())}
                            onClose={() => setDialogOpen(false)}
                            onCreate={(collection) => {
                                setCreated((list) => [collection, ...list]);
                                setDialogOpen(false);
                                // Show it: a filter or search left on would hide the new row.
                                clearFilters();
                                setNotice(
                                    <>
                                        <span className="font-semibold">{collection.name}</span> was created.{" "}
                                        {collection.kind === "smart" ? "Open it to add the rules that choose its items." : "Open it to add items."} Prototype:
                                        it stays until the page is reloaded.
                                    </>,
                                );
                            }}
                        />
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
