/** Wording for movement reasons. One list, so the ledger, activity log, flags and adjust dialog all say the same thing. */
import type { ReasonCode } from "@/data/types";

export const REASON_LABEL: Record<ReasonCode, string> = {
    "used-in-service": "Used in service",
    damaged: "Damaged or spilled",
    expired: "Expired or dried out",
    lost: "Lost",
    "suspected-theft": "Suspected theft",
    "sample-or-gift": "Given to a client or promo",
    "returned-to-vendor": "Returned to vendor",
    transfer: "Moved between locations",
    correction: "Count correction",
    "cycle-count": "Cycle count",
    "received-order": "Received order",
};

export const REASON_CODES = Object.keys(REASON_LABEL) as ReasonCode[];

/** Reasons that always need a note, whatever the quantity. */
export const REASONS_NEEDING_NOTE: ReasonCode[] = ["lost", "suspected-theft"];
