"use client";

import { cx } from "@/utils/cx";
import type { NavItemDividerType, NavItemType } from "../config";
import { NavItemBase } from "./nav-item";

interface NavListProps {
    /** URL of the currently active item. */
    activeUrl?: string;
    /** Additional CSS classes to apply to the list. */
    className?: string;
    /** List of items to display. */
    items: (NavItemType | NavItemDividerType)[];
}

export const NavList = ({ activeUrl, items, className }: NavListProps) => {
    const activeItem = items.find((item) => item.href === activeUrl || item.items?.some((subItem) => subItem.href === activeUrl));

    return (
        <ul className={cx("flex flex-col px-4 pt-5", className)}>
            {items.map((item, index) => {
                if (item.divider) {
                    // [Meraki] A divider with a label renders as a section heading.
                    if (item.label) {
                        return (
                            <li key={index} className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-quaternary uppercase">
                                {item.label}
                            </li>
                        );
                    }
                    return (
                        <li key={index} className="w-full px-0.5 py-2">
                            <hr className="h-px w-full border-none bg-border-secondary" />
                        </li>
                    );
                }

                if (item.items?.length) {
                    return (
                        <details key={item.label} open={activeItem?.href === item.href} className="appearance-none py-0.25">
                            <NavItemBase badge={item.badge} icon={item.icon} type="collapsible">
                                {item.label}
                            </NavItemBase>

                            <dd>
                                <ul className="pb-1">
                                    {item.items.map((childItem) => (
                                        <li key={childItem.label} className="py-0.25">
                                            <NavItemBase
                                                href={childItem.href}
                                                badge={childItem.badge}
                                                type="collapsible-child"
                                                current={activeUrl === childItem.href}
                                            >
                                                {childItem.label}
                                            </NavItemBase>
                                        </li>
                                    ))}
                                </ul>
                            </dd>
                        </details>
                    );
                }

                return (
                    <li key={item.label} className="py-px">
                        <NavItemBase type="link" badge={item.badge} icon={item.icon} href={item.href} current={activeUrl === item.href}>
                            {item.label}
                        </NavItemBase>
                    </li>
                );
            })}
        </ul>
    );
};
