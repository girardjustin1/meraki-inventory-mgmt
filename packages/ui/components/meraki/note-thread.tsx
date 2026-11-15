"use client";

import { useState } from "react";
import { CheckCircle, MessageTextSquare01 } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { initials } from "@/components/meraki/app-shell";
import { MentionInput } from "@/components/meraki/mention-input";
import { NOTHING_SENT, NOTIFY_HOW, NoteBody, listNames, nowIso, relativeTime } from "@/components/meraki/note-body";
import { SampleBadge } from "@/components/meraki/status-badges";
import { CURRENT_USER, notesFor, userById, users } from "@/data/inventory";
import type { AppNotification, LocationId, Note, NoteSubject, User } from "@/data/types";
import { mentionCandidates, notificationsForNote } from "@/engine/mentions";
import { cx } from "@/utils/cx";

export interface NoteThreadProps {
    /** The record the notes belong to. */
    subject: NoteSubject;
    /** Shown in the notification: "Costco run for Lynnfield". */
    subjectTitle: string;
    /** Where a notification about this thread should lead. */
    href: string;
    /** Defaults to the notes stored for the subject. */
    initialNotes?: Note[];
    /** The person reading and writing. */
    user?: User;
    /** The record's location. Only people who can see it are offered in the @ menu. */
    location?: LocationId;
    /** Called with the notifications a new note would send: one per person mentioned. */
    onNotify?: (notifications: AppNotification[]) => void;
    /** Called with the note itself, for screens that also list notes elsewhere (a timeline). */
    onPost?: (note: Note) => void;
    placeholder?: string;
    className?: string;
}

/**
 * The notes on a record, with a composer that can @mention people.
 * Posting adds the note locally and reports who would be notified. Nothing is sent from the prototype.
 */
export const NoteThread = ({
    subject,
    subjectTitle,
    href,
    initialNotes,
    user = CURRENT_USER,
    location,
    onNotify,
    onPost,
    placeholder = "Add what you checked or what you know. Type @ to mention someone",
    className,
}: NoteThreadProps) => {
    const [notes, setNotes] = useState<Note[]>(() => initialNotes ?? notesFor(subject.type, subject.id));
    const [draft, setDraft] = useState("");
    const [posted, setPosted] = useState<{ names: string[] } | null>(null);

    const post = (body: string) => {
        const note: Note = { id: `note-${subject.id}-${notes.length + 1}-${Date.now()}`, subject, authorId: user.id, body: body.trim(), createdAt: nowIso() };
        // Belt and braces: the composer only offers people who can see the record, and this drops anyone else.
        const allowed = new Set(mentionCandidates(users, "", { location, excludeId: user.id, limit: users.length }).map((u) => u.id));
        const sent = notificationsForNote(note, users, subjectTitle, href).filter((n) => allowed.has(n.userId));
        setNotes((prev) => [...prev, note]);
        setDraft("");
        setPosted({ names: sent.map((n) => userById(n.userId)?.name ?? "Someone") });
        onPost?.(note);
        onNotify?.(sent);
    };

    return (
        <div className={cx("flex flex-col gap-4", className)}>
            {notes.length > 0 ? (
                <ol className="flex flex-col gap-3">
                    {notes.map((n) => {
                        const author = userById(n.authorId);
                        return (
                            <li key={n.id} className="flex gap-3">
                                <Avatar size="sm" initials={initials(author?.name ?? "?")} />
                                <div className="min-w-0 flex-1 rounded-lg bg-secondary px-3 py-2 ring-1 ring-secondary ring-inset">
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                        <span className="font-semibold text-primary">{author?.name ?? "Someone who has left"}</span>
                                        {author?.id === user.id && <span className="text-xs text-tertiary">You</span>}
                                        <span className="text-xs text-tertiary">{relativeTime(n.createdAt)}</span>
                                        {n.isSample && <SampleBadge />}
                                    </p>
                                    <NoteBody body={n.body} viewerId={user.id} className="mt-1" />
                                </div>
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <div className="flex items-start gap-2.5 rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary ring-inset">
                    <MessageTextSquare01 className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                    <p className="text-sm text-tertiary">
                        <span className="font-semibold text-secondary">No notes yet.</span> Add what you checked or what you know. Type @ to bring someone in.
                    </p>
                </div>
            )}

            <MentionInput users={users} location={location} authorId={user.id} value={draft} onChange={setDraft} onSubmit={post} placeholder={placeholder} />

            {posted && (
                <p role="status" data-testid="note-notified" className="flex items-start gap-1.5 text-sm text-secondary">
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    <span>
                        <span className="font-semibold text-success-primary">Note added. </span>
                        {posted.names.length > 0
                            ? `${listNames(posted.names)} will be notified ${NOTIFY_HOW}. ${NOTHING_SENT}`
                            : "Nobody was mentioned, so nobody is notified."}
                    </span>
                </p>
            )}
        </div>
    );
};
