// How many catalogue items picked up product data from the enrichment file.
import { items } from "../../packages/ui/data/inventory";
const withImg = items.filter((i) => i.imageUrl);
console.log("items with image", withImg.length, "| with description", items.filter((i) => i.description).length, "| with UPC", items.filter((i) => i.upc).length);
for (const i of withImg.slice(0, 40)) console.log(" -", i.name, "|", i.upc ?? "no upc", "|", (i.imageUrl ?? "").slice(0, 70));
