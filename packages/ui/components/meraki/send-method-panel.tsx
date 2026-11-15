"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Check, CheckCircle, Copy01, InfoCircle, LinkExternal01, Mail01, Send01, UserPlus01 } from "@untitledui/icons";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { locations } from "@/data/inventory";
import type { PurchaseOrder, PurchaseOrderLine, Task, User, Vendor } from "@/data/types";
import type { SendMethod, SendOption } from "@/engine/order-send";
import { cartLink, draftPickList, sendOptions } from "@/engine/order-send";
import { useClipboard } from "@/hooks/use-clipboard";
import { cx } from "@/utils/cx";
import { AssignPickupDialog } from "./assign-pickup-dialog";
import { OrderEmailDraft } from "./order-email-draft";
import { PickList } from "./pick-list";
import { SendOptionList } from "./send-option-list";

/** How an order actually went out. Wider than SendMethod: orders are also phoned in or placed on a website by hand. */
export type SentVia = "resend" | "mail-app" | "cart" | "website" | "in-store" | "phone" | "transfer";

export const SENT_VIA_LABEL: Record<SentVia, string> = {
    resend: "Email",
    "mail-app": "Email from own mail app",
    cart: "Pre-filled cart",
    website: "Vendor website",
    "in-store": "In person",
    phone: "By phone",
    transfer: "Transfer request",
};

/** No item carries a store product link yet, so every line is reported as missing from a cart. */
const noVariants = () => undefined;

const SHOWN = 5;

const LineNames = ({ lines }: { lines: PurchaseOrderLine[] }) => (
    <ul className="flex flex-col gap-1 text-sm text-secondary">
        {lines.slice(0, SHOWN).map((l) => (
            <li key={l.id} className="flex gap-2">
                <span className="w-8 shrink-0 text-right font-medium text-primary tabular-nums">{l.qtyOrdered} ×</span>
                <span className="min-w-0">{l.name}</span>
            </li>
        ))}
        {lines.length > SHOWN && <li className="pl-10 text-tertiary">and {lines.length - SHOWN} more</li>}
    </ul>
);

/** A way of sending that exists for this vendor but cannot be used yet, with what it would take. */
const NotReady = ({ title, badge, children }: { title: string; badge: string; children: ReactNode }) => (
    <section className="flex flex-col gap-3 rounded-xl bg-warning-primary p-4 ring-1 ring-utility-yellow-200 ring-inset">
        <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-primary">{title}</h3>
            <Badge type="color" color="warning" size="sm">
                {badge}
            </Badge>
        </div>
        {children}
    </section>
);

const Confirmation = ({ children }: { children: ReactNode }) => (
    <p
        role="status"
        className="flex items-start gap-2 rounded-lg bg-success-primary px-3 py-2.5 text-sm text-secondary ring-1 ring-utility-green-200 ring-inset"
    >
        <CheckCircle className="mt-0.5 size-4 shrink-0 text-fg-success-primary" aria-hidden="true" />
        <span>{children}</span>
    </p>
);

interface SendMethodPanelProps {
    po: PurchaseOrder;
    vendor: Vendor;
    /** The person sending. Their name signs the email and replies go to their address. */
    sender: Pick<User, "name" | "email">;
    /** The chosen way of sending. Start from `bestSendOption(vendor).method`. */
    method: SendMethod;
    onMethodChange: (method: SendMethod) => void;
    /** Called when the order counts as sent, with how it went out. */
    onSent?: (via: SentVia) => void;
    /** The store's product (Shopify variant) id for a line, once product links are saved. None are yet. */
    variantIdFor?: (line: PurchaseOrderLine) => string | undefined;
    /** The full person sending the order. When given, a pick list can be handed to someone as a pickup run. */
    asker?: User;
    /** Called when a pickup run is assigned from the pick list. */
    onAssignPickup?: (task: Task) => void;
    className?: string;
}

/**
 * Everything needed to get one order to its vendor: the choice of method, what is not connected
 * yet and why, and the working panel for the chosen method (email draft, pick list, cart link or
 * transfer request). Used on the Send orders screen and on an approved order's own page.
 */
