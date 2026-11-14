"use client";

import { useState } from "react";
import { Package } from "@untitledui/icons";
import type { Item } from "@/data/types";
import { cx } from "@/utils/cx";

const sizes = { sm: "size-8 rounded-md", md: "size-10 rounded-lg", lg: "size-14 rounded-lg", xl: "size-24 rounded-xl" } as const;

interface ItemThumbProps {
    item: Pick<Item, "name" | "imageUrl" | "swatch" | "kind">;
    size?: keyof typeof sizes;
    className?: string;
}

/**
 * Product thumbnail. Polish shows its colour swatch, supplies show the product photo when one
 * has been matched, and everything else falls back to a neutral package icon.
 */
export const ItemThumb = ({ item, size = "md", className }: ItemThumbProps) => {
    const [failed, setFailed] = useState(false);
    const base = cx("inline-block shrink-0 ring-1 ring-secondary ring-inset", sizes[size], className);

    if (item.kind === "polish" && item.swatch) {
        return <span role="img" aria-label={`${item.name} swatch`} className={base} style={{ backgroundColor: item.swatch }} />;
    }
    if (item.imageUrl && !failed) {
        return (
            // Remote manufacturer image, hot-linked for the prototype. Plain <img> so it works in Storybook and Next.

            <img src={item.imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} className={cx(base, "bg-primary object-contain p-0.5")} />
        );
    }
    return (
        <span aria-hidden="true" className={cx(base, "inline-flex items-center justify-center bg-secondary text-fg-quaternary")}>
            <Package className={size === "xl" ? "size-8" : size === "lg" ? "size-6" : "size-4"} />
        </span>
    );
};
