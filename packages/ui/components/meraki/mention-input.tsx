"use client";

import type { CSSProperties, ChangeEvent, KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { AtSign } from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { initials } from "@/components/meraki/app-shell";
import { ROLE_LABEL } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { mentionCandidates, mentionToken, parseNote } from "@/engine/mentions";
import { cx } from "@/utils/cx";

// ------------------------------------------------------------------------------------ model
//
// The person sees and edits plain text ("Can you check @Morgan Lee"). Beside it the composer keeps
// the list of mentions it inserted and where each one sits. Only those tracked ranges become
// tokens ("@[u-fd-lyn]") in the stored value, so typing a name by hand never notifies anybody.

export interface TrackedMention {
    userId: string;
    name: string;
    /** Index of the "@" in the visible text. The mention covers `@` plus the name. */
    start: number;
}

export interface ComposerState {
    text: string;
    mentions: TrackedMention[];
}

const end = (m: TrackedMention) => m.start + m.name.length + 1;
const intact = (text: string, m: TrackedMention) => text.slice(m.start, end(m)) === `@${m.name}`;

/** A token typed by hand must not become a mention: break it with a zero-width space. */
const neutralise = (text: string) => text.replace(/@\[/g, "@​[");

/** Visible text and tracked mentions for a stored value. */
export const fromTokens = (value: string, users: Pick<User, "id" | "name">[]): ComposerState => {
    let text = "";
    const mentions: TrackedMention[] = [];
    for (const part of parseNote(value, users)) {
        if (part.type === "text") text += part.text;
        else {
            mentions.push({ userId: part.userId, name: part.name, start: text.length });
            text += `@${part.name}`;
        }
    }
    return { text, mentions };
};

/** The stored value: tracked mentions become tokens, everything else stays as typed. */
export const toTokens = ({ text, mentions }: ComposerState) => {
    let out = "";
    let at = 0;
    for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
        out += neutralise(text.slice(at, m.start)) + mentionToken(m.userId);
        at = end(m);
    }
    return out + neutralise(text.slice(at));
};

/**
 * Work out what an edit did to the tracked mentions.
 * Mentions before the edit stay, mentions after it move, and a mention the edit touches is dropped.
 * When the edit only deleted text (Backspace into a name), the rest of that mention goes with it,
 * so half a name is never left behind looking like a mention.
 *
 * `caret` is the collapsed caret after the edit. It pins down where the edit happened when the
 * text alone is ambiguous (deleting one of two identical characters).
 */
export const applyEdit = (prev: ComposerState, next: string, caret: number | null): { state: ComposerState; caret: number | null } => {
    const old = prev.text;
    if (next === old) return { state: prev, caret };

    let a = 0;
    let oldEnd = old.length;
    let nextEnd = next.length;
    const tail = caret === null ? -1 : next.length - caret;
    if (caret !== null && tail <= old.length && old.slice(old.length - tail) === next.slice(caret)) {
        oldEnd = old.length - tail;
        nextEnd = caret;
    } else {
        const limit = Math.min(old.length, next.length);
        let prefix = 0;
        while (prefix < limit && old[prefix] === next[prefix]) prefix++;
        let suffix = 0;
        while (suffix < limit - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
        oldEnd = old.length - suffix;
        nextEnd = next.length - suffix;
    }
    const limit = Math.min(oldEnd, nextEnd);
    while (a < limit && old[a] === next[a]) a++;

    const shift = nextEnd - oldEnd;
    const kept: TrackedMention[] = [];
    const touched: TrackedMention[] = [];
    for (const m of prev.mentions) {
        if (end(m) <= a) kept.push(m);
        else if (m.start >= oldEnd) kept.push({ ...m, start: m.start + shift });
        else touched.push(m);
    }

    const deletedOnly = nextEnd === a;
    if (deletedOnly && touched.length > 0) {
        const from = Math.min(a, ...touched.map((m) => m.start));
        const to = Math.max(oldEnd, ...touched.map(end));
        const text = old.slice(0, from) + old.slice(to);
        const mentions = prev.mentions.filter((m) => end(m) <= from || m.start >= to).map((m) => (m.start >= to ? { ...m, start: m.start - (to - from) } : m));
        return { state: { text, mentions: mentions.filter((m) => intact(text, m)) }, caret: from };
    }
    return { state: { text: next, mentions: kept.filter((m) => intact(next, m)) }, caret };
};

interface Trigger {
    /** Index of the "@" being typed. */
    at: number;
    query: string;
}

/** The unfinished "@que" just before the caret, if there is one. */
export const findTrigger = (text: string, caret: number | null, mentions: TrackedMention[]): Trigger | null => {
    if (caret === null) return null;
    for (let i = caret - 1; i >= 0 && caret - i <= 40; i--) {
        const ch = text[i];
        if (ch === "\n") return null;
        if (ch !== "@") continue;
        // An "@" in the middle of a word is an email address, not a mention.
        if (i > 0 && !/[\s([{"'.,;:!?—-]/.test(text[i - 1] ?? "")) return null;
        if (mentions.some((m) => m.start === i)) return null;
        const query = text.slice(i + 1, caret);
        if (/^\s/.test(query) || query.includes("@")) return null;
        return { at: i, query };
    }
    return null;
};

// ------------------------------------------------------------------------------------ component

export interface MentionInputProps {
    /** Everyone on the team. The @ menu narrows this to people who can see the record. */
    users: User[];
    /** The record's location. People from the other location are not offered unless they are admins. */
    location?: LocationId;
    /** The person writing. They are left out of the @ menu. */
    authorId: string;
    /** Stored form, with tokens: "Can you check @[u-fd-lyn]". */
    value: string;
    onChange: (value: string) => void;
    /** Called with the stored form. When set, the composer shows its own submit button. */
    onSubmit?: (value: string) => void;
    placeholder?: string;
    submitLabel?: string;
    isRequired?: boolean;
    isDisabled?: boolean;
    /** Visible label. Without it the placeholder names the field for screen readers. */
    label?: string;
    hint?: ReactNode;
    /** Starting height in lines. The field grows with the text. */
    rows?: number;
    autoFocus?: boolean;
    className?: string;
}

/**
 * Note composer with @-mentions.
 * Type "@" and a few letters to open the list of people who can see this record, then pick with
 * the arrow keys and Enter, or by tapping. Ctrl or Cmd with Enter submits.
 */
export const MentionInput = ({
    users,
    location,
    authorId,
    value,
    onChange,
    onSubmit,
    placeholder = "Add a note. Type @ to mention someone",
    submitLabel = "Add note",
    isRequired,
    isDisabled,
    label,
    hint,
    rows = 2,
    autoFocus,
    className,
}: MentionInputProps) => {
    const id = useId();
    const fieldId = `${id}-field`;
    const listId = `${id}-list`;
    const hintId = `${id}-hint`;
    const optionId = (userId: string) => `${id}-option-${userId}`;

    const [state, setState] = useState<ComposerState>(() => fromTokens(value, users));
    const [synced, setSynced] = useState(value);
    const [caret, setCaret] = useState<number | null>(null);
    const [active, setActive] = useState(0);
    const [dismissedAt, setDismissedAt] = useState<number | null>(null);
    const [focused, setFocused] = useState(false);
    const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

    // The parent changed the value (cleared it after a submit, or loaded another draft).
    if (value !== synced) {
        setSynced(value);
        if (value !== toTokens(state)) {
            setState(fromTokens(value, users));
            setCaret(null);
        }
    }

    const fieldRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const markerRef = useRef<HTMLSpanElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const pendingCaret = useRef<number | null>(null);

    const { text, mentions } = state;
    const trigger = focused && !isDisabled ? findTrigger(text, caret, mentions) : null;
    const candidates = trigger ? mentionCandidates(users, trigger.query, { location, excludeId: authorId, limit: 6 }) : [];
    // "@mo" with nobody matching still says so; a longer phrase after an "@" is just text.
    const showNoMatch = Boolean(trigger) && candidates.length === 0 && !/\s/.test(trigger?.query ?? "");
    const isOpen = Boolean(trigger) && trigger?.at !== dismissedAt && (candidates.length > 0 || showNoMatch);
    const activeIndex = Math.min(active, Math.max(0, candidates.length - 1));
    const activeUser = isOpen ? candidates[activeIndex] : undefined;

    const commit = (next: ComposerState) => {
        setState(next);
        const tokens = toTokens(next);
        if (tokens !== value) onChange(tokens);
    };

    // Put the caret back after the composer rewrote the text (picking a person, removing a whole mention).
    useLayoutEffect(() => {
        const ta = textareaRef.current;
        if (ta && pendingCaret.current !== null) {
            ta.setSelectionRange(pendingCaret.current, pendingCaret.current);
            pendingCaret.current = null;
        }
    }, [text]);

    // Anchor the list at the "@" on wide screens. On a phone it sits under the field, full width (see classes).
    const triggerAt = isOpen ? (trigger?.at ?? null) : null;
    useLayoutEffect(() => {
        const field = fieldRef.current;
        const marker = markerRef.current;
        if (triggerAt === null || !field || !marker) return;
        const f = field.getBoundingClientRect();
        const m = marker.getBoundingClientRect();
        const left = Math.max(0, Math.min(m.left - f.left, f.width - 288));
        const top = m.bottom - f.top + 6;
        setAnchor((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
    }, [triggerAt, text]);

    // Keep the list on screen, above the on-screen keyboard.
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!isOpen || !list) return;
        const viewport = window.visualViewport;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const overflow = list.getBoundingClientRect().bottom + 8 - bottom;
        if (overflow > 0) window.scrollBy({ top: overflow, behavior: "smooth" });
    }, [isOpen, candidates.length]);

    const readCaret = (ta: HTMLTextAreaElement) => (ta.selectionStart === ta.selectionEnd ? ta.selectionStart : null);

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const ta = e.currentTarget;
        const result = applyEdit(state, ta.value, readCaret(ta));
        if (result.state.text !== ta.value) pendingCaret.current = result.caret;
        setCaret(result.caret);
        setActive(0);
        if (!findTrigger(result.state.text, result.caret, result.state.mentions)) setDismissedAt(null);
        commit(result.state);
    };

    const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>) => {
        const next = readCaret(e.currentTarget);
        if (next !== caret) setCaret(next);
    };

    const pick = (user: User) => {
        if (!trigger || caret === null) return;
        const before = text.slice(0, trigger.at);
        const after = text.slice(caret);
        const inserted = `@${user.name}${after.startsWith(" ") ? "" : " "}`;
        const shift = inserted.length - (caret - trigger.at);
        const nextCaret = trigger.at + user.name.length + 2;
        pendingCaret.current = nextCaret;
        setCaret(nextCaret);
        setActive(0);
        commit({
            text: before + inserted + after,
            mentions: [
                ...mentions.map((m) => (m.start >= caret ? { ...m, start: m.start + shift } : m)),
                { userId: user.id, name: user.name, start: trigger.at },
            ],
        });
        textareaRef.current?.focus();
    };

    /** The @ button: start a mention at the caret without hunting for the key on a phone keyboard. */
    const startMention = () => {
        const ta = textareaRef.current;
        if (!ta) return;
        const at = focused && caret !== null ? caret : text.length;
        const lead = at > 0 && !/\s/.test(text[at - 1] ?? "") ? " " : "";
        const result = applyEdit(state, `${text.slice(0, at)}${lead}@${text.slice(at)}`, at + lead.length + 1);
        pendingCaret.current = result.caret;
        setCaret(result.caret);
        setDismissedAt(null);
        setActive(0);
        commit(result.state);
        ta.focus();
    };

    const submit = () => {
        const tokens = toTokens(state);
        if (!onSubmit || !tokens.trim()) return;
        onSubmit(tokens);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
            return;
        }
        if (!isOpen) return;
        if (e.key === "Escape") {
            // Close the list only: without this an Escape would also close a dialog the composer sits in.
            e.preventDefault();
            e.stopPropagation();
            setDismissedAt(trigger?.at ?? null);
            return;
        }
        if (candidates.length === 0) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + candidates.length) % candidates.length);
        } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && activeUser) {
            e.preventDefault();
            pick(activeUser);
        }
    };

    // The same text behind the field: it sizes the field, tints tracked mentions, and marks where the "@" is.
    const backdrop: ReactNode[] = [];
    {
        let at = 0;
        const plain = (to: number) => {
            if (trigger && trigger.at >= at && trigger.at < to) {
                backdrop.push(text.slice(at, trigger.at), <span key="marker" ref={markerRef} />, text.slice(trigger.at, to));
            } else backdrop.push(text.slice(at, to));
            at = to;
        };
        for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
            plain(m.start);
            backdrop.push(
                <span key={`m-${m.start}`} className="rounded-sm bg-brand-secondary ring-2 ring-bg-brand-secondary">
                    {text.slice(m.start, end(m))}
                </span>,
            );
            at = end(m);
        }
        plain(text.length);
    }

    const notified = [...new Map(mentions.map((m) => [m.userId, m.name])).entries()];
    const empty = !text.trim();
    const type = "px-3.5 py-3 text-md break-words whitespace-pre-wrap";

    return (
        <div className={cx("flex w-full flex-col gap-2", className)}>
            {label && (
                <label htmlFor={fieldId} className="flex items-center gap-0.5 text-sm font-medium text-secondary">
                    {label}
                    {isRequired && (
                        <span aria-hidden="true" className="text-brand-tertiary">
                            *
                        </span>
                    )}
                </label>
            )}

            <div ref={fieldRef} className="relative">
                <div
                    className={cx(
                        "grid max-h-60 overflow-y-auto rounded-lg bg-primary shadow-xs ring-1 ring-primary transition duration-100 ease-linear ring-inset focus-within:ring-2 focus-within:ring-brand",
                        isDisabled && "cursor-not-allowed opacity-50",
                    )}
                >
                    <div
                        aria-hidden="true"
                        className={cx(type, "pointer-events-none col-start-1 row-start-1 text-transparent")}
                        style={{ minHeight: `calc(${rows} * 1.5rem + 1.5rem)` }}
                    >
                        {backdrop}
                        {"​"}
                    </div>
                    <textarea
                        ref={textareaRef}
                        id={fieldId}
                        value={text}
                        rows={1}
                        placeholder={placeholder}
                        disabled={isDisabled}
                        autoFocus={autoFocus}
                        required={isRequired}
                        aria-label={label ? undefined : placeholder}
                        aria-describedby={hintId}
                        aria-keyshortcuts={onSubmit ? "Control+Enter Meta+Enter" : undefined}
                        // Combobox semantics only while the list is open, as GitHub does for its @ menus.
                        role={isOpen ? "combobox" : undefined}
                        aria-haspopup={isOpen ? "listbox" : undefined}
                        aria-expanded={isOpen ? true : undefined}
                        aria-controls={isOpen ? listId : undefined}
                        aria-autocomplete={isOpen ? "list" : undefined}
                        aria-activedescendant={activeUser ? optionId(activeUser.id) : undefined}
                        enterKeyHint="enter"
                        autoCapitalize="sentences"
                        onChange={handleChange}
                        onSelect={handleSelect}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => {
                            setFocused(true);
                            // Unless the composer is about to place the caret itself (the @ button).
                            if (pendingCaret.current === null) setCaret(readCaret(e.currentTarget));
                        }}
                        onBlur={() => setFocused(false)}
                        className={cx(
                            type,
                            "col-start-1 row-start-1 size-full resize-none overflow-hidden bg-transparent text-primary outline-hidden placeholder:text-placeholder disabled:cursor-not-allowed",
                        )}
                    />
                </div>

                {isOpen && (
                    <div
                        ref={listRef}
                        style={{ "--mention-left": `${anchor?.left ?? 0}px`, "--mention-top": `${anchor?.top ?? 0}px` } as CSSProperties}
                        className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg bg-primary shadow-lg ring-1 ring-secondary_alt sm:top-(--mention-top) sm:right-auto sm:left-(--mention-left) sm:mt-0 sm:w-72"
                        // Keep focus (and the phone keyboard) in the field while a person is picked.
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <p className="border-b border-secondary px-3 py-2 text-xs font-medium text-tertiary">
                            {location ? "People who can see this record" : "People on the team"}
                        </p>
                        {candidates.length > 0 ? (
                            <ul id={listId} role="listbox" aria-label="People you can mention" className="max-h-72 overflow-y-auto py-1">
                                {candidates.map((u, i) => (
                                    <li
                                        key={u.id}
                                        id={optionId(u.id)}
                                        role="option"
                                        aria-selected={i === activeIndex}
                                        onMouseMove={() => i !== activeIndex && setActive(i)}
                                        onClick={() => pick(u)}
                                        className={cx(
                                            "flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 select-none",
                                            i === activeIndex && "bg-active",
                                        )}
                                    >
                                        <Avatar size="sm" initials={initials(u.name)} />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="truncate text-sm font-semibold text-primary">{u.name}</span>
                                            <span className="truncate text-xs text-tertiary">{ROLE_LABEL[u.role]}</span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p id={listId} role="listbox" aria-label="People you can mention" className="px-3 py-3 text-sm text-tertiary">
                                Nobody here matches &ldquo;{trigger?.query}&rdquo;.
                            </p>
                        )}
                    </div>
                )}
            </div>

            <p className="sr-only" role="status">
                {isOpen
                    ? candidates.length > 0
                        ? `${candidates.length} ${candidates.length === 1 ? "person" : "people"} to mention. Use the up and down arrows, then Enter.`
                        : "Nobody matches."
                    : ""}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div id={hintId} aria-live="polite" className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-tertiary">
                    {notified.length > 0 ? (
                        <>
                            <span className="font-medium text-secondary">Will notify:</span>
                            {notified.map(([userId, name]) => (
                                <span
                                    key={userId}
                                    data-notify={userId}
                                    className="inline-flex items-center rounded-full bg-brand-primary_alt px-2 py-0.5 text-xs font-medium text-brand-secondary ring-1 ring-brand ring-inset"
                                >
                                    {name}
                                </span>
                            ))}
                        </>
                    ) : (
                        <span>{hint ?? "Type @ to mention someone. Only people who can see this record are offered."}</span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end">
                    <button
                        type="button"
                        aria-label="Mention someone"
                        disabled={isDisabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={startMention}
                        className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:size-9"
                    >
                        <AtSign className="size-5" aria-hidden="true" />
                    </button>
                    {onSubmit && (
                        <Button color="secondary" size="md" isDisabled={isDisabled || empty} onClick={submit} className="max-sm:min-h-11">
                            {submitLabel}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