export const SendMethodPanel = ({
    po,
    vendor,
    sender,
    method,
    onMethodChange,
    onSent,
    variantIdFor = noVariants,
    asker,
    onAssignPickup,
    className,
}: SendMethodPanelProps) => {
    const [pickupOpen, setPickupOpen] = useState(false);
    const [pickup, setPickup] = useState<Task>();
    /** Panels that have been opened stay mounted, hidden, so an edited email or a half-ticked pick list survives a change of method. */
    const [seen, setSeen] = useState<SendMethod[]>([method]);
    if (!seen.includes(method)) setSeen([...seen, method]);
    const [transferNote, setTransferNote] = useState("");
    const [transferSent, setTransferSent] = useState(false);
    const { copied, copy } = useClipboard();

    const options = sendOptions(vendor);
    const notReady = options.filter((o) => !o.available);
    const place = locations.find((l) => l.id === po.locationId)?.name ?? po.locationId;
    const ordered = po.lines.filter((l) => l.qtyOrdered > 0);
    const units = ordered.reduce((n, l) => n + l.qtyOrdered, 0);
    const cart = cartLink(po, vendor, variantIdFor);
    const transferText = `${draftPickList(po, vendor, place)}${transferNote.trim() ? `\n\n${transferNote.trim()}` : ""}`;

    const notReadyCard = (o: SendOption) => {
        if (o.method === "api") {
            return (
                <NotReady key={o.method} title={`Ordering from ${vendor.name} inside the app`} badge="Not connected">
                    <p className="text-sm text-secondary">
                        {o.note} It also needs an Amazon Business account with a supported payment method. Neither is confirmed yet, so nothing is sent to{" "}
                        {vendor.name} from here.
                    </p>
                    <p className="text-sm text-secondary">
                        Until then, email the order to whoever places it, or place it on {vendor.name} by hand and use &ldquo;Mark as sent&rdquo;.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {method !== "email" && (
                            <Button color="secondary" size="md" iconLeading={Mail01} onClick={() => onMethodChange("email")}>
                                Use the email draft
                            </Button>
                        )}
                        <Button
                            href={vendor.storeUrl ?? "https://www.amazon.com/"}
                            target="_blank"
                            rel="noreferrer"
                            color="secondary"
                            size="md"
                            iconTrailing={LinkExternal01}
                        >
                            Open {vendor.name}
                        </Button>
                    </div>
                </NotReady>
            );
        }
        if (o.method === "cart-link") {
            return (
                <NotReady key={o.method} title={`Pre-filled cart at ${vendor.name}`} badge="Not set up yet">
                    <p className="text-sm text-secondary">{o.note}</p>
                    <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium text-primary">What is needed</p>
                        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-secondary">
                            <li>The address of {vendor.name}&apos;s professional store.</li>
                            <li>
                                A product link for each item. {cart.missing.length} of {ordered.length} line{ordered.length === 1 ? "" : "s"} on this order{" "}
                                {cart.missing.length === 1 ? "has" : "have"} none.
                            </li>
                            <li>
                                A test with Meraki&apos;s own login. Two things are unconfirmed: that the cart keeps its contents through sign-in, and that
                                wholesale pricing applies to a cart opened by link.
                            </li>
                        </ol>
                    </div>
                    {cart.missing.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium text-primary">Lines that would not be in the cart today</p>
                            <LineNames lines={cart.missing} />
                        </div>
                    )}
                    <p className="text-sm text-secondary">Until then this order goes by email.</p>
                </NotReady>
            );
        }
        return null;
    };

    return (
        <div className={cx("flex flex-col gap-5", className)}>
            <SendOptionList vendor={vendor} value={method} onChange={onMethodChange} />

            {notReady.map(notReadyCard)}

            {seen.includes("email") && (
                <section hidden={method !== "email"} className="flex flex-col gap-4 border-t border-secondary pt-5">
                    <h3 className="text-md font-semibold text-primary">Email to {vendor.name}</h3>
                    <OrderEmailDraft po={po} vendor={vendor} locationName={place} sender={sender} onSent={onSent} />
                </section>
            )}

            {seen.includes("pick-list") && (
                <section hidden={method !== "pick-list"} className="flex flex-col gap-4 border-t border-secondary pt-5">
                    <PickList po={po} vendor={vendor} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {asker && (
                            <Button color="secondary" size="md" iconLeading={UserPlus01} onClick={() => setPickupOpen(true)}>
                                Send someone to pick this up
                            </Button>
                        )}
                        <Button color={asker ? "secondary" : "primary"} size="md" iconLeading={Check} onClick={() => onSent?.("in-store")}>
                            Mark as placed in person
                        </Button>
                        <p className="text-sm text-tertiary">Use this once the run is done, so receiving can start.</p>
                    </div>
                    {pickup && (
                        <p className="flex items-start gap-2 rounded-lg bg-success-primary px-3 py-2 text-sm text-success-primary ring-1 ring-utility-green-200 ring-inset">
                            <CheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                            <span>
                                Pickup run assigned. It is on their Tasks list with this pick list. Nothing is sent from the prototype.{" "}
                                <a href="/tasks" className="font-semibold underline underline-offset-2">
                                    Open tasks
                                </a>
                            </span>
                        </p>
                    )}
                    {asker && (
                        <AssignPickupDialog
                            orders={[po]}
                            vendor={vendor}
                            location={po.locationId}
                            user={asker}
                            isOpen={pickupOpen}
                            onOpenChange={setPickupOpen}
                            onAssign={(task) => {
                                setPickup(task);
                                onAssignPickup?.(task);
                            }}
                        />
                    )}
                </section>
            )}

            {method === "cart-link" && (
                <section className="flex flex-col gap-4 border-t border-secondary pt-5">
                    <h3 className="text-md font-semibold text-primary">Pre-filled cart at {vendor.name}</h3>
                    {cart.url ? (
                        <>
                            <p className="text-sm text-secondary">
                                {cart.included.length} of {ordered.length} line{ordered.length === 1 ? "" : "s"} will be in the cart. Log in, check the
                                quantities and pay on {vendor.name}&apos;s site.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Button href={cart.url} target="_blank" rel="noreferrer" color="primary" size="md" iconTrailing={LinkExternal01}>
                                    Open pre-filled cart
                                </Button>
                                <Button color="secondary" size="md" iconLeading={Check} onClick={() => onSent?.("cart")}>
                                    Mark as placed
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-secondary">
                            None of these items has a product link saved yet, so there is nothing to put in a cart. Add each item&apos;s product link in
                            Settings, Vendors.
                        </p>
                    )}
                    {cart.missing.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium text-primary">
                                {cart.url ? "Not in the cart: add these by hand" : "Lines that would not be in the cart"}
                            </p>
                            <LineNames lines={cart.missing} />
                        </div>
                    )}
                    <p className="flex items-start gap-2 text-sm text-tertiary">
                        <InfoCircle className="mt-0.5 size-4 shrink-0 text-fg-quaternary" aria-hidden="true" />
                        Unconfirmed: that wholesale pricing applies to a cart opened by link. Check the prices in the cart before paying.
                    </p>
                </section>
            )}

            {method === "transfer" && (
                <section className="flex flex-col gap-4 border-t border-secondary pt-5">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-md font-semibold text-primary">Transfer request</h3>
                        <p className="text-sm text-secondary">
                            Asks the {vendor.name} to move {ordered.length} line{ordered.length === 1 ? "" : "s"} ({units} unit{units === 1 ? "" : "s"}) to{" "}
                            {place}. Nothing is bought.
                        </p>
                    </div>
                    <LineNames lines={ordered} />
                    <Input
                        label="Note for the warehouse (optional)"
                        size="md"
                        placeholder="For example: needed before Saturday"
                        value={transferNote}
                        onChange={setTransferNote}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button
                            color="primary"
                            size="md"
                            iconLeading={Send01}
                            onClick={() => {
                                setTransferSent(true);
                                onSent?.("transfer");
                            }}
                        >
                            Send transfer request
                        </Button>
                        <Button color="tertiary" size="md" iconLeading={copied === "transfer" ? Check : Copy01} onClick={() => copy(transferText, "transfer")}>
                            {copied === "transfer" ? "Copied" : "Copy request"}
                        </Button>
                    </div>
                    {transferSent && (
                        <Confirmation>
                            <span className="font-semibold">Marked as requested.</span> Nothing was sent from the prototype: the warehouse is not notified.
                        </Confirmation>
                    )}
                </section>
            )}
        </div>
    );
};
