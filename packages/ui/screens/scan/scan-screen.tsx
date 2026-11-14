"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle, ClipboardCheck, Link01, MarkerPin01, SearchLg, XClose } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { RadioButton, RadioGroup } from "@/components/base/radio-buttons/radio-buttons";
import { AppShell, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { BarcodeScanner } from "@/components/meraki/barcode-scanner";
import type { ScannerState } from "@/components/meraki/barcode-scanner";
import { FillLevelPicker } from "@/components/meraki/fill-level-picker";
import { ItemThumb } from "@/components/meraki/item-thumb";
import { QuantityStepper, quantityText, unitWord } from "@/components/meraki/quantity-stepper";
import { DEMO_CODES, describeCode, lookupCode, shelfLabel } from "@/components/meraki/scan-lookup";
import type { ScanResult } from "@/components/meraki/scan-lookup";
import { SampleBadge, StockStatusBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, getForecast, getItem, items, locationName, purchaseOrders, users, vendorById } from "@/data/inventory";
import type { FillLevel, Item, LocationId, PurchaseOrder, PurchaseOrderLine, StockLevel, StockMovement, User } from "@/data/types";
import { formatDate, relativeDays } from "@/engine/dates";
import { FILL_FRACTION, FILL_LABEL, stockStatus } from "@/engine/stock";
import { cx } from "@/utils/cx";

export type ScanMode = "lookup" | "count" | "use" | "receive";

export interface ScanScreenProps {
    location?: LocationId;
    initialMode?: ScanMode;
    /** Use the real camera. Off by default so the screen works in Storybook and on machines without a camera. */
    live?: boolean;
    /** The person scanning. Defaults to the front desk for the location. */
    user?: User;
    /** A code to treat as scanned when the screen opens. Used by stories. */
    initialCode?: string;
    /** Codes scanned earlier in this session, in the initial mode. Used by stories. */
    initialScans?: string[];
    /** Show one scanner state without touching the camera. Used by stories. */
    scannerState?: ScannerState;
}

const MODES: { id: ScanMode; label: string; hint: string }[] = [
    { id: "lookup", label: "Look up", hint: "Scan anything to see where it lives and how much is left." },
    { id: "count", label: "Count", hint: "Scan an item, set how many are on the shelf, then save. Scan it again to add one." },
    { id: "use", label: "Use", hint: "Scan what you are taking for a service. Scan it again to add one." },
    { id: "receive", label: "Receive", hint: "Scan items as they come out of the delivery box." },
];

/** One row in this session's batch. Nothing here is final until the batch is reviewed. */
interface ScanEntry {
    id: number;
    code: string;
    kind: ScanMode | "shelf" | "unknown" | "link";
    title: string;
    detail: string;
    itemId?: string;
    qty?: number;
    /** Receive: the order line this went against. */
    lineKey?: string;
    /** Use: the ledger row this will post. */
    movement?: StockMovement;
}

interface OpenLine {
    key: string;
    po: PurchaseOrder;
    line: PurchaseOrderLine;
}

const OPEN = new Set<PurchaseOrder["status"]>(["sent", "partially-received"]);

const openLinesFor = (itemId: string, location: LocationId): OpenLine[] =>
    purchaseOrders
        .filter((po) => po.locationId === location && OPEN.has(po.status))
        .flatMap((po) => po.lines.filter((l) => l.itemId === itemId && l.qtyOrdered > l.qtyReceived).map((line) => ({ key: `${po.id}:${line.id}`, po, line })));

const frontDesk = (location: LocationId) => users.find((u) => u.role === "front-desk" && u.locations.includes(location)) ?? CURRENT_USER;

const onHandText = (item: Item, level: StockLevel | undefined, used: number) => {
    if (!level) return "Not stocked here";
    if (level.fillLevel) return FILL_LABEL[level.fillLevel];
    return quantityText(Math.max(0, level.onHand - used), item.unit);
};

const Panel = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
    <section aria-label={title} className="flex flex-col gap-4 lg:rounded-xl lg:bg-primary lg:p-5 lg:shadow-xs lg:ring-1 lg:ring-secondary lg:ring-inset">
        <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold tracking-wide text-tertiary uppercase">{title}</h2>
            {aside}
        </div>
        {children}
    </section>
);

