/** Date helpers working on ISO strings (yyyy-mm-dd), in UTC so results never shift by timezone. */

const DAY = 86_400_000;

export const toDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

export const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => toIso(new Date(toDate(iso).getTime() + days * DAY));

export const addMonths = (iso: string, months: number) => {
    const d = toDate(iso);
    return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
};

export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);

/** yyyy-mm */
export const monthKey = (iso: string) => iso.slice(0, 7);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 14" or "Nov 14, 2026" */
export const formatDate = (iso: string, withYear = false) => {
    const d = toDate(iso);
    const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
    return withYear ? `${base}, ${d.getUTCFullYear()}` : base;
};

/** "Nov 2026" from yyyy-mm or a full date. */
export const formatMonth = (iso: string) => {
    const d = toDate(iso.length === 7 ? `${iso}-01` : iso);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "3 days ago", "in 5 days", "today". */
export const relativeDays = (iso: string, today: string) => {
    const n = daysBetween(today, iso.slice(0, 10));
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "yesterday";
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
};

/** "9:42 AM" from an ISO datetime. */
export const formatTime = (iso: string) => {
    const d = toDate(iso);
    const h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
};
