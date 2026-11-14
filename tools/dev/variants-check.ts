// Variants and collections sanity. Run: npx tsx --tsconfig packages/ui/tsconfig.json tools/dev/variants-check.ts
import { collectionRows, collections, getStock, stock, variantDemand } from "../../packages/ui/data/inventory";
const withVariants = stock.filter((s) => s.variants);
console.log("colours with variants", withVariants.length, "| with dip linked", withVariants.filter((s) => s.variants?.some((v) => v.id === "dip")).length);
console.log("Funny Bunny", JSON.stringify(getStock("pol-opi-wh02", "lynnfield")?.variants), "demand", variantDemand("pol-opi-wh02", "lynnfield"));
const bad = withVariants.filter((s) => s.variants!.filter((v) => v.id !== "dip").reduce((n, v) => n + v.onHand, 0) !== s.onHand);
console.log("regular+gel != onHand:", bad.length);
for (const c of collections) console.log(c.name.padEnd(26), c.kind.padEnd(7), collectionRows(c, "lynnfield").length);
