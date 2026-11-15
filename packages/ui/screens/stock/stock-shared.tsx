"use client";

import type { ReactNode } from "react";
import { CheckCircle, Package, XClose } from "@untitledui/icons";
import { EmptyState } from "@/components/application/empty-state/empty-state";
import { Button } from "@/components/base/buttons/button";
import { Card } from "@/components/meraki/app-shell";
import { cx } from "@/utils/cx";

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const NothingHere = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
    <Card className="py-10 lg:py-14">
        <EmptyState size="sm">
            <EmptyState.Header pattern="none">
                <EmptyState.FeaturedIcon icon={Package} color="gray" theme="modern" />
            </EmptyState.Header>
            <EmptyState.Content>
                <EmptyState.Title>{title}</EmptyState.Title>
                <EmptyState.Description>{children}</EmptyState.Description>
            </EmptyState.Content>
            {action && <EmptyState.Footer>{action}</EmptyState.Footer>}
        </EmptyState>
    </Card>
);

/** A short confirmation of something that just happened (or, in the prototype, would have). */
export interface Notice {
    text: ReactNode;
    href?: string;
    linkLabel?: string;
    onUndo?: () => void;
}

/**
 * The page's one confirmation strip. Sits at the bottom of the content on desktop and under the
 * top bar on a phone, where the bulk bar already owns the bottom edge.
 */
export const NoticeBar = ({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) =>
    notice ? (
        <div
            role="status"
            data-testid="stock-notice"
            className={cx(
                "z-30 flex items-center gap-3 rounded-xl bg-primary-solid py-2 pr-2 pl-3.5 text-sm text-white shadow-xl",
                "max-lg:fixed max-lg:inset-x-3 max-lg:top-[calc(4rem+env(safe-area-inset-top))]",
                "lg:sticky lg:bottom-6 lg:max-w-2xl lg:self-center",
            )}
        >
            <CheckCircle className="size-5 shrink-0 text-fg-success-secondary" aria-hidden="true" />
            <p className="min-w-0 flex-1">{notice.text}</p>
            {notice.href && (
                <a href={notice.href} className="shrink-0 rounded-xs font-semibold underline underline-offset-2 outline-focus-ring focus-visible:outline-2">
                    {notice.linkLabel ?? "Open"}
                </a>
            )}
            {notice.onUndo && (
                <button
                    type="button"
                    onClick={notice.onUndo}
                    data-notice-undo
                    className="shrink-0 cursor-pointer rounded-xs font-semibold underline underline-offset-2 outline-focus-ring focus-visible:outline-2"
                >
                    Undo
                </button>
            )}
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 outline-focus-ring hover:text-white focus-visible:outline-2"
            >
                <XClose className="size-4" aria-hidden="true" />
            </button>
        </div>
    ) : null;

/** "Show 60 more (85 left)" */
export const ShowMore = ({ step, remaining, onPress }: { step: number; remaining: number; onPress: () => void }) =>
    remaining > 0 ? (
        <Button color="secondary" size="md" className="self-center max-lg:w-full" onClick={onPress}>
            Show {Math.min(step, remaining)} more ({remaining.toLocaleString("en-US")} left)
        </Button>
    ) : null;
