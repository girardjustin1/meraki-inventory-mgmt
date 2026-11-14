// Headline numbers the Insights screen will show. Run: npx tsx --tsconfig packages/ui/tsconfig.json tools/dev/insights-check.ts
import { demandFor, forecasts, items, measuredCycleDays, orderCycles, polishForecasts, purchaseOrders, serviceRecipes, stock, vendors, TODAY } from "../../packages/ui/data/inventory";
import { demandMix, mixShifts, pareto, reorderCalendar, seasonality, serviceCost, slowMovers, volumeByCycle } from "../../packages/ui/engine/insights";

const cycles = orderCycles("lynnfield", "polish");
const polish = demandFor("lynnfield", "polish");
console.log("polish cycles", cycles, "| colours reordered", polish.length, "| top", polish.slice(0, 5).map((r) => `${r.name} ${r.qty} (${r.cycles}c)`));
const fam = demandMix(polish.filter((r) => r.line === "opi"), cycles, (r) => r.family);
console.log("OPI families", fam.slice(0, 6).map((f) => `${f.group} ${f.qty} ${Math.round(f.share * 100)}%`));
console.log("shifts", mixShifts(fam, cycles).slice(0, 4).map((s) => `${s.group} ${Math.round(s.from * 100)}→${Math.round(s.to * 100)}%`));
console.log("by line", demandMix(polish, cycles, (r) => r.line).map((f) => `${f.group} ${f.qty}`));
const lynStock = stock.filter((s) => s.locationId === "lynnfield");
console.log("slow polish (2+ on hand)", slowMovers(lynStock, items, polish, cycles, { kind: "polish", minOnHand: 2 }).length);
console.log("polish forecasts", polishForecasts.length, "high", polishForecasts.filter((f) => f.confidence === "high").length, "medium", polishForecasts.filter((f) => f.confidence === "medium").length);
console.log("volume by cycle", volumeByCycle(purchaseOrders, undefined, "lynnfield"));
console.log("seasonality", seasonality(volumeByCycle(purchaseOrders, undefined, "lynnfield").map((v) => ({ month: v.cycle, qty: v.qty }))));
const lynF = forecasts.filter((f) => f.locationId === "lynnfield");
const cal = reorderCalendar(lynF, items, vendors, TODAY);
console.log("calendar", cal.length, "due now", cal.filter((c) => c.due).length, cal.slice(0, 3).map((c) => `${c.name} ${c.reorderOn}`), "measured cycle", measuredCycleDays);
const p = pareto(lynF.map((f) => ({ itemId: f.itemId, name: items.find((i) => i.id === f.itemId)?.name ?? "", value: f.monthlyUsage * 12 * (items.find((i) => i.id === f.itemId)?.unitCost ?? 0) })));
console.log("pareto", p.itemsFor80, "of", p.points.length, "items = 80% of projected spend", Math.round(p.total));
for (const r of serviceRecipes) console.log(r.service, serviceCost(r), r.lines.map((l) => `${l.name}:${l.unitCost}`).join(" | "));
