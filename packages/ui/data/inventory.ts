/**
 * Prototype data layer.
 *
 * REAL (imported from Meraki's 2026 workbooks by tools/import):
 *   - the catalogue: 145 supplies, ~1,580 polish colours, Aprés tip sets
 *   - shelves, vendors, par levels, "Order?" ticks, on-hand where the sheet had a number
 *   - the 2026 order cycles: what was ordered, what was received, and when
 *
 * SAMPLE (generated here, deterministic, flagged with isSample / costIsSample):
 *   - unit costs (the workbooks hold no prices)
 *   - on-hand where the sheet was blank, and all Newburyport stock
 *   - staff, counts, usage movements and adjustments
 *
 * Forecasts and flags are computed by the real engine from whatever data is here, so the
 * numbers on screen change as soon as real counts and invoices replace the sample layer.
 * In production this module is replaced by Supabase queries returning the same shapes.
 */
import { addDays, daysBetween } from "@/engine/dates";
import { buildDigest } from "@/engine/digest";
import { detectFlags } from "@/engine/flags";
import { forecastItem } from "@/engine/forecast";
import { REASON_LABEL } from "@/engine/reasons";
import { stockStatus } from "@/engine/stock";
import catalogJson from "./seed/catalog.json";
import enrichmentJson from "./seed/enrichment.json";
import ordersJson from "./seed/orders.json";
import type {
    ActivityEntry,
    CountSession,
    Digest,
    FillLevel,
    Flag,
    Forecast,
    Item,
    Location,
    LocationId,
    NotificationRule,
    PolishLine,
    PurchaseOrder,
    PurchaseOrderLine,
    StockLevel,
    StockMovement,
    StockStatus,
    User,
    Vendor,
    VendorId,
} from "./types";

/** The prototype's "now". Fixed so stories and screenshots are stable. */
export const TODAY = "2026-11-14";

// ------------------------------------------------------------------------------------ seed shapes

interface SeedSupply {
    id: string;
    name: string;
    category: string;
    vendorId: string;
    unit: string;
    area: string;
    shelf: string;
    shelfLabel: string;
    par: number | null;
    parRule: StockLevel["parRule"];
    parNote: string | null;
    onHand: number | null;
    reorderFlag: boolean;
    reorderQty: number | null;
    note: string | null;
}
interface SeedPolish {
    id: string;
    brand: string;
    line: PolishLine;
    colorCode: string;
    name: string;
    sku?: string | null;
    family?: string;
    reorderFlag: boolean;
    reorderQty?: number | null;
    finishes?: { regular: { inUse: boolean; qty: number | null }; gel: { offered: boolean; inUse: boolean; qty: number | null }; dip: { inUse: boolean } };
    inUse?: boolean;
    backstock?: number | null;
    outOfStock?: boolean;
    note?: string | null;
}
interface SeedTips {
    id: string;
    name: string;
    shape: string;
    length: string;
    total: number;
    bySize: Record<string, number>;
}
interface SeedLine {
    vendorId?: string;
    line?: string;
    sku?: string | null;
    name: string | null;
    colorCode?: string | null;
    type?: string | null;
    typeReceived?: string | null;
    qtyOrdered: number | null;
    qtyReceived: number | null;
    dateReceived: string | null;
    done: boolean;
    receiver: string | null;
    note: string | null;
    freeText?: boolean;
    discontinued?: boolean;
}
interface SeedCycle {
    id: string;
    location: LocationId;
    kind: "supply" | "polish";
    month: string | null;
    startDate: string | null;
    savedOn: string | null;
    lines: SeedLine[];
}
interface SeedEnrichment {
    products: {
        key: string;
        matchNames: string[];
        name: string;
        brand: string | null;
        description: string | null;
        imageUrl: string | null;
        sourceUrl: string | null;
        upc: string | null;
        manufacturerSku: string | null;
        colorHex?: string | null;
    }[];
}

const catalog = catalogJson as unknown as { supplies: SeedSupply[]; polishes: SeedPolish[]; tips: SeedTips[] };
const orders = ordersJson as unknown as { cycles: SeedCycle[] };
const enrichment = enrichmentJson as unknown as SeedEnrichment;

// ------------------------------------------------------------------------------------ helpers

