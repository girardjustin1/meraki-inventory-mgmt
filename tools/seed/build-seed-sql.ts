/**
 * Builds supabase/seed-catalog.sql from the imported workbook data.
 *
 *   npx tsx tools/seed/build-seed-sql.ts
 *
 * Reads   packages/ui/data/seed/catalog.json   (supplies, polish colours, Gel-X tips)
 *         packages/ui/data/seed/orders.json    (the 2026 order cycles)
 * Writes  supabase/seed-catalog.sql            (git-ignored; regenerate it, do not edit it)
 *
 * Apply it after 0001_init.sql and seed.sql (locations and vendors must exist):
 *   psql "$DATABASE_URL" -f supabase/seed-catalog.sql      or paste into the SQL editor.
 *
 * What it loads is only what the workbooks actually say:
 *   - items                   the catalogue. No costs: the workbooks hold no prices.
 *   - shelves, stock_levels   Lynnfield only. Newburyport has no sheet, so it starts empty.
 *   - purchase_orders, lines  the 2026 backlog, flagged imported = true, with no creator,
 *                             approver or receiver (no staff are seeded).
 * It does not write stock_movements. The ledger starts at go-live; these on-hand numbers
 * are the opening balance and the first count replaces them.
 *
 * Idempotent: every insert is `on conflict do nothing`, so re-running never overwrites
 * anything edited in the app. The item ids, order ids and order numbers are the same ones
 * the prototype data layer (packages/ui/data/inventory.ts) produces.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const SEED_DIR = path.join(ROOT, "packages/ui/data/seed");
const OUT_FILE = path.join(ROOT, "supabase/seed-catalog.sql");

// Assumptions carried over from the prototype, not from the workbooks. Edit in the app later.
const POLISH_PAR = 1; // keep at least one bottle of every colour
const TIPS_PAR = 8;
const ROWS_PER_INSERT = 500;

// ------------------------------------------------------------------------------------ seed shapes

interface SeedSupply {
    id: string;
    name: string;
    category: string;
    vendorId: string;
    unit: string;
    location: string;
    area: string;
    shelf: string;
    shelfLabel: string | null;
    par: number | null;
    parRule: "quantity" | "level" | "paused" | "unset";
    parNote: string | null;
    onHand: number | null;
    reorderFlag: boolean;
    reorderQty: number | null;
    note: string | null;
}
interface SeedPolish {
    id: string;
    brand: string;
    line: string;
    colorCode: string;
    name: string;
    sku?: string | null;
    family?: string | null;
    location: string;
    reorderFlag: boolean;
    reorderQty?: number | null;
    finishes?: { regular: { qty: number | null }; gel: { qty: number | null } };
    inUse?: boolean;
    backstock?: number | null;
    outOfStock?: boolean;
    note?: string | null;
}
interface SeedTips {
    id: string;
    name: string;
    location: string;
    total: number;
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
    note: string | null;
    freeText?: boolean;
    discontinued?: boolean;
}
interface SeedCycle {
    id: string;
    location: string;
    kind: "supply" | "polish";
    month: string | null;
    startDate: string | null;
    savedOn: string | null;
    lines: SeedLine[];
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(path.join(SEED_DIR, file), "utf8")) as T;
const catalog = readJson<{ supplies: SeedSupply[]; polishes: SeedPolish[]; tips: SeedTips[] }>("catalog.json");
const orders = readJson<{ cycles: SeedCycle[] }>("orders.json");

// ------------------------------------------------------------------------------------ SQL helpers

type Value = string | number | boolean | null | undefined;

const lit = (v: Value): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") {
        if (!Number.isFinite(v)) throw new Error(`Not a finite number: ${v}`);
        return String(v);
    }
    if (typeof v === "boolean") return v ? "true" : "false";
    // Standard SQL string literal: the only character that needs escaping is the quote itself.
    return `'${v.replace(/\u0000/g, "").replace(/'/g, "''")}'`;
};

/** Enum values are snake_case in Postgres and kebab-case in the JSON ("opi-dip" -> "opi_dip"). */
const snake = (v: string) => v.replace(/-/g, "_");

