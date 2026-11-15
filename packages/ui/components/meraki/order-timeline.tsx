"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { initials } from "@/components/meraki/app-shell";
import { MentionInput } from "@/components/meraki/mention-input";
import { NOTHING_SENT, NOTIFY_HOW, NoteBody, listNames, nowIso } from "@/components/meraki/note-body";
import { SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, TODAY, notesFor, userById, users } from "@/data/inventory";
import type { AppNotification, LocationId, Note, NoteSubject, User } from "@/data/types";
import { daysBetween, formatDate, formatTime } from "@/engine/dates";
import { mentionCandidates, notificationsForNote } from "@/engine/mentions";
import { cx } from "@/utils/cx";

/** Something that happened to the record: created, approved, sent, a delivery logged. */
export interface TimelineEvent {
    id: string;
    /** ISO date or datetime. Leave it out when the source does not record one: the entry then says so. */
    at?: string;
    /** One sentence: "Jordan Blake created this order." */
    text: ReactNode;
    /** A quiet second line: the reason an order was sent back, what changed. */
    detail?: ReactNode;
    tone?: "neutral" | "good" | "warning";
}

export interface OrderTimelineProps {
    /** Status events, in the order they happened. */
    events: TimelineEvent[];
    /** The record the notes belong to. */
    subject: NoteSubject;
    /** Shown in the notification: "PO-LYN-2611-S1". */
    subjectTitle: string;
    /** Where a notification about a note should lead. */
    href: string;
    /** Defaults to the notes stored for the subject. */
    initialNotes?: Note[];
    /** The person reading and writing. */
    user?: User;
    /** The record's location. Only people who can see it are offered in the @ menu. */
    location?: LocationId;
    /** Called with the notifications a new note would send: one per person mentioned. */
    onNotify?: (notifications: AppNotification[]) => void;
    onPost?: (note: Note) => void;
    placeholder?: string;
    className?: string;
}

type Entry = { key: string; sortAt: string; seq: number } & ({ kind: "event"; event: TimelineEvent } | { kind: "note"; note: Note });

const dayLabel = (day: string) => {
    const ago = daysBetween(day, TODAY);
    if (ago === 0) return "Today";
    if (ago === 1) return "Yesterday";
    return formatDate(day, day.slice(0, 4) !== TODAY.slice(0, 4));
};

const DOT: Record<NonNullable<TimelineEvent["tone"]>, string> = {
    neutral: "bg-fg-quaternary",
    good: "bg-fg-success-secondary",
    warning: "bg-fg-warning-secondary",
};

/**
 * One history for a record: what happened to it and what people wrote about it, newest first,
 * under a composer that can @mention people. Status events and notes are interleaved by time.
 * Posting adds the note locally and reports who would be notified. Nothing is sent from the prototype.
 */
