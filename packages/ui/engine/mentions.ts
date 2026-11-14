/**
 * @mentions and the notifications they produce.
 *
 * A note is stored as plain text with mention tokens: "Can you check this @[u-fd-lyn]?".
 * Tokens carry the user id, so a rename never breaks an old note and nobody can be notified
 * by typing a name that merely looks like theirs. The composer inserts tokens; screens render
 * them as the person's current name.
 */
import type { AppNotification, LocationId, Note, NoteSubject, User } from "@/data/types";

const TOKEN = /@\[([a-z0-9-]+)\]/gi;

export type NotePart = { type: "text"; text: string } | { type: "mention"; userId: string; name: string; known: boolean };

/** Split a stored note body into text and mention parts for rendering. */
export const parseNote = (body: string, users: Pick<User, "id" | "name">[]): NotePart[] => {
    const byId = new Map(users.map((u) => [u.id, u.name]));
    const parts: NotePart[] = [];
    let last = 0;
    for (const m of body.matchAll(TOKEN)) {
        const at = m.index ?? 0;
        if (at > last) parts.push({ type: "text", text: body.slice(last, at) });
        const userId = m[1] as string;
        parts.push({ type: "mention", userId, name: byId.get(userId) ?? "someone who has left", known: byId.has(userId) });
        last = at + m[0].length;
    }
    if (last < body.length) parts.push({ type: "text", text: body.slice(last) });
    return parts;
};

/** Ids mentioned in a body, de-duplicated, in order of first appearance. */
export const mentionedIds = (body: string): string[] => [...new Set([...body.matchAll(TOKEN)].map((m) => m[1] as string))];

/** Plain-text version for emails and previews: "@Morgan Lee". */
export const noteToText = (body: string, users: Pick<User, "id" | "name">[]) =>
    parseNote(body, users)
        .map((p) => (p.type === "text" ? p.text : `@${p.name}`))
        .join("");

export const mentionToken = (userId: string) => `@[${userId}]`;

/**
 * People offered in the @ menu: those who can see the record (same location, or admins),
 * filtered by what has been typed after the @. The author is left out.
 */
export const mentionCandidates = (users: User[], query: string, options: { location?: LocationId; excludeId?: string; limit?: number } = {}) => {
    const q = query.trim().toLowerCase();
    return users
        .filter((u) => u.id !== options.excludeId)
        .filter((u) => !options.location || u.access === "admin" || u.role === "owner" || u.locations.includes(options.location))
        .filter(
            (u) =>
                !q ||
                u.name.toLowerCase().includes(q) ||
                u.name
                    .toLowerCase()
                    .split(/\s+/)
                    .some((w) => w.startsWith(q)),
        )
        .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
        .slice(0, options.limit ?? 6);
};

const SUBJECT_LABEL: Record<NoteSubject["type"], string> = { flag: "a flag", order: "an order", item: "an item", count: "a count", task: "a task" };

/**
 * The notifications a new note should create: one per person mentioned, never the author,
 * never someone who cannot see the record.
 */
export const notificationsForNote = (note: Note, users: User[], subjectTitle: string, href: string): AppNotification[] => {
    const author = users.find((u) => u.id === note.authorId);
    return mentionedIds(note.body)
        .filter((id) => id !== note.authorId)
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is User => Boolean(u))
        .map((u) => ({
            id: `ntf-${note.id}-${u.id}`,
            userId: u.id,
            type: "mention" as const,
            actorId: note.authorId,
            title: `${author?.name ?? "Someone"} mentioned you on ${SUBJECT_LABEL[note.subject.type]}`,
            body: `${subjectTitle}: ${noteToText(note.body, users)}`.slice(0, 240),
            href,
            createdAt: note.createdAt,
            emailed: false,
        }));
};

export const unreadCount = (notifications: AppNotification[], userId: string) => notifications.filter((n) => n.userId === userId && !n.readAt).length;
