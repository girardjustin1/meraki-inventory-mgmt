/**
 * What a scanned code means.
 *
 * Three kinds of code reach the scanner:
 *   - a manufacturer barcode (UPC / EAN), matched against `item.upc` where the catalogue has one;
 *   - a Meraki item label, `MRK:<itemId>`, printed for decanted or unbarcoded product;
 *   - a Meraki shelf label, `MRK-SHELF:<locationId>:<area>:<shelf>`, which opens everything on that shelf.
 *     The shelf part may be empty for areas that have no shelf codes yet ("MRK-SHELF:lynnfield:Wax Room:").
 *
 * Pure functions, no React, so the same lookup runs in the scanner, in a count and on the server.
 */
import { getItem, getStock, items, locations, stockRows } from "@/data/inventory";
import type { StockRow } from "@/data/inventory";
import type { Item, LocationId, StockLevel } from "@/data/types";

export const ITEM_LABEL_PREFIX = "MRK:";
export const SHELF_LABEL_PREFIX = "MRK-SHELF:";

export const labelCodeForItem = (id: string) => `${ITEM_LABEL_PREFIX}${id}`;

export const labelCodeForShelf = (locationId: LocationId, area: string, shelf = "") => `${SHELF_LABEL_PREFIX}${locationId}:${area}:${shelf}`;

export type ScanResult =
    | { kind: "item"; code: string; item: Item; /** Missing when this location does not stock the item. */ level?: StockLevel }
    | { kind: "shelf"; code: string; locationId: LocationId; area: string; shelf: string; rows: StockRow[] }
    | { kind: "unknown"; code: string };

/** Scanners report UPC-A either as 12 digits or as EAN-13 with a leading zero. Compare without leading zeros. */
const barcodeKey = (code: string) => code.replace(/\D/g, "").replace(/^0+/, "");

let upcIndex: Map<string, Item> | undefined;
const byUpc = (code: string) => {
    if (!upcIndex) upcIndex = new Map(items.filter((i) => i.upc).map((i) => [barcodeKey(i.upc as string), i]));
    const key = barcodeKey(code);
    return key ? upcIndex.get(key) : undefined;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Resolve a scanned or typed code for one location.
 * `links` holds barcodes a manager has attached to catalogue items (code → itemId).
 */
export const lookupCode = (rawCode: string, location: LocationId, links: Record<string, string> = {}): ScanResult => {
    const code = rawCode.trim();
    if (!code) return { kind: "unknown", code };

    if (code.toUpperCase().startsWith(SHELF_LABEL_PREFIX)) {
        const [loc = "", area = "", ...rest] = code.slice(SHELF_LABEL_PREFIX.length).split(":");
        const shelf = rest.join(":").trim();
        const locationId = locations.find((l) => l.id === loc.trim().toLowerCase())?.id;
        if (!locationId || !area.trim()) return { kind: "unknown", code };
        const rows = stockRows(locationId).filter((r) => same(r.level.area, area) && (shelf === "" || same(r.level.shelf, shelf)));
        if (rows.length === 0) return { kind: "unknown", code };
        return { kind: "shelf", code, locationId, area: rows[0]?.level.area ?? area.trim(), shelf, rows };
    }

    const linked = links[code] ?? links[barcodeKey(code)];
    const item = linked
        ? getItem(linked)
        : code.toUpperCase().startsWith(ITEM_LABEL_PREFIX)
          ? getItem(code.slice(ITEM_LABEL_PREFIX.length).trim())
          : /^\d{6,14}$/.test(code)
            ? byUpc(code)
            : undefined;

    if (!item) return { kind: "unknown", code };
    return { kind: "item", code, item, level: getStock(item.id, location) };
};

/** "Nail Area · 1A", or just the area when the shelf has no code. */
export const shelfLabel = (level?: Pick<StockLevel, "area" | "shelf">) => {
    if (!level) return "Not stocked at this location";
    return level.shelf ? `${level.area} · ${level.shelf}` : level.area;
};

/** Short human label for a code, used by the demo scanner buttons. */
export const describeCode = (code: string, location: LocationId = "lynnfield") => {
    const result = lookupCode(code, location);
    if (result.kind === "item") return result.item.name;
    if (result.kind === "shelf") return result.shelf ? `Shelf label ${result.shelf}` : `Shelf label ${result.area}`;
    return "Unknown barcode";
};

/**
 * Codes for the simulated scanner in Storybook and on machines without a camera:
 * manufacturer barcodes, Meraki item labels, one shelf label and one barcode that is not in the catalogue.
 */
export const DEMO_CODES: string[] = [
    "766150110173", // iGEL Beauty Non-Cleansing Gel Top Coat (UPC, on an open order)
    "875520003110", // Nugenesis Base Gel (2) Pink - Bottle (UPC)
    labelCodeForItem("sup-cnc-acetone"),
    labelCodeForItem("sup-starpil-hard-wax-10lb-bag"), // tracked by fill level
    "094100001913", // OPI Funny Bunny (polish, UPC)
    labelCodeForShelf("lynnfield", "Nail Area", "1A"),
    "0123456789012", // not in the catalogue
];