export const OrderTimeline = ({
    events,
    subject,
    subjectTitle,
    href,
    initialNotes,
    user = CURRENT_USER,
    location,
    onNotify,
    onPost,
    placeholder = "Leave a note",
    className,
}: OrderTimelineProps) => {
    const [notes, setNotes] = useState<Note[]>(() => initialNotes ?? notesFor(subject.type, subject.id));
    const [draft, setDraft] = useState("");
    const [posted, setPosted] = useState<{ names: string[] } | null>(null);

    const post = (body: string) => {
        const note: Note = { id: `note-${subject.id}-${notes.length + 1}-${Date.now()}`, subject, authorId: user.id, body: body.trim(), createdAt: nowIso() };
        // The composer only offers people who can see the record; this drops anyone else.
        const allowed = new Set(mentionCandidates(users, "", { location, excludeId: user.id, limit: users.length }).map((u) => u.id));
        const sent = notificationsForNote(note, users, subjectTitle, href).filter((n) => allowed.has(n.userId));
        setNotes((prev) => [...prev, note]);
        setDraft("");
        setPosted({ names: sent.map((n) => userById(n.userId)?.name ?? "Someone") });
        onPost?.(note);
        onNotify?.(sent);
    };

    // An event with no date sits with the one before it, where it happened in the sequence.
    const dated = events.reduce<Entry[]>((out, event, i) => {
        const sortAt = event.at ?? out[out.length - 1]?.sortAt ?? "";
        return [...out, { key: event.id, kind: "event", event, sortAt, seq: i }];
    }, []);
    const entries: Entry[] = [
        ...dated,
        ...notes.map((note, i): Entry => ({ key: note.id, kind: "note", note, sortAt: note.createdAt, seq: events.length + i })),
    ].sort((x, y) => y.sortAt.localeCompare(x.sortAt) || y.seq - x.seq);

    const groups: { day: string; entries: Entry[] }[] = [];
    for (const entry of entries) {
        const day = entry.sortAt.slice(0, 10);
        const group = groups[groups.length - 1];
        if (group && group.day === day) group.entries.push(entry);
        else groups.push({ day, entries: [entry] });
    }

    const time = (iso?: string) => (iso && iso.length > 10 ? formatTime(iso) : undefined);

    return (
        <div className={cx("flex flex-col", className)}>
            <div className="flex gap-3">
                <Avatar size="sm" initials={initials(user.name)} className="mt-1.5 max-sm:hidden" />
                <MentionInput
                    users={users}
                    location={location}
                    authorId={user.id}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={post}
                    placeholder={placeholder}
                    submitLabel="Post"
                    hint="Only staff can see notes. Type @ to mention someone."
                    rows={1}
                    className="min-w-0 flex-1"
                />
            </div>

            {posted && (
                <p role="status" data-testid="note-notified" className="mt-3 flex items-start gap-1.5 text-sm text-secondary">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    <span>
                        <span className="font-semibold text-success-primary">Note added. </span>
                        {posted.names.length > 0
                            ? `${listNames(posted.names)} will be notified ${NOTIFY_HOW}. ${NOTHING_SENT}`
                            : "Nobody was mentioned, so nobody is notified."}
                    </span>
                </p>
            )}

            <ol className="relative mt-4 flex flex-col gap-4" data-testid="timeline">
                <span aria-hidden="true" className="absolute top-1 bottom-2 left-4 w-px -translate-x-1/2 bg-border-secondary" />
                {groups.map((group) => (
                    <li key={group.day || "undated"} className="relative flex flex-col gap-1">
                        <p className="pl-11 text-xs font-semibold text-tertiary">{group.day ? dayLabel(group.day) : "Date not recorded"}</p>
                        <ol className="flex flex-col">
                            {group.entries.map((entry) => {
                                if (entry.kind === "note") {
                                    const { note } = entry;
                                    const author = userById(note.authorId);
                                    return (
                                        <li key={entry.key} data-timeline="note" className="flex gap-3 py-2">
                                            <Avatar size="sm" initials={initials(author?.name ?? "?")} className="ring-4 ring-bg-primary" />
                                            <div className="min-w-0 flex-1">
                                                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                                    <span className="font-semibold text-primary">{author?.name ?? "Someone who has left"}</span>
                                                    {author?.id === user.id && <span className="text-xs text-tertiary">You</span>}
                                                    {note.isSample && <SampleBadge />}
                                                    <time dateTime={note.createdAt} className="ml-auto text-xs whitespace-nowrap text-tertiary">
                                                        {time(note.createdAt)}
                                                    </time>
                                                </p>
                                                <NoteBody
                                                    body={note.body}
                                                    viewerId={user.id}
                                                    className="mt-1 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset"
                                                />
                                            </div>
                                        </li>
                                    );
                                }
                                const { event } = entry;
                                return (
                                    <li key={entry.key} data-timeline="event" className="flex gap-3 py-1.5">
                                        <span aria-hidden="true" className="flex h-5 w-8 shrink-0 items-center justify-center">
                                            <span className={cx("size-2.5 rounded-full ring-4 ring-bg-primary", DOT[event.tone ?? "neutral"])} />
                                        </span>
                                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <p className="text-sm text-secondary">{event.text}</p>
                                            {event.detail && <p className="text-sm text-tertiary">{event.detail}</p>}
                                        </div>
                                        <span className="shrink-0 text-xs leading-5 whitespace-nowrap text-tertiary">
                                            {event.at ? time(event.at) : "Date not recorded"}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </li>
                ))}
            </ol>
        </div>
    );
};