const SavedNote = ({ children, onUndo }: { children: ReactNode; onUndo?: () => void }) => (
    <div role="status" className="flex items-center gap-3 rounded-xl bg-success-primary py-1.5 pr-1.5 pl-4 ring-1 ring-utility-green-200 ring-inset">
        <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 py-1.5 text-sm font-medium text-primary">{children}</p>
        {onUndo && (
            <Button size="md" color="tertiary" className="min-h-11" onClick={onUndo}>
                Undo
            </Button>
        )}
    </div>
);

const ScanList = ({ entries, onUndo }: { entries: ScanEntry[]; onUndo: (entry: ScanEntry) => void }) =>
    entries.length === 0 ? (
        <p className="text-sm text-tertiary">Nothing scanned yet. Scans collect here so you can check them once at the end.</p>
    ) : (
        <ul className="flex flex-col divide-y divide-secondary">
            {entries.map((e) => {
                const item = e.itemId ? getItem(e.itemId) : undefined;
                return (
                    <li key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        {item ? (
                            <ItemThumb item={item} />
                        ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-fg-quaternary">
                                {e.kind === "shelf" ? (
                                    <MarkerPin01 className="size-4" aria-hidden="true" />
                                ) : (
                                    <SearchLg className="size-4" aria-hidden="true" />
                                )}
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-primary">{e.title}</p>
                            <p className="truncate text-sm text-tertiary">{e.detail}</p>
                        </div>
                        <Button
                            size="md"
                            color="tertiary"
                            className="min-h-11"
                            onClick={() => onUndo(e)}
                            aria-label={`${e.kind === "lookup" || e.kind === "shelf" || e.kind === "unknown" ? "Remove" : "Undo"}: ${e.title}`}
                        >
                            {e.kind === "lookup" || e.kind === "shelf" || e.kind === "unknown" ? "Remove" : "Undo"}
                        </Button>
                    </li>
                );
            })}
        </ul>
    );

/**
 * Scan tab. Camera on top, the last scanned thing below it, and one action that depends on the mode.
 * Scans collect into a batch that is reviewed once, so a mis-scan is easy to undo.
 */
export const ScanScreen = ({
    location: initialLocation = "lynnfield",
    initialMode = "lookup",
    live = false,
    user: userProp,
    initialCode,
    initialScans,
    scannerState,
}: ScanScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const user = userProp ?? frontDesk(location);

    const [mode, setMode] = useState<ScanMode>(initialMode);
    const [links, setLinks] = useState<Record<string, string>>({});
    const [current, setCurrent] = useState<ScanResult | null>(() => (initialCode ? lookupCode(initialCode, initialLocation) : null));
    const [entries, setEntries] = useState<ScanEntry[]>(() => {
        const earlier = (initialScans ?? []).flatMap((code, i): ScanEntry[] => {
            const r = lookupCode(code, initialLocation);
            if (r.kind !== "item") return [];
            const detail =
                initialMode === "count"
                    ? `Counted ${quantityText(i + 2, r.item.unit)}`
                    : initialMode === "use"
                      ? `Used ${quantityText(1, r.item.unit)} in service`
                      : "Looked up";
            return [
                {
                    id: i + 1,
                    code,
                    kind: initialMode === "receive" ? "lookup" : initialMode,
                    title: r.item.name,
                    detail,
                    itemId: r.item.id,
                    qty: initialMode === "use" ? 1 : undefined,
                },
            ];
        });
        // The opening scan is listed the same way a live scan would be.
        const first = initialCode ? lookupCode(initialCode, initialLocation) : undefined;
        const opening: ScanEntry[] =
            first?.kind === "shelf"
                ? [
                      {
                          id: 0,
                          code: first.code,
                          kind: "shelf",
                          title: shelfLabel({ area: first.area, shelf: first.shelf }),
                          detail: `Shelf label, ${first.rows.length} items`,
                      },
                  ]
                : first?.kind === "unknown"
                  ? [{ id: 0, code: first.code, kind: "unknown", title: first.code, detail: "No product has this barcode" }]
                  : first?.kind === "item" && initialMode === "lookup"
                    ? [
                          {
                              id: 0,
                              code: first.code,
                              kind: "lookup",
                              title: first.item.name,
                              detail: `Looked up · ${shelfLabel(first.level)}`,
                              itemId: first.item.id,
                          },
                      ]
                    : [];
        return [...opening, ...earlier.reverse()];
    });
    const [nextId, setNextId] = useState((initialScans?.length ?? 0) + 1);
    // Receive mode starts on the first open order line this person is allowed to receive, with the quantity still to come.
    const [firstLine] = useState(() => {
        const r = initialCode && initialMode === "receive" ? lookupCode(initialCode, initialLocation) : undefined;
        const receiver = userProp ?? frontDesk(initialLocation);
        return r?.kind === "item" ? openLinesFor(r.item.id, initialLocation).find((l) => l.po.createdBy !== receiver.id) : undefined;
    });
    const [qty, setQty] = useState(firstLine ? firstLine.line.qtyOrdered - firstLine.line.qtyReceived : 1);
    const [fill, setFill] = useState<FillLevel | undefined>();
    const [lineKey, setLineKey] = useState<string | undefined>(firstLine?.key);
    const [savedId, setSavedId] = useState<number | null>(null);
    const [trayOpen, setTrayOpen] = useState(false);
    const [showAllShelf, setShowAllShelf] = useState(false);
    const [shelfStarted, setShelfStarted] = useState(false);
    const [search, setSearch] = useState("");
    const [pick, setPick] = useState<string | undefined>();
    const [stubOpen, setStubOpen] = useState(false);

    const usedOf = (itemId: string) => entries.filter((e) => e.kind === "use" && e.itemId === itemId).reduce((n, e) => n + (e.qty ?? 0), 0);
    const receivedOn = (key: string) => entries.filter((e) => e.kind === "receive" && e.lineKey === key).reduce((n, e) => n + (e.qty ?? 0), 0);
    const outstanding = (l: OpenLine) => Math.max(0, l.line.qtyOrdered - l.line.qtyReceived - receivedOn(l.key));

    const addEntry = (entry: Omit<ScanEntry, "id">) => {
        const id = nextId;
        setNextId(id + 1);
        setEntries((all) => [{ ...entry, id }, ...all]);
        return id;
    };

    const resetAction = (result: ScanResult | null, forMode: ScanMode) => {
        setSavedId(null);
        setFill(undefined);
        setShowAllShelf(false);
        setShelfStarted(false);
        setSearch("");
        setPick(undefined);
        setStubOpen(false);
        if (result?.kind === "item" && forMode === "receive") {
            const first = openLinesFor(result.item.id, location).find((l) => outstanding(l) > 0 && l.po.createdBy !== user.id);
            setLineKey(first?.key);
            setQty(first ? outstanding(first) : 1);
        } else {
            setLineKey(undefined);
            setQty(1);
        }
    };

    const handleDetect = (code: string) => {
        const result = lookupCode(code, location, links);
        const repeat =
            result.kind === "item" &&
            current?.kind === "item" &&
            current.item.id === result.item.id &&
            savedId === null &&
            (mode === "count" || mode === "use");
        if (repeat) {
            // Same item scanned again before saving: each scan adds one.
            setQty((n) => n + 1);
            return;
        }
        setCurrent(result);
        resetAction(result, mode);
        if (result.kind === "shelf")
            addEntry({
                code,
                kind: "shelf",
                title: shelfLabel({ area: result.area, shelf: result.shelf }),
                detail: `Shelf label, ${result.rows.length} items`,
            });
        if (result.kind === "unknown") addEntry({ code, kind: "unknown", title: code, detail: "No product has this barcode" });
        if (result.kind === "item" && mode === "lookup")
            addEntry({ code, kind: "lookup", title: result.item.name, detail: `Looked up · ${shelfLabel(result.level)}`, itemId: result.item.id });
    };

    const changeLocation = (next: LocationId) => {
        setLocation(next);
        setCurrent(null);
        resetAction(null, mode);
    };

    const changeMode = (next: ScanMode) => {
        setMode(next);
        resetAction(current, next);
    };

    const undo = (entry: ScanEntry) => {
        setEntries((all) => all.filter((e) => e.id !== entry.id));
        if (entry.kind === "link") {
            setLinks((all) => Object.fromEntries(Object.entries(all).filter(([code]) => code !== entry.code)));
            if (current?.code === entry.code) setCurrent({ kind: "unknown", code: entry.code });
        }
        if (savedId === entry.id) setSavedId(null);
    };

    const item = current?.kind === "item" ? current.item : undefined;
    const level = current?.kind === "item" ? current.level : undefined;
    const used = item ? usedOf(item.id) : 0;
    const openLines = item ? openLinesFor(item.id, location) : [];
    const chosenLine = openLines.find((l) => l.key === lineKey);
    const savedEntry = entries.find((e) => e.id === savedId);
    const byLevel = Boolean(level?.fillLevel);
    const available = level && !byLevel ? Math.max(0, level.onHand - used) : 0;

    const save = () => {
        if (!item || !current) return;
        const base = { code: current.code, title: item.name, itemId: item.id };
        if (mode === "count") {
            const detail = byLevel && fill ? `Counted: ${FILL_LABEL[fill]}` : `Counted ${quantityText(qty, item.unit)}`;
            setSavedId(addEntry({ ...base, kind: "count", detail, qty: byLevel && fill ? FILL_FRACTION[fill] : qty }));
        }
        if (mode === "use") {
            if (byLevel && fill) {
                setSavedId(addEntry({ ...base, kind: "use", detail: `Level now ${FILL_LABEL[fill]}`, qty: 0 }));
                return;
            }
            const movement: StockMovement = {
                id: `scan-use-${nextId}`,
                itemId: item.id,
                locationId: location,
                type: "use",
                delta: -qty,
                balance: Math.max(0, available - qty),
                reason: "used-in-service",
                userId: user.id,
                at: `${TODAY}T12:00:00Z`,
                isSample: true,
            };
            setSavedId(addEntry({ ...base, kind: "use", detail: `Used ${quantityText(qty, item.unit)} in service`, qty, movement }));
        }
        if (mode === "receive" && chosenLine) {
            setSavedId(
                addEntry({
                    ...base,
                    kind: "receive",
                    detail: `Received ${quantityText(qty, item.unit)} on ${chosenLine.po.number}`,
                    qty,
                    lineKey: chosenLine.key,
                }),
            );
        }
    };

    const matches =
        search.trim().length < 2
            ? []
            : items
                  .filter((i) => `${i.brand ?? ""} ${i.name} ${i.colorCode ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()))
                  .sort((a, b) => Number(a.kind !== "supply") - Number(b.kind !== "supply"))
                  .slice(0, 5);

    const saveLink = () => {
        if (!current || !pick) return;
        const target = getItem(pick);
        if (!target) return;
        const nextLinks = { ...links, [current.code]: pick };
        setLinks(nextLinks);
        const id = addEntry({
            code: current.code,
            kind: "link",
            title: target.name,
            detail: `Barcode ${current.code} saved to this product`,
            itemId: target.id,
        });
        const result = lookupCode(current.code, location, nextLinks);
        setCurrent(result);
        resetAction(result, mode);
        setSavedId(id);
    };

    const modeInfo = MODES.find((m) => m.id === mode) ?? (MODES[0] as (typeof MODES)[number]);
    const scanCount = entries.length;

    let body: ReactNode;
    if (!current) {
        body = (
            <Panel title="Last scanned">
                <div className="flex flex-col items-center gap-2 rounded-xl bg-secondary px-4 py-8 text-center">
                    <SearchLg className="size-6 text-fg-quaternary" aria-hidden="true" />
                    <p className="text-md font-semibold text-primary">Nothing scanned yet</p>
                    <p className="max-w-xs text-sm text-tertiary">{modeInfo.hint} Shelf labels open everything on that shelf.</p>
                </div>
            </Panel>
        );
    } else if (current.kind === "shelf") {
        const shown = showAllShelf ? current.rows.slice(0, 80) : current.rows.slice(0, 5);
        body = (
            <Panel
                title="Shelf label"
                aside={
                    <Badge type="pill-color" color="brand" size="sm">
                        {current.rows.length} items
                    </Badge>
                }
            >
                <div className="flex items-center gap-3">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-fg-brand-primary">
                        <MarkerPin01 className="size-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-lg font-semibold text-primary">{current.shelf ? `Shelf ${current.shelf}` : current.area}</p>
                        <p className="text-sm text-tertiary">
                            {current.area} · {locationName(current.locationId)}
                        </p>
                    </div>
                </div>
                <ul className="flex flex-col divide-y divide-secondary rounded-xl ring-1 ring-secondary ring-inset">
                    {shown.map((r) => (
                        <li key={r.item.id} className="flex items-center gap-3 px-3 py-2">
                            <ItemThumb item={r.item} size="sm" />
                            <a
                                href={ROUTES.item(r.item.id)}
                                className="min-w-0 flex-1 truncate rounded text-sm font-medium text-primary outline-focus-ring focus-visible:outline-2"
                            >
                                {r.item.name}
                            </a>
                            <StockStatusBadge status={r.status} />
                        </li>
                    ))}
                </ul>
                {current.rows.length > shown.length && (
                    <Button size="md" color="link-color" className="min-h-11 self-start" onClick={() => setShowAllShelf(true)}>
                        Show all {current.rows.length} items
                    </Button>
                )}
                {shelfStarted ? (
                    <SavedNote onUndo={() => setShelfStarted(false)}>
                        Count started for {current.shelf ? `shelf ${current.shelf}` : current.area}: {current.rows.length} lines, assigned to {user.name}.
                    </SavedNote>
                ) : (
                    <Button size="xl" color="primary" iconLeading={ClipboardCheck} className="w-full" onClick={() => setShelfStarted(true)}>
                        Start count for this shelf
                    </Button>
                )}
                {shelfStarted && (
                    <Button size="lg" color="secondary" href={ROUTES.counts} className="w-full">
                        Open the count
                    </Button>
                )}
            </Panel>
        );
    } else if (current.kind === "unknown") {
        body = (
            <Panel
                title="Last scanned"
                aside={
                    <Badge type="pill-color" color="warning" size="sm">
                        Not in the catalogue
                    </Badge>
                }
            >
                <div className="flex flex-col gap-1">
                    <p className="text-lg font-semibold text-primary">No product has this barcode</p>
                    <p className="font-mono text-sm break-all text-tertiary">{current.code}</p>
                </div>
                <div className="flex flex-col gap-2">
                    <Input
                        size="lg"
                        icon={SearchLg}
                        label="Link it to a product"
                        placeholder="Search by name or colour code"
                        value={search}
                        onChange={(v) => {
                            setSearch(v);
                            setPick(undefined);
                        }}
                    />
                    {search.trim().length >= 2 && matches.length === 0 && <p className="text-sm text-tertiary">No products match that search.</p>}
                    {matches.length > 0 && (
                        <ul className="flex flex-col gap-1" aria-label="Matching products">
                            {matches.map((m) => (
                                <li key={m.id}>
                                    <button
                                        type="button"
                                        aria-pressed={pick === m.id}
                                        onClick={() => setPick(m.id)}
                                        className={cx(
                                            "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2",
                                            pick === m.id ? "bg-brand-50 ring-2 ring-brand" : "bg-primary ring-secondary hover:bg-primary_hover",
                                        )}
                                    >
                                        <ItemThumb item={m} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-primary">{m.name}</span>
                                            <span className="block truncate text-sm text-tertiary">
                                                {m.kind === "supply" ? m.category : `${m.brand ?? ""} ${m.colorCode ?? ""}`}
                                            </span>
                                        </span>
                                        {pick === m.id && <CheckCircle className="size-5 shrink-0 text-fg-brand-primary" aria-hidden="true" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <Button size="xl" color="primary" iconLeading={Link01} className="w-full" isDisabled={!pick} onClick={saveLink}>
                    Save barcode to this product
                </Button>
                <Button size="lg" color="secondary" className="w-full" onClick={() => setStubOpen(true)}>
                    Look up product details
                </Button>
                {stubOpen && (
                    <div className="flex flex-col gap-2 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-primary">UPC lookup</p>
                            <Badge type="color" color="gray" size="sm">
                                Planned integration
                            </Badge>
                        </div>
                        <p className="text-sm text-tertiary">
                            Not connected in this prototype. When it is, the app will search a product database for{" "}
                            <span className="font-mono text-secondary">{current.code}</span> and suggest the name, brand and size, ready to add as a new
                            catalogue item.
                        </p>
                    </div>
                )}
                <p className="text-xs text-tertiary">Linking a barcode is a manager permission. The link is logged with your name.</p>
            </Panel>
        );
    } else {
        const it = current.item;
        const status = level ? stockStatus(level, getForecast(it.id, location)) : undefined;
        const blocked = chosenLine ? chosenLine.po.createdBy === user.id : false;
        body = (
            <Panel title="Last scanned" aside={status && mode !== "count" ? <StockStatusBadge status={status} /> : undefined}>
                <div className="flex items-center gap-3">
                    <ItemThumb item={it} size="lg" />
                    <div className="min-w-0 flex-1">
                        <p className="text-lg leading-6 font-semibold text-primary">{it.name}</p>
                        <p className="text-sm text-tertiary">{shelfLabel(level)}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-sm text-secondary">
                            {mode === "count" ? (
                                <span className="text-tertiary">On hand is hidden while you count</span>
                            ) : (
                                <>
                                    <span>
                                        On hand: <span className="font-semibold tabular-nums">{onHandText(it, level, used)}</span>
                                    </span>
                                    {level?.isSample && <SampleBadge />}
                                </>
                            )}
                        </p>
                    </div>
                </div>

                {savedEntry && <SavedNote onUndo={() => undo(savedEntry)}>{savedEntry.detail}. Scan the next item.</SavedNote>}

                {mode === "lookup" && (
                    <>
                        {level && (
                            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-secondary p-3">
                                <div>
                                    <dt className="text-xs font-medium text-tertiary">Par</dt>
                                    <dd className="text-sm font-semibold text-primary tabular-nums">
                                        {level.par !== undefined ? quantityText(level.par, it.unit) : (level.parNote ?? "Not set")}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-tertiary">Last counted</dt>
                                    <dd className="text-sm font-semibold text-primary">
                                        {level.lastCountedAt ? relativeDays(level.lastCountedAt, TODAY) : "No record"}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium text-tertiary">Vendor</dt>
                                    <dd className="truncate text-sm font-semibold text-primary">{vendorById(it.vendorId).name}</dd>
                                </div>
                            </dl>
                        )}
                        <Button size="xl" color="primary" href={ROUTES.item(it.id)} className="w-full">
                            Open item
                        </Button>
                    </>
                )}

                {(mode === "count" || mode === "use") && !savedEntry && (
                    <>
                        {!level ? (
                            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-tertiary">
                                This item is not stocked at {locationName(location)}, so there is nothing to {mode} here.
                            </p>
                        ) : byLevel ? (
                            <>
                                <p className="text-sm text-tertiary">
                                    Tracked by fill level. {mode === "use" ? "Set the level it is at now." : "How full is the open one?"}
                                </p>
                                <FillLevelPicker size="lg" label={`Fill level for ${it.name}`} value={fill} onChange={setFill} />
                                <Button size="xl" color="primary" className="w-full" isDisabled={!fill} onClick={save}>
                                    {fill ? `Save: ${FILL_LABEL[fill]}` : "Pick a level"}
                                </Button>
                            </>
                        ) : (
                            <>
                                <QuantityStepper
                                    size="lg"
                                    label={mode === "count" ? `Counted quantity for ${it.name}` : `Quantity of ${it.name} used`}
                                    value={qty}
                                    onChange={setQty}
                                    min={mode === "use" ? 1 : 0}
                                    max={mode === "use" ? Math.max(1, available) : undefined}
                                    unit={unitWord(qty, it.unit)}
                                    className="flex w-full"
                                />
                                {mode === "use" && (
                                    <p className="text-sm text-tertiary">
                                        On hand after:{" "}
                                        <span className="font-semibold text-secondary tabular-nums">{quantityText(Math.max(0, available - qty), it.unit)}</span>
                                    </p>
                                )}
                                <Button size="xl" color="primary" className="w-full" isDisabled={mode === "use" && available < 1} onClick={save}>
                                    {mode === "count"
                                        ? `Save count: ${quantityText(qty, it.unit)}`
                                        : available < 1
                                          ? "None on hand to use"
                                          : `Use ${quantityText(qty, it.unit)}`}
                                </Button>
                            </>
                        )}
                    </>
                )}

                {mode === "receive" && !savedEntry && (
                    <>
                        {openLines.filter((l) => outstanding(l) > 0).length === 0 ? (
                            <p className="rounded-xl bg-secondary px-4 py-3 text-sm text-tertiary">
                                This item is not on an open order for {locationName(location)}. Set it aside and tell a manager, or receive it from the Receive
                                screen as a delivery without an order.
                            </p>
                        ) : (
                            <>
                                <RadioGroup
                                    aria-label="Open order line"
                                    size="md"
                                    value={lineKey ?? null}
                                    onChange={(key) => {
                                        setLineKey(key);
                                        const l = openLines.find((o) => o.key === key);
                                        if (l) setQty(outstanding(l));
                                    }}
                                >
                                    {openLines
                                        .filter((l) => outstanding(l) > 0)
                                        .map((l) => (
                                            <RadioButton
                                                key={l.key}
                                                value={l.key}
                                                isDisabled={l.po.createdBy === user.id}
                                                label={`${l.po.number} · ${vendorById(l.po.vendorId).name}`}
                                                hint={
                                                    l.po.createdBy === user.id
                                                        ? "You placed this order, so someone else has to receive it."
                                                        : `Ordered ${l.line.qtyOrdered}, ${outstanding(l)} still to come. Placed ${formatDate(l.po.createdAt)}.`
                                                }
                                            />
                                        ))}
                                </RadioGroup>
                                <QuantityStepper
                                    size="lg"
                                    label={`Quantity of ${it.name} received`}
                                    value={qty}
                                    onChange={setQty}
                                    min={1}
                                    unit={unitWord(qty, it.unit)}
                                    isDisabled={!chosenLine || blocked}
                                    className="flex w-full"
                                />
                                {chosenLine && qty > outstanding(chosenLine) && (
                                    <p className="text-sm font-medium text-warning-primary">
                                        That is {qty - outstanding(chosenLine)} more than the order has left. It will be saved, and a flag is raised for a
                                        manager to check.
                                    </p>
                                )}
                                <Button size="xl" color="primary" className="w-full" isDisabled={!chosenLine || blocked} onClick={save}>
                                    {chosenLine ? `Receive ${quantityText(qty, it.unit)} on ${chosenLine.po.number}` : "Pick an order line"}
                                </Button>
                            </>
                        )}
                    </>
                )}
            </Panel>
        );
    }

    return (
        <AppShell activeUrl={ROUTES.scan} location={location} onLocationChange={changeLocation} user={user} immersive>
            <div className="flex min-h-dvh flex-col lg:mx-auto lg:min-h-0 lg:max-w-container lg:gap-8 lg:px-8 lg:py-8">
                <PageHeader
                    className="hidden lg:flex"
                    title={
                        <>
                            <em>Scan</em> a barcode or shelf label
                        </>
                    }
                    description={`${locationName(location)}. Look something up, count it, log what you used, or check in a delivery.`}
                />

                <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6">
                    <div className="bg-primary-solid pt-[env(safe-area-inset-top)] lg:sticky lg:top-8 lg:overflow-hidden lg:rounded-2xl lg:pt-0">
                        <div className="flex items-center justify-between gap-2 px-2 pt-1 text-white lg:hidden">
                            <a
                                href={ROUTES.home}
                                aria-label="Close scanner"
                                className="flex size-11 items-center justify-center rounded-full outline-focus-ring hover:bg-white/10 focus-visible:outline-2"
                            >
                                <XClose className="size-6" aria-hidden="true" />
                            </a>
                            <h1 className="text-md font-semibold">Scan</h1>
                            <p className="flex min-h-11 items-center gap-1 pr-2 text-sm font-medium text-white/80">
                                <MarkerPin01 className="size-4" aria-hidden="true" />
                                {locationName(location)}
                            </p>
                        </div>
                        <BarcodeScanner
                            onDetect={handleDetect}
                            paused={trayOpen}
                            simulate={live || scannerState ? undefined : { codes: DEMO_CODES, label: (code) => describeCode(code, location) }}
                            forceState={scannerState}
                            hint={mode === "lookup" ? undefined : `${modeInfo.label} mode: hold the barcode inside the frame`}
                            className="min-h-[max(42dvh,20rem)] pb-4 lg:h-[34rem] lg:min-h-0 lg:pb-0"
                        />
                    </div>

                    <div className="relative z-10 -mt-4 flex flex-1 flex-col gap-4 rounded-t-2xl bg-primary px-4 pt-3 pb-4 lg:mt-0 lg:rounded-none lg:bg-transparent lg:p-0">
                        <div className="flex flex-col gap-2">
                            <div
                                role="group"
                                aria-label="Scan mode"
                                className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1 ring-1 ring-secondary ring-inset lg:bg-primary"
                            >
                                {MODES.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        aria-pressed={mode === m.id}
                                        onClick={() => changeMode(m.id)}
                                        className={cx(
                                            "min-h-11 rounded-lg px-1 text-sm font-semibold outline-focus-ring transition duration-100 ease-linear focus-visible:outline-2 focus-visible:outline-offset-1",
                                            mode === m.id ? "bg-brand-solid text-white shadow-xs" : "text-tertiary hover:bg-primary_hover hover:text-secondary",
                                        )}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            {current && <p className="text-sm text-tertiary">{modeInfo.hint}</p>}
                        </div>

                        {body}

                        <div className="hidden lg:block">
                            <Panel title={`This session: ${scanCount} ${scanCount === 1 ? "scan" : "scans"}`}>
                                <ScanList entries={entries} onUndo={undo} />
                            </Panel>
                        </div>

                        <SampleDataNote>
                            Items, shelves and open orders come from Meraki&apos;s spreadsheets. On-hand numbers marked Sample, and staff names, are
                            placeholders.
                        </SampleDataNote>

                        {scanCount > 0 && (
                            <div className="sticky bottom-0 -mx-4 mt-auto border-t border-secondary bg-primary/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
                                <Button size="xl" color="secondary" className="w-full" onClick={() => setTrayOpen(true)}>
                                    Review {scanCount} {scanCount === 1 ? "scan" : "scans"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ModalOverlay isOpen={trayOpen} onOpenChange={setTrayOpen} isDismissable className="px-0 pb-0 sm:px-8 sm:pb-8">
                <Modal className="max-w-md max-sm:rounded-b-none">
                    <Dialog aria-label="Scans in this session">
                        <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">
                                    {scanCount} {scanCount === 1 ? "scan" : "scans"} in this session
                                </h2>
                                <p className="text-sm text-tertiary">
                                    Undo anything that was scanned by mistake. Counts, usage and receipts are posted together when you finish.
                                </p>
                            </div>
                            <ScanList entries={entries} onUndo={undo} />
                            <Button size="xl" color="primary" className="w-full" onClick={() => setTrayOpen(false)}>
                                Keep scanning
                            </Button>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </AppShell>
    );
};
