"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle, Copy01, InfoCircle, Mail01, Paperclip, Plus, RefreshCcw01, Send01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import type { PurchaseOrder, User, Vendor } from "@/data/types";
import { MAILTO_LIMIT, draftOrderEmail, sendOptions } from "@/engine/order-send";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";

/** How the email left: through the app (Resend) or from the person's own mail app. */
export type EmailSentMethod = "resend" | "mail-app";

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const isEmail = (v: string) => EMAIL.test(v.trim());
const splitList = (v: string) =>
    v
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);
/** The sample data uses reserved example.com addresses, which can never be a real vendor. */
const isPlaceholder = (v: string) => /[@.]example\.(com|org|net)$/i.test(v.trim());

const fitHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
};

interface OrderEmailDraftProps {
    po: PurchaseOrder;
    vendor: Vendor;
    /** As it should read in the email: "Meraki Lynnfield". */
    locationName: string;
    /** The person sending. Replies go to their address. */
    sender: Pick<User, "name" | "email">;
    /** Called once the order counts as sent by email. */
    onSent?: (method: EmailSentMethod) => void;
    className?: string;
}

/**
 * Editable purchase-order email for one vendor.
 * The text comes from `draftOrderEmail` and keeps following the "Needed by" date and the note
 * until the person edits it by hand. Prices are left out on purpose: see engine/order-send.ts.
 */
