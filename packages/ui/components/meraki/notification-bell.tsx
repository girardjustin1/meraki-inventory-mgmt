"use client";

import { Bell01 } from "@untitledui/icons";
import type { PopoverProps as AriaPopoverProps } from "react-aria-components";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { ROUTES } from "@/components/meraki/app-shell";
import { NotificationList, useNotificationState } from "@/components/meraki/notification-list";
import { notificationsForUser } from "@/data/inventory";
import type { AppNotification } from "@/data/types";
import { cx } from "@/utils/cx";

export interface NotificationBellProps {
    /** Whose inbox this is. */
    userId: string;
    /** Defaults to that person's notifications from the data layer. */
    notifications?: AppNotification[];
    /** Where the desktop popover opens relative to the bell. Use "right bottom" in the sidebar. */
    placement?: AriaPopoverProps["placement"];
    className?: string;
}

const bellClass =
    "relative flex size-11 cursor-pointer items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2 lg:size-10";

const Count = ({ n }: { n: number }) =>
    n > 0 ? (
        <span
            aria-hidden="true"
            className="absolute top-1 right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-error-solid px-1 text-[11px] leading-none font-semibold text-white ring-2 ring-bg-primary lg:top-0.5 lg:right-0"
        >
            {n > 9 ? "9+" : n}
        </span>
    ) : null;

/**
 * The bell in the app frame, with the unread count.
 * On a desktop it opens the latest notifications in a popover. On a phone it is a link to the
 * notifications screen, which has room for the whole list.
 */
export const NotificationBell = ({ userId, notifications, placement = "bottom end", className }: NotificationBellProps) => {
    const inbox = useNotificationState(notifications ?? notificationsForUser(userId));
    const label = inbox.unread > 0 ? `Notifications, ${inbox.unread} unread` : "Notifications";

    return (
        <>
            <a href={ROUTES.notifications} aria-label={label} className={cx(bellClass, "lg:hidden", className)}>
                <Bell01 className="size-5" aria-hidden="true" />
                <Count n={inbox.unread} />
            </a>

            <AriaDialogTrigger>
                <AriaButton aria-label={label} className={cx(bellClass, "hidden lg:flex", className)}>
                    <Bell01 className="size-5" aria-hidden="true" />
                    <Count n={inbox.unread} />
                </AriaButton>
                <AriaPopover
                    placement={placement}
                    offset={8}
                    className={(state) =>
                        cx(
                            "w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-primary shadow-lg ring-1 ring-secondary_alt",
                            state.isEntering && "duration-150 ease-out animate-in fade-in",
                            state.isExiting && "duration-100 ease-in animate-out fade-out",
                        )
                    }
                >
                    <AriaDialog aria-label="Notifications" className="flex max-h-[min(34rem,calc(100dvh-6rem))] flex-col outline-hidden">
                        <div className="flex items-center justify-between gap-3 border-b border-secondary px-3 py-2">
                            <h2 className="text-sm font-semibold text-primary">
                                Notifications
                                {inbox.unread > 0 && <span className="ml-1.5 font-medium text-tertiary">{inbox.unread} unread</span>}
                            </h2>
                            <Button color="link-color" size="sm" isDisabled={inbox.unread === 0} onClick={inbox.markAllRead}>
                                Mark all read
                            </Button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <NotificationList
                                variant="compact"
                                notifications={inbox.items.slice(0, 6)}
                                onToggleRead={inbox.toggleRead}
                                onOpen={inbox.markRead}
                                empty={
                                    <p className="px-4 py-8 text-center text-sm text-tertiary">
                                        Nothing yet. Mentions and things assigned to you show up here.
                                    </p>
                                }
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-secondary px-3 py-2">
                            <span className="text-xs text-tertiary">
                                {inbox.items.length > 6 ? `Latest 6 of ${inbox.items.length}` : `${inbox.items.length} in total`}
                            </span>
                            <Button color="link-color" size="sm" href={ROUTES.notifications}>
                                See all
                            </Button>
                        </div>
                    </AriaDialog>
                </AriaPopover>
            </AriaDialogTrigger>
        </>
    );
};