const insert = (table: string, columns: string[], rows: Value[][], conflict: string): string => {
    if (!rows.length) return `-- ${table}: nothing to insert\n`;
    const out: string[] = [];
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
        const chunk = rows.slice(i, i + ROWS_PER_INSERT);
        out.push(
            `insert into public.${table} (${columns.join(", ")}) values\n` +
                chunk.map((r) => `  (${r.map(lit).join(", ")})`).join(",\n") +
                `\non conflict ${conflict} do nothing;\n`,
        );
    }
    return out.join("\n");
};

// ------------------------------------------------------------------------------------ items

// Same rules as packages/ui/data/inventory.ts, so ids, brands and categories line up.
const BRANDS = [
    "Nugenesis", "Seche Vite", "iGEL Beauty", "OPI", "IBD", "ORLY", "Dazzle Dry", "Cre8tion", "Milken", "Starpil", "CnC", "Spa Redi", "DND", "Apres",
    "KDS", "Chisel", "Mia Secret", "Honey Pham", "Pyramid", "Vivian", "Lysol", "Purell", "Dial", "Scott", "Berkley Jensen", "Swiffer", "Clorox",
    "Mr. Clean", "INFA", "Arina", "Divina", "Varisi", "Solar Beauty", "Zen", "Luminary", "Nomi", "Bluerise", "Ugly Duckling", "Enail Couture",
    "Wellsley Farms", "Kona", "Emit", "RED", "RY",
];
const brandOf = (name: string): string | null => {
    if (/^farm ?house fresh/i.test(name)) return "FarmHouse Fresh";
    if (/^barbacide/i.test(name)) return "Barbicide";
    return BRANDS.find((b) => name.toLowerCase().startsWith(b.toLowerCase())) ?? null;
};
const CATEGORY_FIX: Record<string, string> = { "Nail Art & Designs": "Nail Art & Design" };
const POLISH_META: Record<string, { category: string; unit: string; vendorId: string }> = {
    opi: { category: "OPI lacquer and gel", unit: "Bottle", vendorId: "nail-supply-store" },
    "opi-dip": { category: "OPI dip powder", unit: "Jar", vendorId: "nail-supply-store" },
    dnd: { category: "DND gel and lacquer duo", unit: "Bottle", vendorId: "nail-supply-store" },
    "dazzle-dry": { category: "Dazzle Dry lacquer", unit: "Bottle", vendorId: "dazzle-dry" },
    chisel: { category: "Chisel dip powder", unit: "Jar", vendorId: "nail-supply-store" },
    "apres-gel-x": { category: "Aprés Gel-X tips", unit: "Box", vendorId: "nail-supply-store" },
};
const KNOWN_VENDORS = new Set(["nail-supply-store", "costco-bjs", "amazon", "dazzle-dry", "farmhouse-fresh", "warehouse", "other"]);
const KNOWN_LOCATIONS = new Set(["lynnfield", "newburyport"]);
const vendorOf = (id: string | undefined | null) => (id && KNOWN_VENDORS.has(id) ? id : "other");
const polishMeta = (line: string) => {
    const meta = POLISH_META[line];
    if (!meta) throw new Error(`Unknown polish line "${line}". Add it to POLISH_META and to the polish_line enum.`);
    return meta;
};

const ITEM_COLUMNS = ["id", "kind", "name", "brand", "category", "vendor_id", "unit", "polish_line", "color_code", "color_family", "sku", "abc_class", "discontinued", "note"];

const itemRows: Value[][] = [
    ...catalog.supplies.map((s): Value[] => [
        s.id, "supply", s.name, brandOf(s.name), CATEGORY_FIX[s.category.trim()] ?? s.category.trim(), vendorOf(s.vendorId), s.unit || "Each",
        null, null, null, null, "C", false, s.note,
    ]),
    ...catalog.polishes.map((p): Value[] => {
        const meta = polishMeta(p.line);
        return [
            p.id, "polish", p.name, p.brand, meta.category, meta.vendorId, meta.unit,
            snake(p.line), p.colorCode, p.family || null, p.sku ?? null, "C", /disc/i.test(p.note ?? ""), p.note ?? null,
        ];
    }),
    ...catalog.tips.map((t): Value[] => {
        const meta = polishMeta("apres-gel-x");
        return [t.id, "tips", t.name, "Aprés", meta.category, meta.vendorId, meta.unit, "apres_gel_x", null, null, null, "C", false, null];
    }),
];

const itemIds = new Set(itemRows.map((r) => r[0] as string));
if (itemIds.size !== itemRows.length) throw new Error("Duplicate item ids in catalog.json");

