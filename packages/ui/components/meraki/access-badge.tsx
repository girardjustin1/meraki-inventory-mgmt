import { ShieldTick } from "@untitledui/icons";
import { Badge, BadgeWithIcon } from "@/components/base/badges/badges";
import type { AccessLevel } from "@/data/types";
import { ACCESS_LABEL } from "@/engine/permissions";

/**
 * Admin or User. Square-cornered so it never reads as a role pill: role says what job someone
 * does, access says how far their permissions reach. Admin carries the brand colour and a shield.
 */
export const AccessBadge = ({ access, size = "sm", className }: { access: AccessLevel; size?: "sm" | "md"; className?: string }) =>
    access === "admin" ? (
        <BadgeWithIcon type="color" color="brand" size={size} iconLeading={ShieldTick} className={className}>
            {ACCESS_LABEL.admin}
        </BadgeWithIcon>
    ) : (
        <Badge type="color" color="gray" size={size} className={className}>
            {ACCESS_LABEL.user}
        </Badge>
    );
