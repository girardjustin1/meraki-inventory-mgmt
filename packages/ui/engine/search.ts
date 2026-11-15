/**
 * Search for the command menu (Cmd+K). Pure and synchronous: the whole catalogue is about
 * 1,750 items, so a scored scan per keystroke is instant and needs no index or server.
 */

export type SearchKind = "supply" | "polish" | "order" | "page" | "flag" | "person" | "shelf";

export interface SearchDoc {
    id: string;
    kind: SearchKind;
    title: string;
    subtitle?: string;
    href: string;
    /** Extra text to match on: brand, SKU, colour code, UPC, shelf, vendor. Lower-cased by the indexer. */
    keywords?: string;
    /** Exact identifiers (SKU, colour code, UPC, PO number). A query equal to one of these ranks first. */
    codes?: string[];
}

export interface SearchHit<T extends SearchDoc = SearchDoc> {
    doc: T;
    score: number;
}

const norm = (s: string) =>
    s
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

/** Score one document against a query. Zero means no match: every word of the query must appear. */
export const scoreDoc = (doc: SearchDoc, query: string): number => {
    const q = norm(query);
    if (!q) return 0;
    const title = norm(doc.title);
    const compact = q.replace(/ /g, "");
    const codes = (doc.codes ?? []).map((c) => norm(c));
    const hay = `${title} ${norm(doc.subtitle ?? "")} ${norm(doc.keywords ?? "")} ${codes.join(" ")}`;
    const tokens = q.split(" ");
    // Every word must appear somewhere, or the whole query must be a code typed without its spaces or dashes.
    if (!tokens.every((t) => hay.includes(t)) && !codes.some((c) => c.replace(/ /g, "").startsWith(compact))) return 0;
    let score = 10;
    if (doc.codes?.some((c) => norm(c).replace(/ /g, "") === compact)) score += 120;
    else if (doc.codes?.some((c) => norm(c).replace(/ /g, "").startsWith(compact))) score += 40;
    if (title === q) score += 100;
    else if (title.startsWith(q)) score += 60;
    else if (title.split(" ").some((w) => w.startsWith(tokens[0] ?? ""))) score += 25;
    if (tokens.every((t) => title.includes(t))) score += 20;
    // Shorter titles are closer matches for the same words.
    score -= Math.min(title.length, 60) / 20;
    return score;
};

/** Best matches per kind, each list sorted by score. */
export const search = <T extends SearchDoc>(docs: T[], query: string, limitPerKind = 6): Partial<Record<SearchKind, SearchHit<T>[]>> => {
    const out: Partial<Record<SearchKind, SearchHit<T>[]>> = {};
    if (!norm(query)) return out;
    for (const doc of docs) {
        const score = scoreDoc(doc, query);
        if (score <= 0) continue;
        (out[doc.kind] ??= []).push({ doc, score });
    }
    for (const kind of Object.keys(out) as SearchKind[]) {
        out[kind] = (out[kind] as SearchHit<T>[]).sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title)).slice(0, limitPerKind);
    }
    return out;
};

/** Total matches before the per-kind limit, for "See all 43 results". */
export const countMatches = (docs: SearchDoc[], query: string, kinds?: SearchKind[]) =>
    docs.reduce((n, d) => n + ((!kinds || kinds.includes(d.kind)) && scoreDoc(d, query) > 0 ? 1 : 0), 0);
