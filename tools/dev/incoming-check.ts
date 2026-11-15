// How many stock lines have something on order. Run: npx tsx --tsconfig packages/ui/tsconfig.json tools/dev/incoming-check.ts
import { stockRows } from "../../packages/ui/data/inventory";
for (const loc of ["lynnfield", "newburyport"] as const) {
    const rows = stockRows(loc);
    console.log(loc, "incoming rows", rows.filter((r) => r.incoming > 0).length, "unconfirmed rows", rows.filter((r) => r.unconfirmed > 0).length, rows.filter((r) => r.unconfirmed > 0).slice(0, 3).map((r) => `${r.item.name}: ${r.unconfirmed}`));
}
