// Quick sanity print of the prototype data layer. Run: npx tsx --tsconfig packages/ui/tsconfig.json tools/dev/inspect-data.ts
import { activity, countSessions, digests, flags, forecasts, getItem, purchaseOrders, reorderSuggestions, summary } from "../../packages/ui/data/inventory";

console.log("summary lynnfield", summary("lynnfield"));
console.log("summary newburyport", summary("newburyport"));
console.log("POs", purchaseOrders.length, purchaseOrders.slice(0, 6).map((p) => `${p.number} ${p.status} ${p.lines.length}`));
const byType: Record<string, number> = {};
for (const f of flags) byType[`${f.type}/${f.severity}/${f.fromRealData ? "real" : "sample"}`] = (byType[`${f.type}/${f.severity}/${f.fromRealData ? "real" : "sample"}`] ?? 0) + 1;
console.log("flags", flags.length, byType);
for (const f of flags.filter((f) => f.fromRealData).slice(0, 8)) console.log(" -", f.severity, "|", f.title, "|", f.summary.slice(0, 110));
const fc = forecasts.filter((f) => f.locationId === "lynnfield" && f.confidence !== "none");
console.log("forecasts with history", fc.length, "high", fc.filter((f) => f.confidence === "high").length);
for (const f of fc.sort((a, b) => b.monthlyUsage - a.monthlyUsage).slice(0, 6)) console.log(" -", getItem(f.itemId)?.name, f.monthlyUsage, "/mo cover", f.daysOfCover, "rop", f.reorderPoint, "suggest", f.suggestedOrderQty, f.confidence);
console.log("reorder", reorderSuggestions("lynnfield").length);
console.log("counts", countSessions.map((c) => `${c.name}:${c.status}:${c.lines.length}`));
console.log("activity", activity.length);
const d = digests[0]!;
console.log("digest", d.headline, d.stats.map((s) => `${s.label}=${s.value}`), d.insights.map((i) => i.title));
console.log("vendor perf", digests[1]!.vendorPerformance);
