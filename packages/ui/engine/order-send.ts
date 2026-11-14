/**
 * Sending an order to a vendor.
 *
 * Only Amazon Business offers an ordering API (and only after approval). Every other vendor is
 * reached one of three ways, so the app prepares the order and a person sends it:
 *   - an emailed purchase order (works for every vendor)
 *   - a pre-filled cart on the vendor's Shopify store
 *   - a pick list for an in-store run
 *
 * These are pure functions so the same text is used on screen, in the email sent through Resend,
 * and in a `mailto:` link. See docs/research/03-wholesale-and-product-data.md.
 */
import type { PurchaseOrder, PurchaseOrderLine, Vendor } from "@/data/types";
import { formatDate } from "./dates";

export type SendMethod = "email" | "cart-link" | "pick-list" | "api" | "transfer";

export interface SendOption {
    method: SendMethod;
    label: string;
    description: string;
    /** False when the vendor record is missing what this method needs, or it is not built yet. */
    available: boolean;
    /** Why it is unavailable, or a caveat to show beside it. */
    note?: string;
}

/** The ways this vendor can be sent an order, best first. Email is always offered as the fallback. */
export const sendOptions = (vendor: Vendor): SendOption[] => {
    const options: SendOption[] = [];
    if (vendor.channel === "internal") {
        options.push({ method: "transfer", label: "Request a transfer", description: "Ask the warehouse to move stock to this location.", available: true });
    }
    if (vendor.channel === "api") {
        options.push({
            method: "api",
            label: "Place through the vendor's API",
            description: "Sends the order straight from the app.",
            available: false,
            note: "Needs Amazon Business API approval. Not connected.",
        });
    }
    if (vendor.supportsCartLink) {
        options.push({
            method: "cart-link",
            label: "Open a pre-filled cart",
            description: `Opens ${vendor.name}'s store with these quantities in the cart. You log in, check it and pay.`,
            available: Boolean(vendor.storeUrl),
            note: vendor.storeUrl
                ? "To confirm with your account: that wholesale pricing still applies to a cart opened this way."
                : "Add the store address and each item's product link in Settings, Vendors.",
        });
    }
    if (vendor.channel === "in-store") {
        options.push({ method: "pick-list", label: "Print a pick list", description: "A checklist for the in-store run, in shelf order.", available: true });
    }
    options.push({
        method: "email",
        label: "Email a purchase order",
        description: vendor.orderEmail ? `Sends the order to ${vendor.orderEmail}.` : "Drafts the order as an email.",
        available: true,
        note: vendor.orderEmail ? undefined : "No order email on file for this vendor. Add one in Settings, Vendors, or type it in the draft.",
    });
    return options;
};

export interface OrderEmailInput {
    po: PurchaseOrder;
    vendor: Vendor;
    /** "Meraki Lynnfield" */
    locationName: string;
    senderName: string;
    senderEmail?: string;
    /** ISO date the goods are needed by. */
    neededBy?: string;
    /** Extra sentence from the person sending. */
    note?: string;
}

export interface OrderEmailDraft {
    to?: string;
    replyTo?: string;
    subject: string;
    /** Plain text. The Resend template renders the same lines as a table. */
    body: string;
    lineCount: number;
    unitCount: number;
    /** `mailto:` link that opens the draft in the person's own mail app. Undefined if it would be too long. */
    mailto?: string;
}

const orderable = (po: PurchaseOrder) => po.lines.filter((l) => l.qtyOrdered > 0);

const lineText = (l: PurchaseOrderLine) => {
    const detail = [l.sku && `SKU ${l.sku}`, l.colorCode && `code ${l.colorCode}`, l.variant].filter(Boolean).join(", ");
    return `${String(l.qtyOrdered).padStart(3)} x  ${l.name}${detail ? ` (${detail})` : ""}`;
};

/** Most mail apps and browsers cope with about this many characters in a mailto link. */
export const MAILTO_LIMIT = 1900;

/**
 * Draft the purchase-order email for one vendor.
 * No prices are included: the workbooks hold none, and the vendor's invoice is the record of price.
 */
export const draftOrderEmail = ({ po, vendor, locationName, senderName, senderEmail, neededBy, note }: OrderEmailInput): OrderEmailDraft => {
    const lines = orderable(po);
    const unitCount = lines.reduce((n, l) => n + l.qtyOrdered, 0);
    const subject = `Order ${po.number} from Meraki Spa, ${locationName.replace(/^Meraki /, "")}`;
    const body = [
        `Hello${vendor.contact ? ` ${vendor.contact}` : ""},`,
        "",
        `Please place the following order for ${locationName}.`,
        "",
        `Order number: ${po.number}`,
        `Order date: ${formatDate(po.createdAt, true)}`,
        ...(neededBy ? [`Needed by: ${formatDate(neededBy, true)}`] : []),
        ...(vendor.accountNumber ? [`Account: ${vendor.accountNumber}`] : []),
        "",
        ...lines.map(lineText),
        "",
        `${lines.length} line${lines.length === 1 ? "" : "s"}, ${unitCount} unit${unitCount === 1 ? "" : "s"} in total.`,
        "",
        "Please reply to confirm what is in stock, the price and the expected delivery date. If anything is unavailable, tell us before substituting.",
        ...(note ? ["", note] : []),
        "",
        "Thank you,",
        senderName,
        locationName,
    ].join("\n");

    const link = `mailto:${encodeURIComponent(vendor.orderEmail ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return {
        to: vendor.orderEmail,
        replyTo: senderEmail,
        subject,
        body,
        lineCount: lines.length,
        unitCount,
        mailto: link.length <= MAILTO_LIMIT ? link : undefined,
    };
};

/** Pick list for an in-store run: one line per item with a box to tick. */
export const draftPickList = (po: PurchaseOrder, vendor: Vendor, locationName: string) =>
    [
        `${vendor.name} pick list, ${locationName}`,
        `${po.number}, ${formatDate(po.createdAt, true)}`,
        "",
        ...orderable(po).map((l) => `[ ] ${lineText(l).trim()}`),
    ].join("\n");

/**
 * Shopify cart permalink: https://<store>/cart/<variantId>:<qty>,<variantId>:<qty>
 * Lines without a variant id cannot go in the link and are returned so the screen can list them.
 */
export const cartLink = (po: PurchaseOrder, vendor: Vendor, variantIdFor: (line: PurchaseOrderLine) => string | undefined) => {
    const included: PurchaseOrderLine[] = [];
    const missing: PurchaseOrderLine[] = [];
    const parts: string[] = [];
    for (const line of orderable(po)) {
        const variant = variantIdFor(line);
        if (variant) {
            parts.push(`${variant}:${line.qtyOrdered}`);
            included.push(line);
        } else missing.push(line);
    }
    const url = vendor.storeUrl && parts.length ? `${vendor.storeUrl.replace(/\/+$/, "")}/cart/${parts.join(",")}` : undefined;
    return { url, included, missing };
};

/** Orders that are ready to go out for a location: approved, or drafts for vendors that need no approval step. */
export const ordersToSend = (orders: PurchaseOrder[], locationId: PurchaseOrder["locationId"]) =>
    orders.filter((po) => po.locationId === locationId && (po.status === "approved" || po.status === "draft" || po.status === "awaiting-approval"));