export const OrderEmailDraft = ({ po, vendor, locationName, sender, onSent, className }: OrderEmailDraftProps) => {
    const [to, setTo] = useState(vendor.orderEmail ?? "");
    const [cc, setCc] = useState("");
    const [showCc, setShowCc] = useState(false);
    const [neededBy, setNeededBy] = useState("");
    const [note, setNote] = useState("");
    /** Hand edits. While both are null the subject and body are regenerated from the fields above. */
    const [subjectEdit, setSubjectEdit] = useState<string | null>(null);
    const [bodyEdit, setBodyEdit] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    const [result, setResult] = useState<"resend" | "mail-app-opened" | "mail-app" | null>(null);
    const { copied, copy } = useClipboard();
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    const generated = draftOrderEmail({
        po,
        vendor: { ...vendor, orderEmail: to.trim() || undefined },
        locationName,
        senderName: sender.name,
        senderEmail: sender.email,
        neededBy: neededBy || undefined,
        note: note.trim() || undefined,
    });
    const subject = subjectEdit ?? generated.subject;
    const body = bodyEdit ?? generated.body;
    const bodyEdited = bodyEdit !== null;
    const edited = bodyEdited || subjectEdit !== null;

    const ccList = splitList(cc);
    const toMissing = to.trim() === "";
    const toInvalid = !toMissing && !isEmail(to);
    const ccInvalid = ccList.some((a) => !isEmail(a));
    const bodyMissing = body.trim() === "";
    const noEmailNote = sendOptions(vendor).find((o) => o.method === "email")?.note;

    // The engine's link covers the generated text. Once the text is hand-edited or a Cc is added, build the same link from what is on screen.
    const customLink = `mailto:${encodeURIComponent(to.trim())}?${ccList.length ? `cc=${encodeURIComponent(ccList.join(","))}&` : ""}subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailto = edited || ccList.length ? (customLink.length <= MAILTO_LIMIT ? customLink : undefined) : generated.mailto;

    // Grow the message box to fit its text, and again when its width changes (rotation, or a hidden panel being shown).
    useEffect(() => fitHeight(bodyRef.current), [body]);
    useEffect(() => {
        const el = bodyRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let width = el.clientWidth;
        const observer = new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            fitHeight(el);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const send = () => {
        setTried(true);
        if (toMissing || toInvalid || ccInvalid || bodyMissing) return;
        setResult("resend");
        onSent?.("resend");
    };

    const toHint =
        toInvalid || (tried && toMissing)
            ? toMissing
                ? "Type the address this order goes to."
                : "That does not look like an email address."
            : toMissing
              ? noEmailNote
              : isPlaceholder(to)
                ? "Placeholder address from the sample data, not a real vendor contact."
                : undefined;

    return (
        <div className={cx("flex flex-col gap-4", className)}>
            <div className="flex flex-col gap-3">
                <Input
                    label="To"
                    type="email"
                    size="md"
                    placeholder="orders@vendor.com"
                    value={to}
                    onChange={setTo}
                    isInvalid={toInvalid || (tried && toMissing)}
                    hint={toHint}
                />
                {showCc ? (
                    <Input
                        label="Cc"
                        size="md"
                        placeholder="Optional. Separate addresses with a comma."
                        value={cc}
                        onChange={setCc}
                        isInvalid={ccInvalid}
                        hint={ccInvalid ? "One of these is not an email address." : undefined}
                    />
                ) : (
                    <Button color="link-color" size="sm" iconLeading={Plus} className="self-start max-lg:min-h-11" onClick={() => setShowCc(true)}>
                        Add Cc
                    </Button>
                )}
                <Input label="Subject" size="md" value={subject} onChange={setSubjectEdit} />
            </div>

            <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                <Input label="Needed by (optional)" type="date" size="md" value={neededBy} onChange={setNeededBy} isDisabled={bodyEdited} />
                <Input
                    label="Note to the vendor (optional)"
                    size="md"
                    placeholder="One line, for example: please deliver before 10 AM"
                    value={note}
                    onChange={setNote}
                    isDisabled={bodyEdited}
                />
            </div>
            {edited && (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-secondary px-3 py-2">
                    <p className="text-sm text-tertiary">
                        {bodyEdited ? "You have edited the message, so the date and note no longer change it." : "You have edited the subject."}
                    </p>
                    <Button
                        color="link-color"
                        size="sm"
                        iconLeading={RefreshCcw01}
                        className="max-lg:min-h-11"
                        onClick={() => {
                            setSubjectEdit(null);
                            setBodyEdit(null);
                        }}
                    >
                        Reset to generated draft
                    </Button>
                </div>
            )}

            <TextArea
                label="Message"
                size="md"
                rows={Math.max(8, body.split("\n").length)}
                value={body}
                onChange={setBodyEdit}
                textAreaRef={bodyRef}
                textAreaClassName="resize-none overflow-hidden font-mono leading-6 lg:text-sm lg:leading-6"
                isInvalid={tried && bodyMissing}
                hint={tried && bodyMissing ? "The message is empty." : undefined}
            />

            <div className="flex flex-col gap-2 text-sm">
                <p className="text-secondary">
                    <span className="font-semibold text-primary tabular-nums">
                        {generated.lineCount} line{generated.lineCount === 1 ? "" : "s"}, {generated.unitCount} unit{generated.unitCount === 1 ? "" : "s"}
                    </span>{" "}
                    on {po.number}. No prices are included: the vendor&apos;s reply and invoice are the record of price.
                </p>
                {generated.replyTo && <p className="text-tertiary">Replies go to {generated.replyTo}.</p>}
                <p className="flex flex-wrap items-center gap-2 text-tertiary">
                    <Paperclip className="size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                    Attach the order as a PDF
                    <Badge type="color" color="gray" size="sm">
                        Planned
                    </Badge>
                </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button color="primary" size="md" iconLeading={Send01} onClick={send}>
                    Send with Resend
                </Button>
                {mailto ? (
                    <Button href={mailto} color="secondary" size="md" iconLeading={Mail01} onClick={() => setResult((r) => r ?? "mail-app-opened")}>
                        Open in my mail app
                    </Button>
                ) : (
                    <Button color="secondary" size="md" iconLeading={Mail01} isDisabled>
                        Open in my mail app
                    </Button>
                )}
                <Button
                    color={mailto ? "tertiary" : "secondary"}
                    size="md"
                    iconLeading={copied === "email" ? Check : Copy01}
                    onClick={() => copy(`${subject}\n\n${body}`, "email")}
                >
                    {copied === "email" ? "Copied" : "Copy subject and message"}
                </Button>
            </div>

            {!mailto && (
                <p className="flex items-start gap-2 text-sm text-tertiary">
                    <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                    This order is too long to hand to a mail app as a link. Copy the subject and message and paste them into a new email instead.
                </p>
            )}

            {result === "resend" && (
                <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg bg-success-primary px-3 py-2.5 text-sm text-secondary ring-1 ring-utility-green-200 ring-inset"
                >
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    <span>
                        <span className="font-semibold">Marked as sent.</span> Nothing was emailed from the prototype: Resend is not connected.
                    </span>
                </p>
            )}
            {result === "mail-app-opened" && (
                <div
                    role="status"
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-secondary px-3 py-2.5 ring-1 ring-secondary ring-inset"
                >
                    <p className="text-sm text-secondary">Opened as a draft in your mail app. Send it from there, then mark this order as sent.</p>
                    <Button
                        color="secondary"
                        size="sm"
                        className="max-lg:min-h-11"
                        iconLeading={Check}
                        onClick={() => {
                            setResult("mail-app");
                            onSent?.("mail-app");
                        }}
                    >
                        I sent it
                    </Button>
                </div>
            )}
            {result === "mail-app" && (
                <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg bg-success-primary px-3 py-2.5 text-sm text-secondary ring-1 ring-utility-green-200 ring-inset"
                >
                    <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
                    <span>
                        <span className="font-semibold">Marked as sent</span> from your own mail app.
                    </span>
                </p>
            )}
        </div>
    );
};
