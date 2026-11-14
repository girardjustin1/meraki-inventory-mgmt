import { TODAY, users as allUsers } from "@/data/inventory";
import type { User } from "@/data/types";
import { daysBetween, formatDate, formatTime } from "@/engine/dates";
import { parseNote } from "@/engine/mentions";
import { cx } from "@/utils/cx";

const pad = (n: number) => String(n).padStart(2, "0");

/** The prototype's fixed date with the wall-clock time, so things added now sort after the sample entries. */
export const nowIso = () => {
    const d = new Date();
    return `${TODAY}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}Z`;
};

/**
 * "Today, 9:48 AM", "Yesterday, 7:02 PM", "3 days ago", "Nov 4". Measured against the prototype's TODAY.
 * `short` drops the day word for today, for lists already grouped under a "Today" heading.
 */
export const relativeTime = (iso: string, short = false, today: string = TODAY) => {
    const day = iso.slice(0, 10);
    const time = iso.length > 10 ? formatTime(iso) : undefined;
    const ago = daysBetween(day, today);
    if (ago === 0) return time ? (short ? time : `Today, ${time}`) : "Today";
    if (ago === 1) return time ? `Yesterday, ${time}` : "Yesterday";
    if (ago > 1 && ago < 7) return `${ago} days ago`;
    const date = formatDate(day, day.slice(0, 4) !== today.slice(0, 4));
    return ago < 0 && time ? `${date}, ${time}` : date;
};

/** "Morgan Lee", "Morgan Lee and Avery Chen", "Morgan Lee, Avery Chen and Sam Patel". */
export const listNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * How a notification reaches people, said the same way everywhere. Nothing leaves the prototype,
 * so every screen that says someone "will be notified" ends with this.
 */
export const NOTIFY_HOW = "in the app, and by email if they have that turned on";
export const NOTHING_SENT = "Nothing is sent from the prototype.";

interface NoteBodyProps {
    /** Stored note text, with mention tokens like `@[u-fd-lyn]`. */
    body: string;
    /** People the tokens can resolve to. Defaults to everyone on the team. */
    users?: Pick<User, "id" | "name">[];
    /** The person reading. A mention of them is emphasised. */
    viewerId?: string;
    className?: string;
}

/**
 * A stored note rendered for reading: mention tokens become the person's current name.
 * Someone whose id no longer resolves is shown as "someone who has left".
 */
export const NoteBody = ({ body, users = allUsers, viewerId, className }: NoteBodyProps) => (
    <p className={cx("text-sm break-words whitespace-pre-wrap text-secondary", className)}>
        {parseNote(body, users).map((part, i) => {
            if (part.type === "text") return <span key={i}>{part.text}</span>;
            if (!part.known) {
                return (
                    <span key={i} title="This person no longer has access" className="text-tertiary italic">
                        {part.name}
                    </span>
                );
            }
            const mine = part.userId === viewerId;
            return (
                <span
                    key={i}
                    data-mention={part.userId}
                    className={cx("rounded-sm font-semibold text-brand-secondary", mine && "bg-brand-secondary px-1 py-0.5 ring-1 ring-brand ring-inset")}
                >
                    @{part.name}
                    {mine && <span className="sr-only"> (you)</span>}
                </span>
            );
        })}
    </p>
);
