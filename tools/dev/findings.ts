// Prints the headline findings from the imported 2026 data. Run: npx tsx --tsconfig packages/ui/tsconfig.json tools/dev/findings.ts
import { flags, forecasts, getDigest, items, purchaseOrders, stock } from "../../packages/ui/data/inventory";

const real = flags.filter((f) => f.fromRealData);
const by = (t: string) => real.filter((f) => f.type === t);
console.log("real flags", real.length);
for (const t of ["received-mismatch", "variant-mismatch", "order-spike", "overdue-receipt", "over-par", "repeat-out-of-stock", "data-quality"]) {
    console.log(`\n${t}: ${by(t).length}`);
    for (const f of by(t).slice(0, 9)) console.log("  -", f.title, "|", f.evidence.map((e) => `${e.label}=${e.value}`).join(", ").slice(0, 150));
}
const imported = purchaseOrders.filter((p) => p.imported);
const lines = imported.flatMap((p) => p.lines.filter((l) => l.qtyOrdered > 0).map((l) => ({ ...l, loc: p.locationId, kind: p.kind })));
console.log("\nimported POs", imported.length, "lines with qty", lines.length, "received", lines.filter((l) => l.qtyReceived > 0).length, "unmatched to catalogue", lines.filter((l) => !l.itemId).length);
console.log("lynnfield open lines", lines.filter((l) => l.loc === "lynnfield" && l.qtyReceived === 0).length, "supply", lines.filter((l) => l.loc === "lynnfield" && l.qtyReceived === 0 && l.kind === "supply").length);
console.log("vendor perf", JSON.stringify(getDigest("monthly", "all").vendorPerformance));
const lyn = stock.filter((s) => s.locationId === "lynnfield" && items.find((i) => i.id === s.itemId)?.kind === "supply");
console.log("par rules", ["quantity", "level", "unset", "paused"].map((r) => `${r}=${lyn.filter((s) => s.parRule === r).length}`).join(" "), "real on-hand", lyn.filter((s) => !s.isSample).length, "reorder ticked", lyn.filter((s) => s.reorderRequested).length);
const fc = forecasts.filter((f) => f.locationId === "lynnfield");
console.log("forecast confidence", ["high", "medium", "low", "none"].map((c) => `${c}=${fc.filter((f) => f.confidence === c).length}`).join(" "));
console.log("abc", ["A", "B", "C"].map((c) => `${c}=${items.filter((i) => i.kind === "supply" && i.abc === c).length}`).join(" "));
const cats = new Map<string, number>(); for (const i of items.filter((i) => i.kind === "supply")) cats.set(i.category, (cats.get(i.category) ?? 0) + 1);
console.log("categories", [...cats.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
