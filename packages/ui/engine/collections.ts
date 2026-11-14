/**
 * Collections: saved sets of items.
 *
 * A manual collection is a hand-picked list ("Pedicure station"). A smart collection is a set of
 * rules ("everything in the Wax Room", "OPI pinks", "class A items") that stays up to date as the
 * catalogue changes. Collections drive count lists, service kits and bulk actions.
 */
import type { Collection, CollectionRule, Item, StockLevel, StockStatus } from "@/data/types";

/** The facts a rule can test. Screens pass their stock rows, which have this shape. */
export interface RuleSubject {
    item: Item;
    level: Pick<StockLevel, "area" | "shelf">;
    status: StockStatus;
    vendor: { id: string };
}

export const RULE_FIELD_LABEL: Record<CollectionRule["field"], string> = {
    area: "Area",
    shelf: "Shelf",
    category: "Category",
    vendor: "Vendor",
    brand: "Brand",
    line: "Polish line",
    family: "Colour family",
    status: "Stock status",
    abc: "ABC class",
    kind: "Type",
};

const valueOf = (row: RuleSubject, field: CollectionRule["field"]): string | undefined => {
    switch (field) {
        case "area":
            return row.level.area;
        case "shelf":
            return row.level.shelf;
        case "category":
            return row.item.category;
        case "vendor":
            return row.vendor.id;
        case "brand":
            return row.item.brand;
        case "line":
            return row.item.line;
        case "family":
            return row.item.colorFamily;
        case "status":
            return row.status;
        case "abc":
            return row.item.abc;
        case "kind":
            return row.item.kind;
    }
};

const same = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export const matchesRule = (row: RuleSubject, rule: CollectionRule) => {
    const hit = same(valueOf(row, rule.field), rule.value);
    return rule.op === "is-not" ? !hit : hit;
};

/** Smart collections: `all` rules must match (AND) unless `match` is "any" (OR). */
export const matchesRules = (row: RuleSubject, rules: CollectionRule[], match: Collection["match"] = "all") =>
    rules.length === 0 ? false : match === "any" ? rules.some((r) => matchesRule(row, r)) : rules.every((r) => matchesRule(row, r));

/** Rows belonging to a collection, in the order given for manual ones. */
export const resolveCollection = <T extends RuleSubject>(collection: Collection, rows: T[]): T[] => {
    if (collection.kind === "manual") {
        const byId = new Map(rows.map((r) => [r.item.id, r]));
        return (collection.itemIds ?? []).map((id) => byId.get(id)).filter((r): r is T => Boolean(r));
    }
    return rows.filter((r) => matchesRules(r, collection.rules ?? [], collection.match));
};

/** "Area is Wax Room" */
export const describeRule = (rule: CollectionRule, valueLabel?: string) =>
    `${RULE_FIELD_LABEL[rule.field]} ${rule.op === "is-not" ? "is not" : "is"} ${valueLabel ?? rule.value}`;
