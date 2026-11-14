// Polish stock status counts per line.
import { stockRows } from "../../packages/ui/data/inventory";
const rows = stockRows("lynnfield", "polish");
const by: Record<string, Record<string, number>> = {};
for (const r of rows) { const l = r.item.line ?? "?"; by[l] ??= {}; by[l][r.status] = (by[l][r.status] ?? 0) + 1; }
console.log(by);