// ------------------------------------------------------------------------------------ shelves and stock

const locationOf = (id: string) => {
    if (!KNOWN_LOCATIONS.has(id)) throw new Error(`Unknown location "${id}"`);
    return id;
};

// One shelf row per (location, area, code). The label is kept only when every item on the
// shelf agrees on it; otherwise the sheet was labelling the item, not the shelf.
const shelfLabels = new Map<string, Set<string>>();
for (const s of catalog.supplies) {
    if (!s.shelf) continue;
    const key = JSON.stringify([locationOf(s.location), s.area, s.shelf]);
    const labels = shelfLabels.get(key) ?? new Set<string>();
    if (s.shelfLabel) labels.add(s.shelfLabel);
    shelfLabels.set(key, labels);
}
const shelfRows: Value[][] = [...shelfLabels.entries()].map(([key, labels], i) => {
    const [location, area, code] = JSON.parse(key) as [string, string, string];
    return [location, area, code, labels.size === 1 ? [...labels][0] : null, i + 1];
});

const STOCK_COLUMNS = ["item_id", "location_id", "area", "shelf", "on_hand", "par", "par_rule", "par_note", "reorder_requested", "reorder_qty", "is_sample"];

const stockRows: Value[][] = [
    // Supplies: on-hand is the sheet's number where it had one, otherwise zero until the first count.
    ...catalog.supplies.map((s): Value[] => [
        s.id, locationOf(s.location), s.area ?? "", s.shelf ?? "", s.onHand ?? 0, s.par, s.parRule, s.parNote, s.reorderFlag, s.reorderQty, false,
    ]),
    ...catalog.polishes.map((p): Value[] => {
        const qty = p.finishes ? (p.finishes.regular.qty ?? 0) + (p.finishes.gel.qty ?? 0) : (p.inUse ? 1 : 0) + (p.backstock ?? 0);
        return [
            p.id, locationOf(p.location), "Polish wall", p.colorCode, p.outOfStock ? 0 : qty, POLISH_PAR, "quantity",
            "Default par carried over from the prototype. Confirm.", p.reorderFlag, p.reorderQty ?? null, false,
        ];
    }),
    ...catalog.tips.map((t): Value[] => [
        t.id, locationOf(t.location), "Nail Area", "Gel-X", t.total, TIPS_PAR, "quantity", "Default par carried over from the prototype. Confirm.", false, null, false,
    ]),
];

// ------------------------------------------------------------------------------------ purchase orders

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const supplyByName = new Map(catalog.supplies.map((s) => [norm(s.name), s.id]));
const polishByCode = new Map(catalog.polishes.map((p) => [`${p.line}:${p.colorCode.toLowerCase().replace(/\s+/g, "")}`, p.id]));
const polishBySku = new Map(catalog.polishes.filter((p) => p.sku).map((p) => [`${p.line}:${String(p.sku).toLowerCase()}`, p.id]));

/** Match a sheet row to a catalogue item. Unmatched rows are still imported, with item_id null. */
const matchItem = (cycle: SeedCycle, l: SeedLine): string | null => {
    const name = l.name ?? "";
    if (cycle.kind === "supply") return supplyByName.get(norm(name)) ?? null;
    const dnd = /dnd\s*-?\s*(\d{3})/i.exec(name);
    if (dnd) return polishByCode.get(`dnd:${dnd[1]}`) ?? null;
    const line = l.line ?? "opi";
    const code = (l.colorCode ?? "").toLowerCase().replace(/\s+/g, "");
    return (code && polishByCode.get(`${line}:${code}`)) || (l.sku ? polishBySku.get(`${line}:${l.sku.toLowerCase()}`) : undefined) || (code ? polishByCode.get(`opi:${code}`) : undefined) || null;
};

const LINE_VENDOR: Record<string, string> = { "dazzle-dry": "dazzle-dry" };
const LOC_CODE: Record<string, string> = { lynnfield: "LYN", newburyport: "NBP" };

const ORDER_COLUMNS = ["id", "number", "location_id", "vendor_id", "kind", "status", "cycle", "created_at", "sent_at", "closed_at", "imported"];
const LINE_COLUMNS = ["id", "purchase_order_id", "line_no", "item_id", "name", "sku", "color_code", "variant", "qty_ordered", "qty_received", "received_at", "variant_received", "note", "discontinued"];

