/** Display names for codes used across screens. One place, so a list and its detail page never disagree. */
import type { OrderChannel, PolishLine } from "@/data/types";

export const POLISH_LINE_LABEL: Record<PolishLine, string> = {
    opi: "OPI",
    "opi-dip": "OPI dip",
    dnd: "DND",
    "dazzle-dry": "Dazzle Dry",
    chisel: "Chisel",
    "apres-gel-x": "Aprés Gel-X",
};

/** How an order reaches its vendor. */
export const ORDER_CHANNEL_LABEL: Record<OrderChannel, string> = {
    "email-po": "Emailed purchase order",
    api: "Sent by API",
    portal: "Vendor portal",
    "in-store": "Bought in person",
    internal: "Internal transfer",
};