const hash = (s: string) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
};
/** Deterministic pseudo-random number in [0, 1) for a key. */
const rand = (key: string) => {
    let t = (hash(key) + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (key: string, min: number, max: number) => min + rand(key) * (max - min);
const norm = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
const slug = (s: string) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
const quarter = (n: number) => Math.round(n * 4) / 4;

// ------------------------------------------------------------------------------------ reference data

export const locations: Location[] = [
    { id: "lynnfield", name: "Meraki Lynnfield", shortName: "Lynnfield" },
    { id: "newburyport", name: "Meraki Newburyport", shortName: "Newburyport" },
];

export const locationName = (id: LocationId | "all") => (id === "all" ? "Both locations" : (locations.find((l) => l.id === id)?.shortName ?? id));

/**
 * Lead times here are assumptions to confirm with each vendor: none are measured.
 * What the 2026 backlog does show is the whole cycle for the nail supply store, about 48 days
 * from the count date to the receipt date. Most of that is time before the order is placed,
 * so it is reported as an insight (see engine/digest.ts) and not used as the vendor lead time.
 */
export const vendors: Vendor[] = [
    {
        id: "nail-supply-store",
        name: "Nail Supply Store",
        channel: "in-store",
        leadTimeDays: 14,
        leadTimeIsEstimate: true,
        note: "Local distributor. Most back-bar supplies and OPI, DND and Chisel colours.",
    },
    {
        id: "costco-bjs",
        name: "Costco / BJ's",
        channel: "in-store",
        leadTimeDays: 3,
        leadTimeIsEstimate: true,
        note: "Paper goods and cleaning supplies. Bought in person.",
    },
    {
        id: "amazon",
        name: "Amazon",
        channel: "api",
        leadTimeDays: 3,
        leadTimeIsEstimate: true,
        note: "Amazon Business can accept orders by API once the account is approved.",
    },
    {
        id: "dazzle-dry",
        name: "Dazzle Dry",
        channel: "portal",
        leadTimeDays: 7,
        leadTimeIsEstimate: true,
        note: "Ordered through the Dazzle Dry professional portal.",
    },
    {
        id: "farmhouse-fresh",
        name: "FarmHouse Fresh",
        channel: "portal",
        leadTimeDays: 10,
        leadTimeIsEstimate: true,
        note: "Wholesale portal for spa treatments.",
    },
    {
        id: "warehouse",
        name: "Meraki warehouse",
        channel: "internal",
        leadTimeDays: 2,
        leadTimeIsEstimate: true,
        note: "Internal transfer from shared back stock.",
    },
    { id: "other", name: "Other", channel: "email-po", leadTimeDays: 7, leadTimeIsEstimate: true },
];

export const vendorById = (id: string) => vendors.find((v) => v.id === id) ?? (vendors[vendors.length - 1] as Vendor);

/** Fictional staff. Real names are never written to this repo. */
export const users: User[] = [
    {
        id: "u-owner",
        name: "Avery Chen",
        role: "owner",
        locations: ["lynnfield", "newburyport"],
        email: "owner@example.com",
        hasPin: true,
        lastActiveAt: `${TODAY}T08:12:00Z`,
    },
    {
        id: "u-mgr-lyn",
        name: "Jordan Blake",
        role: "manager",
        locations: ["lynnfield"],
        email: "lynnfield.manager@example.com",
        hasPin: true,
        lastActiveAt: `${TODAY}T09:40:00Z`,
    },
    {
        id: "u-mgr-nbp",
        name: "Riley Santos",
        role: "manager",
        locations: ["newburyport"],
        email: "newburyport.manager@example.com",
        hasPin: true,
        lastActiveAt: `${addDays(TODAY, -1)}T17:05:00Z`,
    },
    {
        id: "u-fd-lyn",
        name: "Morgan Lee",
        role: "front-desk",
        locations: ["lynnfield"],
        email: "lynnfield.frontdesk@example.com",
        hasPin: true,
        lastActiveAt: `${TODAY}T09:58:00Z`,
    },
    {
        id: "u-fd-nbp",
        name: "Casey Nguyen",
        role: "front-desk",
        locations: ["newburyport"],
        email: "newburyport.frontdesk@example.com",
        hasPin: false,
        lastActiveAt: `${addDays(TODAY, -3)}T11:20:00Z`,
    },
    {
        id: "u-tech-1",
        name: "Sam Patel",
        role: "technician",
        locations: ["lynnfield"],
        email: "tech1@example.com",
        hasPin: true,
        lastActiveAt: `${addDays(TODAY, -1)}T19:31:00Z`,
    },
    { id: "u-tech-2", name: "Taylor Kim", role: "technician", locations: ["lynnfield", "newburyport"], email: "tech2@example.com", hasPin: false },
];

export const userById = (id?: string) => users.find((u) => u.id === id);
export const CURRENT_USER = users[1] as User;

export const ROLE_LABEL: Record<User["role"], string> = { owner: "Owner", manager: "Manager", "front-desk": "Front desk", technician: "Technician" };

/** What each role can do. Mirrors the row-level security policies in supabase/migrations. */
export const ROLE_PERMISSIONS: Record<User["role"], string[]> = {
    owner: ["View all locations", "Approve orders", "Approve counts", "Resolve flags", "Manage team and settings", "See costs"],
    manager: ["Count stock", "Create orders", "Approve counts", "Resolve flags", "See costs"],
    "front-desk": ["Receive deliveries", "Count stock", "Request items"],
    technician: ["Log usage", "Request items", "Count assigned shelves"],
};

// ------------------------------------------------------------------------------------ items

const BRANDS = [
    "Nugenesis",
    "Seche Vite",
    "iGEL Beauty",
    "OPI",
    "IBD",
    "ORLY",
    "Dazzle Dry",
    "Cre8tion",
    "Milken",
    "Starpil",
    "CnC",
    "Spa Redi",
    "DND",
    "Apres",
    "KDS",
    "Chisel",
    "Mia Secret",
    "Honey Pham",
    "Pyramid",
    "Vivian",
    "Lysol",
    "Purell",
    "Dial",
    "Scott",
    "Berkley Jensen",
    "Swiffer",
    "Clorox",
    "Mr. Clean",
    "INFA",
    "Arina",
    "Divina",
    "Varisi",
    "Solar Beauty",
    "Zen",
    "Luminary",
    "Nomi",
    "Bluerise",
    "Ugly Duckling",
    "Enail Couture",
    "Wellsley Farms",
    "Kona",
    "Emit",
    "RED",
    "RY",
];
const brandOf = (name: string) => {
    if (/^farm ?house fresh/i.test(name)) return "FarmHouse Fresh";
    if (/^barbacide/i.test(name)) return "Barbicide";
    return BRANDS.find((b) => name.toLowerCase().startsWith(b.toLowerCase()));
};

const UNIT_COST: Record<string, [number, number]> = {
    gallon: [14, 32],
    box: [8, 26],
    bottle: [3.5, 12],
    jar: [12, 24],
    bag: [4, 14],
    pack: [5, 18],
    roll: [6, 20],
    bucket: [18, 40],
    can: [9, 15],
    container: [10, 22],
};
const sampleCost = (id: string, unit: string) => {
    const [lo, hi] = UNIT_COST[unit.toLowerCase()] ?? [5, 15];
    return quarter(between(`cost:${id}`, lo, hi));
};

const POLISH_META: Record<PolishLine, { category: string; unit: string; cost: number; vendorId: VendorId }> = {
    opi: { category: "OPI lacquer and gel", unit: "Bottle", cost: 9, vendorId: "nail-supply-store" },
    "opi-dip": { category: "OPI dip powder", unit: "Jar", cost: 13, vendorId: "nail-supply-store" },
    dnd: { category: "DND gel and lacquer duo", unit: "Bottle", cost: 5.5, vendorId: "nail-supply-store" },
    "dazzle-dry": { category: "Dazzle Dry lacquer", unit: "Bottle", cost: 12, vendorId: "dazzle-dry" },
    chisel: { category: "Chisel dip powder", unit: "Jar", cost: 8.5, vendorId: "nail-supply-store" },
    "apres-gel-x": { category: "Aprés Gel-X tips", unit: "Box", cost: 14, vendorId: "nail-supply-store" },
};

/** Approximate swatch from the colour family. A placeholder until real swatches are loaded. */
const FAMILY_HUE: Record<string, [number, number, number]> = {
    Whites: [40, 20, 95],
    Pinks: [340, 70, 78],
    Reds: [355, 75, 45],
    Oranges: [20, 85, 60],
    "Yellows & Greens": [95, 50, 62],
    Blues: [212, 60, 55],
    Purples: [275, 45, 55],
    "Nudes & Neutrals": [25, 35, 80],
};
const swatchFor = (p: SeedPolish) => {
    const base = FAMILY_HUE[p.family ?? ""];
    const k = `sw:${p.id}`;
    if (base) return `hsl(${Math.round(base[0] + between(k, -12, 12))} ${base[1]}% ${Math.round(base[2] + between(`${k}:l`, -10, 8))}%)`;
    return `hsl(${Math.round(between(k, 0, 360))} ${Math.round(between(`${k}:s`, 35, 70))}% ${Math.round(between(`${k}:l`, 40, 72))}%)`;
};

const CATEGORY_FIX: Record<string, string> = { "Nail Art & Designs": "Nail Art & Design" };

const supplyItems: Item[] = catalog.supplies.map((s) => {
    const unit = s.unit || "Each";
    return {
        id: s.id,
        kind: "supply",
        name: s.name,
        brand: brandOf(s.name),
        category: CATEGORY_FIX[s.category.trim()] ?? s.category.trim(),
        vendorId: (s.vendorId || "other") as VendorId,
        unit,
        abc: "C",
        unitCost: sampleCost(s.id, unit),
        costIsSample: true,
        note: s.note ?? undefined,
    };
});

const polishItems: Item[] = catalog.polishes.map((p) => {
    const meta = POLISH_META[p.line];
    return {
        id: p.id,
        kind: "polish",
        name: p.name,
        brand: p.brand,
        category: meta.category,
        vendorId: meta.vendorId,
        unit: meta.unit,
        line: p.line,
        colorCode: p.colorCode,
        colorFamily: p.family || undefined,
        sku: p.sku ?? undefined,
        swatch: swatchFor(p),
        abc: "C",
        unitCost: meta.cost,
        costIsSample: true,
        discontinued: /disc/i.test(p.note ?? ""),
        note: p.note ?? undefined,
    };
});

const tipItems: Item[] = catalog.tips.map((t) => ({
    id: t.id,
    kind: "tips",
    name: t.name,
    brand: "Aprés",
    category: POLISH_META["apres-gel-x"].category,
    vendorId: "nail-supply-store",
    unit: "Box",
    line: "apres-gel-x",
    abc: "C",
    unitCost: POLISH_META["apres-gel-x"].cost,
    costIsSample: true,
}));

export const items: Item[] = [...supplyItems, ...polishItems, ...tipItems];

// Product reference data gathered from public pages (see docs/research/03-wholesale-and-product-data.md).
const byNormName = new Map(supplyItems.map((i) => [norm(i.name), i]));
for (const p of enrichment.products ?? []) {
    for (const match of p.matchNames ?? []) {
        const item = byNormName.get(norm(match)) ?? polishItems.find((i) => norm(`${i.brand} ${i.name}`) === norm(match));
        if (!item) continue;
        item.imageUrl = p.imageUrl ?? item.imageUrl;
        item.description = p.description ?? item.description;
        item.upc = p.upc ?? item.upc;
        item.sku = item.sku ?? p.manufacturerSku ?? undefined;
        if (p.colorHex) item.swatch = p.colorHex;
    }
}

const itemMap = new Map(items.map((i) => [i.id, i]));
export const getItem = (id: string) => itemMap.get(id);

// ------------------------------------------------------------------------------------ stock

const counterFor = (loc: LocationId, key: string) => {
    const pool = users.filter((u) => u.locations.includes(loc) && u.role !== "owner");
    return (pool[Math.floor(rand(`counter:${key}`) * pool.length)] ?? CURRENT_USER).id;
};

const sampleFill = (key: string): FillLevel => {
    const r = rand(`fill:${key}`);
    return r < 0.18 ? "half" : r < 0.25 ? "quarter" : r < 0.65 ? "three-quarter" : "full";
};
const FRACTION: Record<FillLevel, number> = { full: 1, "three-quarter": 0.75, half: 0.5, quarter: 0.25, empty: 0 };

const supplyStock = (loc: LocationId): StockLevel[] =>
    catalog.supplies.map((s) => {
        const key = `${loc}:${s.id}`;
        const isHome = loc === "lynnfield";
        const par = s.par === null ? undefined : isHome ? s.par : Math.max(1, Math.round(s.par * 0.75));
        const base = { itemId: s.id, locationId: loc, area: s.area, shelf: s.shelf, par, parRule: s.parRule, parNote: s.parNote ?? undefined };
        const counted = { lastCountedAt: addDays(TODAY, -Math.round(between(`lc:${key}`, 2, 48))), lastCountedBy: counterFor(loc, key) };
        const reorder = { reorderRequested: isHome ? s.reorderFlag : rand(`rr:${key}`) < 0.12, reorderQty: isHome ? (s.reorderQty ?? undefined) : undefined };

        if (isHome && s.onHand !== null) return { ...base, ...counted, ...reorder, onHand: s.onHand, isSample: false };
        if (s.parRule === "level") {
            const fillLevel = sampleFill(key);
            return { ...base, ...counted, ...reorder, onHand: FRACTION[fillLevel], fillLevel, isSample: true };
        }
        if (s.parRule === "paused") return { ...base, ...counted, ...reorder, onHand: 1, isSample: true };
        // Items ticked "Order?" on the sheet are low by definition, so the sample count reflects that.
        const flagged = isHome && s.reorderFlag;
        const span: [number, number] = flagged ? [0.05, 0.45] : [0.6, 1.3];
        const raw = par !== undefined ? Math.round(par * between(`oh:${key}`, span[0], span[1])) : Math.round(between(`oh:${key}`, 1, 5));
        const onHand = flagged ? raw : Math.max(1, raw);
        return { ...base, ...counted, ...reorder, onHand, isSample: true };
    });

const polishStock: StockLevel[] = catalog.polishes.map((p) => {
    // The sheet ticks "In use" for the open bottle on the wall and counts spares separately, so on hand is both together.
    const open = (inUse?: boolean) => (inUse ? 1 : 0);
    const qty = p.finishes
        ? open(p.finishes.regular.inUse) + (p.finishes.regular.qty ?? 0) + open(p.finishes.gel.inUse) + (p.finishes.gel.qty ?? 0)
        : open(p.inUse) + (p.backstock ?? 0);
    return {
        itemId: p.id,
        locationId: "lynnfield",
        area: "Polish wall",
        shelf: p.colorCode,
        onHand: p.outOfStock ? 0 : qty,
        // One open bottle per finish offered: lacquer and gel for OPI, a single bottle or jar for the other lines.
        par: p.finishes ? 2 : 1,
        parRule: "quantity",
        reorderRequested: p.reorderFlag,
        reorderQty: p.reorderQty ?? undefined,
        isSample: false,
    };
});

const tipStock: StockLevel[] = catalog.tips.map((t) => ({
    itemId: t.id,
    locationId: "lynnfield",
    area: "Nail Area",
    shelf: "Gel-X",
    onHand: t.total,
    par: 8,
    parRule: "quantity",
    reorderRequested: false,
    isSample: false,
}));

export const stock: StockLevel[] = [...supplyStock("lynnfield"), ...polishStock, ...tipStock, ...supplyStock("newburyport")];

const stockKey = (itemId: string, loc: LocationId) => `${loc}:${itemId}`;
const stockMap = new Map(stock.map((s) => [stockKey(s.itemId, s.locationId), s]));
export const getStock = (itemId: string, loc: LocationId) => stockMap.get(stockKey(itemId, loc));

/** Size-by-size counts for Aprés tips (shape × length × size). */
export const tipMatrix = catalog.tips.map((t) => ({ itemId: t.id, shape: t.shape, length: t.length, bySize: t.bySize, total: t.total }));

// ------------------------------------------------------------------------------------ purchase orders

const polishByCode = new Map(catalog.polishes.map((p) => [`${p.line}:${p.colorCode.toLowerCase().replace(/\s+/g, "")}`, p.id]));
const polishBySku = new Map(catalog.polishes.filter((p) => p.sku).map((p) => [`${p.line}:${String(p.sku).toLowerCase()}`, p.id]));

const matchItem = (cycle: SeedCycle, l: SeedLine): string | undefined => {
    const name = l.name ?? "";
    if (cycle.kind === "supply") return byNormName.get(norm(name))?.id;
    const dnd = /dnd\s*-?\s*(\d{3})/i.exec(name);
    if (dnd) return polishByCode.get(`dnd:${dnd[1]}`);
    const line = l.line ?? "opi";
    const code = (l.colorCode ?? "").toLowerCase().replace(/\s+/g, "");
    return (
        (code && polishByCode.get(`${line}:${code}`)) ||
        (l.sku ? polishBySku.get(`${line}:${l.sku.toLowerCase()}`) : undefined) ||
        (code ? polishByCode.get(`opi:${code}`) : undefined)
    );
};

const LINE_VENDOR: Record<string, VendorId> = { "dazzle-dry": "dazzle-dry" };
const LOC_CODE: Record<LocationId, string> = { lynnfield: "LYN", newburyport: "NBP" };

const importedOrders: PurchaseOrder[] = orders.cycles.flatMap((cycle) => {
    const groups = new Map<VendorId, PurchaseOrderLine[]>();
    const frontDesk = users.find((u) => u.role === "front-desk" && u.locations.includes(cycle.location))?.id;
    cycle.lines.forEach((l, i) => {
        const vendorId = (cycle.kind === "supply" ? l.vendorId || "other" : (LINE_VENDOR[l.line ?? ""] ?? "nail-supply-store")) as VendorId;
        const qtyOrdered = l.qtyOrdered ?? 0;
        const qtyReceived = l.qtyReceived ?? (l.done && qtyOrdered > 0 ? qtyOrdered : 0);
        const itemId = matchItem(cycle, l);
        const line: PurchaseOrderLine = {
            id: `l${i + 1}`,
            itemId,
            name: l.name ?? (l.colorCode ? `${l.colorCode}` : "Unnamed line"),
            sku: l.sku ?? undefined,
            colorCode: l.colorCode ?? undefined,
            variant: l.type ?? undefined,
            qtyOrdered,
            qtyReceived,
            receivedAt: l.dateReceived ?? (qtyReceived > 0 ? (cycle.savedOn ?? undefined) : undefined),
            receivedBy: qtyReceived > 0 ? frontDesk : undefined,
            variantReceived: l.typeReceived ?? undefined,
            unitCost: itemId ? getItem(itemId)?.unitCost : undefined,
            note: l.freeText ? "Free-text request from the order form" : (l.note ?? undefined),
            discontinued: l.discontinued,
        };
        groups.set(vendorId, [...(groups.get(vendorId) ?? []), line]);
    });
    const created = cycle.startDate ?? `${cycle.month ?? "2026-01"}-01`;
    const month = cycle.month ?? created.slice(0, 7);
    return [...groups.entries()].map(([vendorId, lines], n): PurchaseOrder => {
        const real = lines.filter((l) => l.qtyOrdered > 0);
        const got = real.filter((l) => l.qtyReceived > 0).length;
        const status = real.length > 0 && got === real.length ? "received" : got > 0 ? "partially-received" : "sent";
        return {
            id: `${cycle.id}-${vendorId}`,
            number: `PO-${LOC_CODE[cycle.location]}-${month.slice(2, 4)}${month.slice(5, 7)}-${cycle.kind === "polish" ? "P" : "S"}${n + 1}`,
            locationId: cycle.location,
            vendorId,
            kind: cycle.kind,
            status,
            cycle: month,
            createdAt: created,
            createdBy: cycle.location === "lynnfield" ? "u-mgr-lyn" : "u-mgr-nbp",
            approvedBy: "u-owner",
            closedAt: status === "received" ? (cycle.savedOn ?? undefined) : undefined,
            lines,
            imported: true,
        };
    });
});

// ------------------------------------------------------------------------------------ forecasts

const windowFor = (loc: LocationId) => {
    const cycles = orders.cycles.filter((c) => c.location === loc && c.startDate);
    const starts = cycles.map((c) => c.startDate as string).sort();
    const ends = cycles
        .map((c) => c.savedOn ?? c.startDate ?? "")
        .filter(Boolean)
        .sort();
    return { start: starts[0] ?? addDays(TODAY, -180), end: ends[ends.length - 1] ?? TODAY };
};

const demandByItem = (loc: LocationId) => {
    const out = new Map<string, Map<string, number>>();
    for (const po of importedOrders) {
        if (po.locationId !== loc || po.kind !== "supply") continue;
        for (const l of po.lines) {
            if (!l.itemId) continue;
            // Received quantity where the line was received; ordered quantity while it is still open.
            const qty = l.qtyReceived > 0 ? l.qtyReceived : l.qtyOrdered;
            if (qty <= 0) continue;
            const months = out.get(l.itemId) ?? new Map<string, number>();
            months.set(po.cycle, (months.get(po.cycle) ?? 0) + qty);
            out.set(l.itemId, months);
        }
    }
    return out;
};

const lynDemand = demandByItem("lynnfield");
const lynWindow = windowFor("lynnfield");
/** Newburyport has one order form on file, so its usage is borrowed from Lynnfield at this ratio until it has history. */
const NEWBURYPORT_RATIO = 0.7;

export const forecasts: Forecast[] = stock
    .filter((s) => getItem(s.itemId)?.kind === "supply")
    .map((s) => {
        const item = getItem(s.itemId) as Item;
        const months = lynDemand.get(s.itemId);
        const borrowed = s.locationId === "newburyport";
        const observations = [...(months?.entries() ?? [])].map(([month, qty]) => ({
            month,
            qty: borrowed ? Math.max(1, Math.round(qty * NEWBURYPORT_RATIO)) : qty,
        }));
        const f = forecastItem({
            itemId: s.itemId,
            locationId: s.locationId,
            onHand: s.fillLevel ? 0 : s.onHand,
            par: s.par,
            leadTimeDays: vendorById(item.vendorId).leadTimeDays,
            observations: s.fillLevel || s.parRule === "paused" ? [] : observations,
            windowStart: lynWindow.start,
            windowEnd: lynWindow.end,
            today: TODAY,
        });
        if (s.fillLevel)
            return {
                ...f,
                onHand: s.onHand,
                suggestedOrderQty: s.fillLevel === "half" || s.fillLevel === "quarter" || s.fillLevel === "empty" ? 1 : 0,
                explanation: "Tracked by fill level. Reorder one when it reaches half.",
            };
        if (borrowed && f.confidence !== "none")
            return {
                ...f,
                confidence: "low",
                explanation: `Estimated at ${Math.round(NEWBURYPORT_RATIO * 100)}% of Lynnfield's usage until Newburyport has its own order history. ${f.explanation}`,
            };
        return f;
    });

const forecastMap = new Map(forecasts.map((f) => [stockKey(f.itemId, f.locationId), f]));
export const getForecast = (itemId: string, loc: LocationId) => forecastMap.get(stockKey(itemId, loc));

// ABC classes from annualised spend at Lynnfield: top 20% of moving items are A, next 30% are B.
{
    const ranked = forecasts
        .filter((f) => f.locationId === "lynnfield" && f.monthlyUsage > 0)
        .map((f) => ({ id: f.itemId, spend: f.monthlyUsage * 12 * (getItem(f.itemId)?.unitCost ?? 0) }))
        .sort((a, b) => b.spend - a.spend);
    ranked.forEach((r, i) => {
        const item = getItem(r.id);
        if (item) item.abc = i < ranked.length * 0.2 ? "A" : i < ranked.length * 0.5 ? "B" : "C";
    });
}

// ------------------------------------------------------------------------------------ joined rows

export interface StockRow {
    item: Item;
    level: StockLevel;
    forecast?: Forecast;
    status: StockStatus;
    vendor: Vendor;
    value: number;
}

export const stockRows = (loc: LocationId, kind?: Item["kind"]): StockRow[] =>
    stock
        .filter((s) => s.locationId === loc)
        .map((level) => {
            const item = getItem(level.itemId) as Item;
            const forecast = getForecast(level.itemId, loc);
            return {
                item,
                level,
                forecast,
                status: stockStatus(level, forecast),
                vendor: vendorById(item.vendorId),
                value: level.onHand * (item.unitCost ?? 0),
            };
        })
        .filter((r) => !kind || r.item.kind === kind);

/** Items that should go on the next order, most urgent first. */
export const reorderSuggestions = (loc: LocationId) =>
    stockRows(loc, "supply")
        .filter((r) => (r.forecast?.suggestedOrderQty ?? 0) > 0 || r.level.reorderRequested)
        .map((r) => ({ ...r, qty: Math.max(r.forecast?.suggestedOrderQty ?? 0, r.level.reorderQty ?? 0, 1) }))
        .sort((a, b) => (a.forecast?.daysOfCover ?? 9999) - (b.forecast?.daysOfCover ?? 9999));

// ------------------------------------------------------------------------------------ November orders (sample, built from real suggestions)

const novemberOrders: PurchaseOrder[] = (() => {
    const suggestions = reorderSuggestions("lynnfield");
    const build = (vendorId: VendorId, n: number, status: PurchaseOrder["status"], max: number): PurchaseOrder | undefined => {
        const lines = suggestions
            .filter((s) => s.item.vendorId === vendorId)
            .slice(0, max)
            .map((s, i): PurchaseOrderLine => ({
                id: `l${i + 1}`,
                itemId: s.item.id,
                name: s.item.name,
                qtyOrdered: s.qty,
                qtyReceived: 0,
                unitCost: s.item.unitCost,
            }));
        if (!lines.length) return undefined;
        return {
            id: `lynnfield-2026-11-supply-${vendorId}`,
            number: `PO-LYN-2611-S${n}`,
            locationId: "lynnfield",
            vendorId,
            kind: "supply",
            status,
            cycle: "2026-11",
            createdAt: addDays(TODAY, -2),
            createdBy: "u-mgr-lyn",
            lines,
            imported: false,
        };
    };
    return [build("nail-supply-store", 1, "awaiting-approval", 14), build("amazon", 2, "draft", 6), build("costco-bjs", 3, "draft", 6)].filter(
        (po): po is PurchaseOrder => Boolean(po),
    );
})();

export const purchaseOrders: PurchaseOrder[] = [...novemberOrders, ...importedOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getPurchaseOrder = (id: string) => purchaseOrders.find((po) => po.id === id);

export const orderTotal = (po: PurchaseOrder) => po.lines.reduce((sum, l) => sum + l.qtyOrdered * (l.unitCost ?? 0), 0);

// ------------------------------------------------------------------------------------ counts (sample)

const areaLines = (loc: LocationId, area: string, limit: number) =>
    stock.filter((s) => s.locationId === loc && s.area === area && !s.fillLevel && getItem(s.itemId)?.kind === "supply").slice(0, limit);

export const countSessions: CountSession[] = (() => {
    const nail = areaLines("lynnfield", "Nail Area", 18);
    const closet = areaLines("lynnfield", "Supply Closet", 14);
    const cleaning = areaLines("lynnfield", "Cleaning Closet", 12);
    const wax = stock.filter((s) => s.locationId === "lynnfield" && s.area === "Wax Room");
    const nbp = areaLines("newburyport", "Nail Area", 16);
    const pinks = stock.filter((s) => s.area === "Polish wall" && getItem(s.itemId)?.colorFamily === "Pinks").slice(0, 35);

    // Approved count: on-hand already equals what was counted, so "expected" is the pre-count ledger value.
    const approvedShort = new Set(
        nail
            .filter((s) => s.onHand >= 3)
            .slice(0, 2)
            .map((s) => s.itemId),
    );
    // Submitted count awaiting approval: two lines well short, one over.
    const closetBig = closet.filter((s) => s.onHand >= 4);
    const short = new Map<string, number>([
        [closetBig[0]?.itemId ?? "", -3],
        [closetBig[1]?.itemId ?? "", -2],
        [closetBig[2]?.itemId ?? "", 2],
    ]);

    return [
        {
            id: "cs-lyn-cleaning",
            locationId: "lynnfield",
            area: "Cleaning Closet",
            name: "Cleaning Closet",
            status: "in-progress",
            assignedTo: "u-fd-lyn",
            dueAt: TODAY,
            startedAt: `${TODAY}T09:20:00Z`,
            blind: true,
            isSample: true,
            lines: cleaning.map((s, i) => ({ itemId: s.itemId, expected: s.onHand, counted: i < 5 ? s.onHand : undefined })),
        },
        {
            id: "cs-lyn-closet",
            locationId: "lynnfield",
            area: "Supply Closet",
            name: "Supply Closet",
            status: "submitted",
            assignedTo: "u-tech-1",
            dueAt: addDays(TODAY, -1),
            startedAt: `${addDays(TODAY, -1)}T18:05:00Z`,
            submittedAt: `${addDays(TODAY, -1)}T18:42:00Z`,
            blind: true,
            isSample: true,
            lines: closet.map((s) => ({ itemId: s.itemId, expected: s.onHand, counted: Math.max(0, s.onHand + (short.get(s.itemId) ?? 0)) })),
        },
        {
            id: "cs-lyn-nail",
            locationId: "lynnfield",
            area: "Nail Area",
            name: "Nail Area, shelves 1A to 2C",
            status: "approved",
            assignedTo: "u-fd-lyn",
            dueAt: addDays(TODAY, -6),
            startedAt: `${addDays(TODAY, -6)}T08:40:00Z`,
            submittedAt: `${addDays(TODAY, -6)}T09:31:00Z`,
            approvedBy: "u-mgr-lyn",
            blind: true,
            isSample: true,
            lines: nail.map((s) => ({ itemId: s.itemId, expected: s.onHand + (approvedShort.has(s.itemId) ? 2 : 0), counted: s.onHand })),
        },
        {
            id: "cs-lyn-wax",
            locationId: "lynnfield",
            area: "Wax Room",
            name: "Wax Room",
            status: "scheduled",
            assignedTo: "u-tech-1",
            dueAt: addDays(TODAY, 3),
            blind: true,
            isSample: true,
            lines: wax.map((s) => ({ itemId: s.itemId, expected: s.onHand })),
        },
        {
            id: "cs-lyn-pinks",
            locationId: "lynnfield",
            area: "Polish wall",
            name: "OPI wall, Pinks",
            status: "scheduled",
            assignedTo: "u-fd-lyn",
            dueAt: addDays(TODAY, 10),
            blind: true,
            isSample: true,
            lines: pinks.map((s) => ({ itemId: s.itemId, expected: s.onHand })),
        },
        {
            id: "cs-nbp-nail",
            locationId: "newburyport",
            area: "Nail Area",
            name: "Nail Area",
            status: "scheduled",
            assignedTo: "u-fd-nbp",
            dueAt: addDays(TODAY, -9),
            blind: true,
            isSample: true,
            lines: nbp.map((s) => ({ itemId: s.itemId, expected: s.onHand })),
        },
    ];
})();

export const getCountSession = (id: string) => countSessions.find((c) => c.id === id);

// ------------------------------------------------------------------------------------ movements

/** Real receipts from the 2026 backlog, as ledger rows. */
const receiptMovements: StockMovement[] = importedOrders.flatMap((po) =>
    po.lines
        .filter((l) => l.itemId && l.qtyReceived > 0 && l.receivedAt)
        .map((l): StockMovement => ({
            id: `rcv-${po.id}-${l.id}`,
            itemId: l.itemId as string,
            locationId: po.locationId,
            type: "receive",
            delta: l.qtyReceived,
            balance: 0,
            reason: "received-order",
            userId: l.receivedBy ?? "u-fd-lyn",
            at: `${l.receivedAt}T15:00:00Z`,
            purchaseOrderId: po.id,
            note: l.note,
            isSample: false,
        })),
);

/** Sample adjustments, including the kinds a manager needs to review. */
const sampleAdjustments: StockMovement[] = (() => {
    const pick = (i: number) =>
        (stock.filter((s) => s.locationId === "lynnfield" && !s.fillLevel && s.onHand >= 4 && getItem(s.itemId)?.kind === "supply")[i]?.itemId ?? "") as string;
    const row = (id: string, itemId: string, delta: number, reason: StockMovement["reason"], userId: string, at: string, note?: string): StockMovement => ({
        id,
        itemId,
        locationId: "lynnfield",
        type: "adjust",
        delta,
        balance: getStock(itemId, "lynnfield")?.onHand ?? 0,
        reason,
        userId,
        at,
        note,
        isSample: true,
    });
    return [
        row("adj-1", pick(3), -4, "lost", "u-tech-1", `${addDays(TODAY, -2)}T21:47:00Z`),
        row("adj-2", pick(7), -1, "damaged", "u-fd-lyn", `${addDays(TODAY, -4)}T11:15:00Z`, "Bottle cracked in delivery box. Photo sent to vendor."),
        row(
            "adj-3",
            pick(11),
            -3,
            "suspected-theft",
            "u-mgr-lyn",
            `${addDays(TODAY, -8)}T16:30:00Z`,
            "Three missing after Saturday close. Camera footage requested.",
        ),
        row("adj-4", pick(5), -2, "sample-or-gift", "u-mgr-lyn", `${addDays(TODAY, -10)}T13:05:00Z`, "Given to bridal party as add-on."),
        row("adj-5", pick(9), -5, "correction", "u-tech-2", `${addDays(TODAY, -12)}T06:52:00Z`),
    ].filter((m) => m.itemId);
})();

export const movements: StockMovement[] = [...receiptMovements, ...sampleAdjustments].sort((a, b) => b.at.localeCompare(a.at));

/**
 * Ledger for one item: real receipts plus sample weekly usage, with running balances that end at
 * today's on-hand. Generated on demand so the catalogue stays light.
 */
export const itemLedger = (itemId: string, loc: LocationId): StockMovement[] => {
    const level = getStock(itemId, loc);
    const forecast = getForecast(itemId, loc);
    if (!level) return [];
    const start = addDays(TODAY, -180);
    const events: StockMovement[] = movements.filter((m) => m.itemId === itemId && m.locationId === loc && m.at.slice(0, 10) >= start).map((m) => ({ ...m }));
    const weekly = (forecast?.dailyUsage ?? 0) * 7;
    if (weekly > 0 && !level.fillLevel) {
        let carry = 0;
        for (let d = 175; d >= 3; d -= 7) {
            carry += weekly * between(`use:${loc}:${itemId}:${d}`, 0.6, 1.4);
            const qty = Math.floor(carry);
            if (qty < 1) continue;
            carry -= qty;
            events.push({
                id: `use-${itemId}-${d}`,
                itemId,
                locationId: loc,
                type: "use",
                delta: -qty,
                balance: 0,
                reason: "used-in-service",
                userId: counterFor(loc, `${itemId}:${d}`),
                at: `${addDays(TODAY, -d)}T19:30:00Z`,
                isSample: true,
            });
        }
    }
    if (level.lastCountedAt) {
        events.push({
            id: `cnt-${itemId}`,
            itemId,
            locationId: loc,
            type: "count",
            delta: 0,
            balance: 0,
            reason: "cycle-count",
            userId: level.lastCountedBy ?? CURRENT_USER.id,
            at: `${level.lastCountedAt}T09:10:00Z`,
            isSample: level.isSample,
        });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    // Walk backwards from today's on-hand so the last balance is always the real one.
    let balance = level.onHand;
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i] as StockMovement;
        e.balance = Math.max(0, Math.round(balance * 100) / 100);
        balance -= e.delta;
        if (balance < 0) balance = 0;
    }
    return events.reverse();
};

// ------------------------------------------------------------------------------------ flags, digests, activity

const detected = detectFlags({ today: TODAY, items, vendors, stock, purchaseOrders, forecasts, countSessions, movements: sampleAdjustments });

/** A few flags are shown mid-workflow so the review screens have every state to render. */
const FLAG_STATE: Record<string, Pick<Flag, "status" | "assignedTo" | "resolutionNote">> = {
    "ua-adj-3": { status: "reviewing", assignedTo: "u-owner" },
    "ua-adj-5": {
        status: "resolved",
        assignedTo: "u-mgr-lyn",
        resolutionNote: "Recount at opening matched the corrected number. Reminder given to add a note next time.",
    },
};
export const flags: Flag[] = detected.map((f, i) => {
    const state = FLAG_STATE[f.id];
    if (state) return { ...f, ...state };
    // Older, low-severity imported findings start out assigned so the queue is not a wall of "open".
    if (f.type === "variant-mismatch" && i % 3 === 0) return { ...f, status: "dismissed", resolutionNote: "Gel was the right call; order form updated." };
    return f;
});

export const getFlag = (id: string) => flags.find((f) => f.id === id);
export const openFlags = (loc?: LocationId) => flags.filter((f) => (f.status === "open" || f.status === "reviewing") && (!loc || f.locationId === loc));

/** Weekly goes to the owner and that location's managers; monthly goes to the owner. Mirrors notificationRules below. */
const digestRecipients = (period: Digest["period"], locationId: LocationId | "all") =>
    users
        .filter((u) => u.role === "owner" || (period === "weekly" && u.role === "manager" && (locationId === "all" || u.locations.includes(locationId))))
        .map((u) => u.email);
const digestFor = (period: Digest["period"], locationId: LocationId | "all") =>
    buildDigest({
        period,
        locationId,
        today: TODAY,
        items,
        vendors,
        stock,
        forecasts,
        purchaseOrders,
        flags,
        recipients: digestRecipients(period, locationId),
        locationName: locationName(locationId),
    });

const DIGEST_SCOPES: (LocationId | "all")[] = ["lynnfield", "newburyport", "all"];
export const digests: Digest[] = (["weekly", "monthly"] as const).flatMap((period) => DIGEST_SCOPES.map((scope) => digestFor(period, scope)));
export const getDigest = (period: Digest["period"], locationId: LocationId | "all" = "lynnfield") =>
    digests.find((d) => d.period === period && d.locationId === locationId) ?? (digests[0] as Digest);

export const notificationRules: NotificationRule[] = [
    {
        id: "weekly-digest",
        label: "Weekly digest",
        description: "Monday 7:00 AM. Low stock, open flags, what to order this week.",
        channel: "email",
        roles: ["owner", "manager"],
        enabled: true,
    },
    {
        id: "monthly-digest",
        label: "Monthly digest",
        description: "First of the month. Spend, vendor performance, shrinkage and forecast for the month ahead.",
        channel: "email",
        roles: ["owner"],
        enabled: true,
    },
    {
        id: "high-flag",
        label: "High-severity flag",
        description: "Sent immediately when a count is far short, stock is written off after hours, or theft is suspected.",
        channel: "email",
        roles: ["owner", "manager"],
        enabled: true,
    },
    {
        id: "order-approval",
        label: "Order waiting for approval",
        description: "When a manager submits a purchase order.",
        channel: "email",
        roles: ["owner"],
        enabled: true,
    },
    {
        id: "count-due",
        label: "Count due",
        description: "The morning a count is assigned to you.",
        channel: "in-app",
        roles: ["manager", "front-desk", "technician"],
        enabled: true,
    },
    {
        id: "delivery-expected",
        label: "Delivery expected",
        description: "When an order is due to arrive at your location.",
        channel: "in-app",
        roles: ["front-desk"],
        enabled: false,
    },
];

export const activity: ActivityEntry[] = (() => {
    const out: ActivityEntry[] = [];
    for (const c of countSessions) {
        if (c.startedAt && c.status === "in-progress")
            out.push({
                id: `a-${c.id}-s`,
                at: c.startedAt,
                userId: c.assignedTo,
                locationId: c.locationId,
                verb: "started counting",
                subject: c.name,
                href: `/counts/${c.id}`,
            });
        if (c.submittedAt)
            out.push({
                id: `a-${c.id}-u`,
                at: c.submittedAt,
                userId: c.assignedTo,
                locationId: c.locationId,
                verb: "submitted the count for",
                subject: c.name,
                href: `/counts/${c.id}`,
                tone: "good",
            });
    }
    for (const m of sampleAdjustments) {
        out.push({
            id: `a-${m.id}`,
            at: m.at,
            userId: m.userId,
            locationId: m.locationId,
            verb: `adjusted ${m.delta}`,
            subject: getItem(m.itemId)?.name ?? m.itemId,
            detail: `${REASON_LABEL[m.reason]}${m.note ? `: ${m.note}` : ""}`,
            href: `/items/${m.itemId}`,
            tone: m.reason === "suspected-theft" || !m.note ? "warning" : "neutral",
        });
    }
    for (const po of novemberOrders) {
        out.push({
            id: `a-${po.id}`,
            at: `${po.createdAt}T14:10:00Z`,
            userId: po.createdBy,
            locationId: po.locationId,
            verb: po.status === "awaiting-approval" ? "sent for approval" : "drafted",
            subject: `${po.number} to ${vendorById(po.vendorId).name}`,
            detail: `${po.lines.length} lines`,
            href: `/orders/${po.id}`,
        });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
})();

// ------------------------------------------------------------------------------------ summary numbers

export const summary = (loc: LocationId) => {
    const rows = stockRows(loc, "supply");
    const count = (s: StockStatus) => rows.filter((r) => r.status === s).length;
    const openOrders = purchaseOrders.filter((po) => po.locationId === loc && (po.status === "sent" || po.status === "partially-received"));
    const lastCount = countSessions
        .filter((c) => c.locationId === loc && c.submittedAt)
        .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))[0];
    return {
        supplies: rows.length,
        polishes: stockRows(loc, "polish").length,
        out: count("out"),
        low: count("low"),
        ok: count("ok"),
        over: count("over"),
        unknown: count("unknown") + count("paused"),
        stockValue: stockRows(loc).reduce((sum, r) => sum + r.value, 0),
        openFlags: openFlags(loc).length,
        highFlags: openFlags(loc).filter((f) => f.severity === "high").length,
        openOrders: openOrders.length,
        openOrderLines: openOrders.reduce((n, po) => n + po.lines.filter((l) => l.qtyOrdered > 0 && l.qtyReceived === 0).length, 0),
        awaitingApproval: purchaseOrders.filter((po) => po.locationId === loc && po.status === "awaiting-approval").length,
        countsDue: countSessions.filter(
            (c) => c.locationId === loc && (c.status === "scheduled" || c.status === "in-progress") && daysBetween(TODAY, c.dueAt) <= 3,
        ).length,
        daysSinceLastCount: lastCount?.submittedAt ? daysBetween(lastCount.submittedAt.slice(0, 10), TODAY) : undefined,
        reorderLines: reorderSuggestions(loc).length,
    };
};

export const slugify = slug;