const orderRows: Value[][] = [];
const lineRows: Value[][] = [];
let unmatchedLines = 0;

for (const cycle of orders.cycles) {
    const location = locationOf(cycle.location);
    const created = cycle.startDate ?? `${cycle.month ?? "2026-01"}-01`;
    const month = cycle.month ?? created.slice(0, 7);

    // One order per vendor per cycle, in the order vendors first appear on the sheet.
    const groups = new Map<string, { row: Value[]; ordered: number; received: number }[]>();
    cycle.lines.forEach((l, i) => {
        const vendorId = cycle.kind === "supply" ? vendorOf(l.vendorId) : (LINE_VENDOR[l.line ?? ""] ?? "nail-supply-store");
        const qtyOrdered = l.qtyOrdered ?? 0;
        // A line ticked "done" with no received quantity is taken as received in full.
        const qtyReceived = l.qtyReceived ?? (l.done && qtyOrdered > 0 ? qtyOrdered : 0);
        const itemId = matchItem(cycle, l);
        if (!itemId) unmatchedLines += 1;
        const orderId = `${cycle.id}-${vendorId}`;
        const row: Value[] = [
            `${orderId}:l${i + 1}`, orderId, i + 1, itemId, l.name ?? l.colorCode ?? "Unnamed line", l.sku ?? null, l.colorCode ?? null, l.type ?? null,
            qtyOrdered, qtyReceived, l.dateReceived ?? (qtyReceived > 0 ? cycle.savedOn : null), l.typeReceived ?? null,
            l.freeText ? "Free-text request from the order form" : l.note, l.discontinued ?? false,
        ];
        groups.set(vendorId, [...(groups.get(vendorId) ?? []), { row, ordered: qtyOrdered, received: qtyReceived }]);
    });

    [...groups.entries()].forEach(([vendorId, lines], n) => {
        const real = lines.filter((l) => l.ordered > 0);
        const got = real.filter((l) => l.received > 0).length;
        const status = real.length > 0 && got === real.length ? "received" : got > 0 ? "partially_received" : "sent";
        orderRows.push([
            `${cycle.id}-${vendorId}`,
            `PO-${LOC_CODE[location]}-${month.slice(2, 4)}${month.slice(5, 7)}-${cycle.kind === "polish" ? "P" : "S"}${n + 1}`,
            location, vendorId, cycle.kind, status, month, created, created, status === "received" ? cycle.savedOn : null, true,
        ]);
        for (const l of lines) lineRows.push(l.row);
    });
}

// ------------------------------------------------------------------------------------ write

const sql = `-- GENERATED by tools/seed/build-seed-sql.ts. Do not edit; re-run the script instead.
-- Source: packages/ui/data/seed/catalog.json and orders.json
--
-- Requires 0001_init.sql and seed.sql (locations, vendors). Safe to run more than once.
-- Run as the postgres role (SQL editor, psql or the CLI), not through the Data API.

begin;

-- Items: ${itemRows.length} (${catalog.supplies.length} supplies, ${catalog.polishes.length} polish colours, ${catalog.tips.length} tip sets)
${insert("items", ITEM_COLUMNS, itemRows, "(id)")}
-- Shelves: ${shelfRows.length}
${insert("shelves", ["location_id", "area", "code", "label", "sort_order"], shelfRows, "(location_id, area, code)")}
-- Stock levels: ${stockRows.length} (opening balances; the ledger starts at go-live)
${insert("stock_levels", STOCK_COLUMNS, stockRows, "(item_id, location_id)")}
-- Imported purchase orders: ${orderRows.length}
${insert("purchase_orders", ORDER_COLUMNS, orderRows, "(id)")}
-- Imported purchase order lines: ${lineRows.length} (${unmatchedLines} not matched to a catalogue item)
${insert("purchase_order_lines", LINE_COLUMNS, lineRows, "(id)")}
commit;
`;

mkdirSync(path.dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, sql);

console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${(sql.length / 1024).toFixed(0)} KB)`);
console.table({
    items: itemRows.length,
    "  supplies": catalog.supplies.length,
    "  polish colours": catalog.polishes.length,
    "  tip sets": catalog.tips.length,
    shelves: shelfRows.length,
    stock_levels: stockRows.length,
    purchase_orders: orderRows.length,
    purchase_order_lines: lineRows.length,
    "  lines without a catalogue match": unmatchedLines,
});
