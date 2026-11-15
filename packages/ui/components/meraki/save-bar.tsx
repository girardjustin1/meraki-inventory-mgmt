"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle } from "@untitledui/icons";
import { Button as AriaButton } from "react-aria-components";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

export interface SaveBarProps {
    /** Something on the page differs from what is saved. The bar is hidden when false. */
    isDirty: boolean;
    /** How many fields differ. Shown beside the title when given. */
    changeCount?: number;
    /** Saves everything. Return a promise to keep the button in its loading state until it settles. */
    onSave: () => void | Promise<void>;
    /** Puts every field back to its saved value. */
    onDiscard: () => void;
    /** Button text while saving. */
    savingLabel?: string;
    className?: string;
}

/** How long the "Changes saved" confirmation stays before the bar goes away. */
const SAVED_MS = 2400;

/**
 * The one save control for a page: "Unsaved changes · Discard · Save".
 *
 * It appears when the first field changes and covers every edit on the page, so no card has its
 * own save button. On desktop it sticks to the top of the content area (put it first inside the
 * page's column); on phones it docks above the tab bar, so leave about 4rem of room at the bottom
 * of the page while it shows.
 *
 * Leaving with unsaved changes is never met with a browser dialog. The first click on a link is
 * held back and the bar says so in plain text; a second click goes through.
 */
export const SaveBar = ({ isDirty, changeCount, onSave, onDiscard, savingLabel = "Saving", className }: SaveBarProps) => {
    const [phase, setPhase] = useState<"idle" | "saving" | "saved">("idle");
    const [warned, setWarned] = useState(false);
    const leaveArmed = useRef(false);

    // Hold back the first attempt to follow a link while there are unsaved changes.
    useEffect(() => {
        if (!isDirty) return;
        const onClick = (event: MouseEvent) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = (event.target as Element | null)?.closest?.("a[href]");
            if (!anchor || anchor.getAttribute("target") === "_blank") return;
            // A link to another part of this page does not leave it.
            if ((anchor.getAttribute("href") ?? "").startsWith("#")) return;
            if (leaveArmed.current) return;
            event.preventDefault();
            event.stopPropagation();
            leaveArmed.current = true;
            setWarned(true);
        };
        document.addEventListener("click", onClick, true);
        return () => {
            document.removeEventListener("click", onClick, true);
            leaveArmed.current = false;
        };
    }, [isDirty]);

    useEffect(() => {
        if (phase !== "saved") return;
        const timer = window.setTimeout(() => setPhase("idle"), SAVED_MS);
        return () => window.clearTimeout(timer);
    }, [phase]);

    const save = async () => {
        setPhase("saving");
        setWarned(false);
        try {
            await onSave();
            setPhase("saved");
        } catch {
            setPhase("idle");
        }
    };

    const discard = () => {
        setWarned(false);
        onDiscard();
    };

    const showSaved = phase === "saved" && !isDirty;
    if (!isDirty && phase === "idle") return null;

    return (
        <div
            role="region"
            aria-label={showSaved ? "Changes saved" : "Unsaved changes"}
            data-save-bar={showSaved ? "saved" : phase === "saving" ? "saving" : "dirty"}
            className={cx(
                "z-30 flex flex-col gap-1.5 bg-primary-solid text-white shadow-lg duration-150 ease-out animate-in fade-in",
                // Phones: docked above the tab bar.
                "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-lg:px-4 max-lg:py-2.5 max-lg:slide-in-from-bottom-2",
                // Desktop: sticks to the top of the content column.
                "lg:sticky lg:top-3 lg:rounded-xl lg:py-2.5 lg:pr-2.5 lg:pl-4 lg:slide-in-from-top-2",
                className,
            )}
        >
            <div className="flex min-h-11 items-center gap-2 lg:min-h-9">
                <p aria-live="polite" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
                    {showSaved ? (
                        <>
                            <CheckCircle className="size-5 shrink-0 text-fg-success-secondary" aria-hidden="true" />
                            Changes saved
                        </>
                    ) : (
                        <>
                            <span className="size-2 shrink-0 rounded-full bg-fg-warning-secondary" aria-hidden="true" />
                            {changeCount !== undefined && changeCount > 0 ? (
                                <>
                                    {/* Phones have room for one short phrase. */}
                                    <span className="truncate lg:hidden">
                                        {changeCount} unsaved {changeCount === 1 ? "change" : "changes"}
                                    </span>
                                    <span className="truncate max-lg:hidden">Unsaved changes</span>
                                    <span data-testid="save-bar-count" className="shrink-0 font-medium text-tooltip-supporting-text tabular-nums max-lg:hidden">
                                        · {changeCount} {changeCount === 1 ? "change" : "changes"}
                                    </span>
                                </>
                            ) : (
                                <span className="truncate">Unsaved changes</span>
                            )}
                        </>
                    )}
                </p>
                {!showSaved && (
                    <>
                        <AriaButton
                            onPress={discard}
                            isDisabled={phase === "saving"}
                            className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-semibold text-white outline-white transition duration-100 ease-linear hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:min-h-9"
                        >
                            Discard
                        </AriaButton>
                        <Button size="sm" isLoading={phase === "saving"} showTextWhileLoading onClick={save} className="min-h-11 px-4 lg:min-h-9">
                            {phase === "saving" ? savingLabel : "Save"}
                        </Button>
                    </>
                )}
            </div>
            {warned && isDirty && phase !== "saving" && (
                <p role="alert" className="flex items-start gap-1.5 pb-1 text-xs font-medium text-tooltip-supporting-text">
                    <AlertCircle className="mt-px size-3.5 shrink-0 text-fg-warning-secondary" aria-hidden="true" />
                    Save or discard your changes before leaving this page. Select the link again to leave without saving.
                </p>
            )}
        </div>
    );
};
