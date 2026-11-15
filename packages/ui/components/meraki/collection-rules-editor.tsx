"use client";

import { useId, useMemo, useState } from "react";
import { Plus, XClose } from "@untitledui/icons";
import { ButtonGroup, ButtonGroupItem } from "@/components/base/button-group/button-group";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { ruleText, ruleValueLabel } from "@/components/meraki/collection-meta";
import type { Collection, CollectionRule } from "@/data/types";
import { RULE_FIELD_LABEL, matchesRules, ruleFieldValue } from "@/engine/collections";
import type { RuleSubject } from "@/engine/collections";

type Field = CollectionRule["field"];
type Match = NonNullable<Collection["match"]>;

/** The order fields are offered in: where things are first, then what they are. */
const FIELDS: Field[] = ["area", "shelf", "category", "vendor", "brand", "kind", "line", "family", "abc", "status"];

/** Above this many values a dropdown stops being usable, so the value becomes a type-to-find field. */
const MAX_SELECT_VALUES = 80;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export interface CollectionRulesEditorProps {
    rules: CollectionRule[];
    match?: Match;
    /** Every stock row at the location. The values offered and the live count both come from these. */
    rows: RuleSubject[];
    onChange?: (next: { rules: CollectionRule[]; match: Match }) => void;
    /** Show the rules without the controls to change them. */
    readOnly?: boolean;
    /** Start with the "add a rule" form open. */
    defaultAdding?: boolean;
    /** "Lynnfield": completes the live count, "35 items match at Lynnfield". */
    locationLabel?: string;
}

/**
 * The rules of a smart collection: each rule as a removable chip, a form to add one (field, then a
 * value picked from what is actually in stock), the all / any switch, and a live count of matches.
 */
