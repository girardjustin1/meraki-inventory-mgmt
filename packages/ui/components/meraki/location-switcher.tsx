"use client";

import { MarkerPin01 } from "@untitledui/icons";
import { Select } from "@/components/base/select/select";
import { locations } from "@/data/inventory";
import type { LocationId } from "@/data/types";

interface LocationSwitcherProps {
    value: LocationId;
    onChange?: (value: LocationId) => void;
    size?: "sm" | "md";
    className?: string;
}

/** Which salon the screen is showing. Present on every screen so nobody counts the wrong shelf. */
export const LocationSwitcher = ({ value, onChange, size = "sm", className }: LocationSwitcherProps) => (
    <Select
        aria-label="Location"
        size={size}
        className={className}
        icon={MarkerPin01}
        items={locations.map((l) => ({ id: l.id, label: l.shortName }))}
        value={value}
        onChange={(key) => {
            if (key) onChange?.(key as LocationId);
        }}
    >
        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
    </Select>
);
