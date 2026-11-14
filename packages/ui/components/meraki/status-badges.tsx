import { Badge, BadgeWithDot } from "@/components/base/badges/badges";
import { ROLE_LABEL } from "@/data/inventory";
import type { AbcClass, CountStatus, FlagSeverity, FlagStatus, ForecastConfidence, PurchaseOrderStatus, Role, StockStatus } from "@/data/types";
import { STATUS_COLOR, STATUS_LABEL } from "@/engine/stock";

type Size = "sm" | "md" | "lg";

/** In stock / Low / Out. The same rule everywhere: see engine/stock.ts. */
export const StockStatusBadge = ({ status, size = "sm" }: { status: StockStatus; size?: Size }) => (
    <BadgeWithDot type="pill-color" color={STATUS_COLOR[status]} size={size}>
        {STATUS_LABEL[status]}
    </BadgeWithDot>
);

const SEVERITY: Record<FlagSeverity, { label: string; color: "error" | "warning" | "gray" }> = {
    high: { label: "High", color: "error" },
    medium: { label: "Medium", color: "warning" },
    low: { label: "Low", color: "gray" },
};

export const FlagSeverityBadge = ({ severity, size = "sm" }: { severity: FlagSeverity; size?: Size }) => (
    <BadgeWithDot type="pill-color" color={SEVERITY[severity].color} size={size}>
        {SEVERITY[severity].label}
    </BadgeWithDot>
);

const FLAG_STATUS: Record<FlagStatus, { label: string; color: "error" | "warning" | "success" | "gray" | "blue" }> = {
    open: { label: "Open", color: "error" },
    reviewing: { label: "Reviewing", color: "blue" },
    resolved: { label: "Resolved", color: "success" },
    dismissed: { label: "Dismissed", color: "gray" },
};

export const FlagStatusBadge = ({ status, size = "sm" }: { status: FlagStatus; size?: Size }) => (
    <Badge type="color" color={FLAG_STATUS[status].color} size={size}>
        {FLAG_STATUS[status].label}
    </Badge>
);

export const ORDER_STATUS: Record<PurchaseOrderStatus, { label: string; color: "gray" | "warning" | "blue" | "brand" | "success" | "error" }> = {
    draft: { label: "Draft", color: "gray" },
    "awaiting-approval": { label: "Awaiting approval", color: "warning" },
    approved: { label: "Approved", color: "blue" },
    sent: { label: "Sent", color: "brand" },
    "partially-received": { label: "Partially received", color: "warning" },
    received: { label: "Received", color: "success" },
    cancelled: { label: "Cancelled", color: "error" },
};

export const OrderStatusBadge = ({ status, size = "sm" }: { status: PurchaseOrderStatus; size?: Size }) => (
    <BadgeWithDot type="pill-color" color={ORDER_STATUS[status].color} size={size}>
        {ORDER_STATUS[status].label}
    </BadgeWithDot>
);

export const COUNT_STATUS: Record<CountStatus, { label: string; color: "gray" | "blue" | "warning" | "success" }> = {
    scheduled: { label: "Scheduled", color: "gray" },
    "in-progress": { label: "In progress", color: "blue" },
    submitted: { label: "Needs review", color: "warning" },
    approved: { label: "Approved", color: "success" },
};

export const CountStatusBadge = ({ status, size = "sm" }: { status: CountStatus; size?: Size }) => (
    <BadgeWithDot type="pill-color" color={COUNT_STATUS[status].color} size={size}>
        {COUNT_STATUS[status].label}
    </BadgeWithDot>
);

const CONFIDENCE: Record<ForecastConfidence, { label: string; color: "success" | "warning" | "gray"; description: string }> = {
    high: { label: "High confidence", color: "success", description: "Three or more order cycles of history." },
    medium: { label: "Medium confidence", color: "warning", description: "Two order cycles of history." },
    low: { label: "Low confidence", color: "gray", description: "One order cycle, or borrowed from the other location." },
    none: { label: "No forecast", color: "gray", description: "No order history yet. Uses the par level." },
};

export const CONFIDENCE_DESCRIPTION = Object.fromEntries(Object.entries(CONFIDENCE).map(([k, v]) => [k, v.description])) as Record<ForecastConfidence, string>;

/** How much history a forecast rests on. Shown beside every forecast number. */
export const ConfidenceBadge = ({ confidence, size = "sm" }: { confidence: ForecastConfidence; size?: Size }) => (
    <Badge type="pill-color" color={CONFIDENCE[confidence].color} size={size}>
        {CONFIDENCE[confidence].label}
    </Badge>
);

const ABC_HINT: Record<AbcClass, string> = { A: "Count weekly", B: "Count monthly", C: "Count quarterly" };

/** ABC class: A items carry most of the spend and get counted most often. */
export const AbcBadge = ({ abc, size = "sm", showHint }: { abc: AbcClass; size?: Size; showHint?: boolean }) => (
    <Badge type="modern" color="gray" size={size}>
        {abc}
        {showHint ? ` · ${ABC_HINT[abc]}` : ""}
    </Badge>
);

/** Marks a number as a placeholder, not a real count or cost. */
export const SampleBadge = ({ size = "sm", label = "Sample" }: { size?: Size; label?: string }) => (
    <Badge type="color" color="gray" size={size}>
        {label}
    </Badge>
);

/** Marks a finding that comes from Meraki's own spreadsheets. */
export const RealDataBadge = ({ size = "sm" }: { size?: Size }) => (
    <Badge type="color" color="brand" size={size}>
        From your sheets
    </Badge>
);

const ROLE_COLOR: Record<Role, "brand" | "blue" | "gray" | "purple"> = { owner: "brand", manager: "blue", "front-desk": "purple", technician: "gray" };

export const RoleBadge = ({ role, size = "sm" }: { role: Role; size?: Size }) => (
    <Badge type="pill-color" color={ROLE_COLOR[role]} size={size}>
        {ROLE_LABEL[role]}
    </Badge>
);