export const CollectionRulesEditor = ({ rules, match = "all", rows, onChange, readOnly, defaultAdding, locationLabel }: CollectionRulesEditorProps) => {
    const listId = useId();
    const [adding, setAdding] = useState(Boolean(defaultAdding) && !readOnly);
    const [field, setField] = useState<Field>("area");
    const [op, setOp] = useState<CollectionRule["op"]>("is");
    const [value, setValue] = useState("");

    // Distinct values present for the chosen field, most common first.
    const values = useMemo(() => {
        const counts = new Map<string, number>();
        for (const row of rows) {
            const v = ruleFieldValue(row, field)?.trim();
            if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        return [...counts.entries()]
            .map(([id, count]) => ({ id, count, label: ruleValueLabel(field, id) }))
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }, [rows, field]);

    const matchCount = useMemo(() => rows.filter((r) => matchesRules(r, rules, match)).length, [rows, rules, match]);

    const typed = values.length > MAX_SELECT_VALUES;
    // A typed value must be one that exists; a picked one defaults to the first on offer.
    const chosen = typed ? values.find((v) => v.id.toLowerCase() === value.trim().toLowerCase())?.id : value || values[0]?.id;
    const candidate: CollectionRule | undefined = chosen ? { field, op, value: chosen } : undefined;
    const duplicate =
        Boolean(candidate) &&
        rules.some((r) => r.field === candidate?.field && r.op === candidate?.op && r.value.toLowerCase() === candidate?.value.toLowerCase());
    const previewCount = candidate ? rows.filter((r) => matchesRules(r, [...rules, candidate], match)).length : undefined;

    const emit = (next: CollectionRule[], nextMatch: Match = match) => onChange?.({ rules: next, match: nextMatch });

    const add = () => {
        if (!candidate || duplicate) return;
        emit([...rules, candidate]);
        setAdding(false);
        setValue("");
    };

    return (
        <div className="flex flex-col gap-3" data-testid="rules-editor">
            {rules.length === 0 ? (
                <p className="text-sm text-tertiary">No rules yet. Add one to choose the items.</p>
            ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Rules">
                    {rules.map((rule, index) => (
                        <li
                            key={`${rule.field}-${rule.op}-${rule.value}`}
                            data-testid="rule-chip"
                            className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-secondary py-0.5 pr-0.5 pl-2.5 text-sm font-medium text-secondary ring-1 ring-secondary ring-inset"
                        >
                            <span className={readOnly ? "truncate py-1 pr-2" : "truncate"}>{ruleText(rule)}</span>
                            {!readOnly && (
                                <button
                                    type="button"
                                    aria-label={`Remove rule: ${ruleText(rule)}`}
                                    onClick={() => emit(rules.filter((_, i) => i !== index))}
                                    className="relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-fg-quaternary outline-focus-ring transition duration-100 ease-linear before:absolute before:-inset-1 hover:bg-secondary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 max-lg:size-9 lg:before:hidden"
                                >
                                    <XClose className="size-4" aria-hidden="true" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {rules.length > 1 &&
                (readOnly ? (
                    <p className="text-sm text-tertiary">{match === "any" ? "Items match any rule." : "Items match all rules."}</p>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-tertiary" id={`${listId}-match`}>
                            Items must match
                        </span>
                        <ButtonGroup
                            size="sm"
                            aria-labelledby={`${listId}-match`}
                            selectedKeys={[match]}
                            disallowEmptySelection
                            onSelectionChange={(keys) => {
                                const next = [...keys][0];
                                if (next === "all" || next === "any") emit(rules, next);
                            }}
                            className="w-full"
                        >
                            <ButtonGroupItem id="all" data-testid="match-all" className="min-h-10 flex-1 justify-center lg:min-h-0">
                                All rules
                            </ButtonGroupItem>
                            <ButtonGroupItem id="any" data-testid="match-any" className="min-h-10 flex-1 justify-center lg:min-h-0">
                                Any rule
                            </ButtonGroupItem>
                        </ButtonGroup>
                    </div>
                ))}

            {!readOnly &&
                (adding ? (
                    <form
                        data-testid="rule-form"
                        className="flex flex-col gap-2.5 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset"
                        onSubmit={(event) => {
                            event.preventDefault();
                            add();
                        }}
                    >
                        <NativeSelect
                            aria-label="Rule field"
                            data-testid="rule-field"
                            size="sm"
                            value={field}
                            onChange={(event) => {
                                setField(event.currentTarget.value as Field);
                                setValue("");
                            }}
                            options={FIELDS.map((f) => ({ label: RULE_FIELD_LABEL[f], value: f }))}
                            selectClassName="min-h-10 lg:min-h-0"
                        />
                        <NativeSelect
                            aria-label="Condition"
                            data-testid="rule-op"
                            size="sm"
                            value={op}
                            onChange={(event) => setOp(event.currentTarget.value as CollectionRule["op"])}
                            options={[
                                { label: "is", value: "is" },
                                { label: "is not", value: "is-not" },
                            ]}
                            selectClassName="min-h-10 lg:min-h-0"
                        />
                        {values.length === 0 ? (
                            <p className="text-sm text-tertiary">Nothing in stock here has a {RULE_FIELD_LABEL[field].toLowerCase()} yet.</p>
                        ) : typed ? (
                            <>
                                <input
                                    aria-label={`${RULE_FIELD_LABEL[field]} value`}
                                    data-testid="rule-value"
                                    list={`${listId}-values`}
                                    value={value}
                                    onChange={(event) => setValue(event.currentTarget.value)}
                                    placeholder={`Type to find one of ${values.length.toLocaleString("en-US")}`}
                                    className="min-h-10 w-full rounded-lg bg-primary px-3 text-sm text-primary shadow-xs ring-1 ring-primary outline-hidden ring-inset placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-brand lg:min-h-9"
                                />
                                <datalist id={`${listId}-values`}>
                                    {values.map((v) => (
                                        <option key={v.id} value={v.id} />
                                    ))}
                                </datalist>
                            </>
                        ) : (
                            <NativeSelect
                                aria-label={`${RULE_FIELD_LABEL[field]} value`}
                                data-testid="rule-value"
                                size="sm"
                                value={chosen ?? ""}
                                onChange={(event) => setValue(event.currentTarget.value)}
                                options={values.map((v) => ({ label: `${v.label} (${v.count.toLocaleString("en-US")})`, value: v.id }))}
                                selectClassName="min-h-10 lg:min-h-0"
                            />
                        )}
                        <p className="text-xs text-tertiary" data-testid="rule-preview" aria-live="polite">
                            {duplicate
                                ? "This rule is already on the list."
                                : previewCount === undefined
                                  ? typed && value.trim()
                                      ? "Choose a value from the list."
                                      : "Choose a value."
                                  : `With this rule, ${plural(previewCount, "item")} would match.`}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="submit"
                                size="sm"
                                color="primary"
                                isDisabled={!candidate || duplicate}
                                data-testid="rule-add-confirm"
                                className="max-lg:min-h-10"
                            >
                                Add rule
                            </Button>
                            <Button size="sm" color="tertiary" onClick={() => setAdding(false)} className="max-lg:min-h-10">
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <Button
                        size="sm"
                        color="secondary"
                        iconLeading={Plus}
                        onClick={() => setAdding(true)}
                        data-testid="add-rule"
                        className="self-start max-lg:min-h-10"
                    >
                        Add rule
                    </Button>
                ))}

            <p className="text-sm text-secondary" data-testid="rule-count" aria-live="polite">
                <span className="font-semibold tabular-nums">{plural(matchCount, "item")}</span> {matchCount === 1 ? "matches" : "match"}
                {locationLabel ? ` at ${locationLabel}` : ""}
            </p>
        </div>
    );
};
