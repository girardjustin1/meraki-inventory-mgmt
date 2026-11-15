"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ClipboardCheck, Flag01, Share01, ShoppingCart01, XClose } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { GoogleLogo } from "@/components/base/buttons/social-logos";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { asset } from "@/utils/asset";

export type SignInState = "default" | "loading" | "not-invited";

export interface SignInScreenProps {
    state?: SignInState;
    /** The Google account that was refused, shown in the not-invited message. */
    attemptedEmail?: string;
    /** Show the iOS "Add to Home Screen" hint. */
    showInstallHint?: boolean;
    /** Called when "Continue with Google" is pressed. Without it the screen only shows the loading state. */
    onContinue?: () => void;
}

/** The swan mark. Hidden if the asset is not served, so the panel never shows a broken image. */
const Swan = ({ className }: { className?: string }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    // Static brand asset from public/brand. Plain <img> so it works in Storybook and Next.
    return <img src={asset("/brand/meraki-swan-teal.svg")} alt="" aria-hidden="true" onError={() => setFailed(true)} className={className} />;
};

const PROMISES = [
    { icon: ClipboardCheck, title: "Count a shelf in minutes", body: "Shelf by shelf, on the phone in your hand." },
    { icon: ShoppingCart01, title: "Order what will run out", body: "Suggested from what each salon really uses." },
    { icon: Flag01, title: "See what does not add up", body: "Short deliveries and odd counts, flagged with the numbers." },
];

/**
 * Sign-in. The first thing staff see, so it stays calm: one button, one sentence on who can
 * get in. Google handles the credentials through Clerk; this screen never asks for a password.
 */
export const SignInScreen = ({
    state: initialState = "default",
    attemptedEmail = "sam.personal@gmail.com",
    showInstallHint = false,
    onContinue,
}: SignInScreenProps) => {
    const [state, setState] = useState<SignInState>(initialState);
    const [hintOpen, setHintOpen] = useState(showInstallHint);
    const [demoNote, setDemoNote] = useState(false);

    // Prototype only: with nothing to sign in to, the loading state hands back after a moment.
    useEffect(() => {
        if (state !== "loading" || initialState === "loading" || onContinue) return;
        const timer = setTimeout(() => {
            setState("default");
            setDemoNote(true);
        }, 1600);
        return () => clearTimeout(timer);
    }, [state, initialState, onContinue]);

    const loading = state === "loading";

    return (
        <div className="grid min-h-dvh bg-primary lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-16 lg:py-10">
                {/* Phone only: a soft tint and the swan, standing in for the brand panel. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-brand-50 to-transparent lg:hidden" />
                <Swan className="pointer-events-none absolute -top-6 -right-10 h-64 w-auto opacity-25 lg:hidden" />

                <header className="relative">
                    <MerakiLogo className="h-8" />
                </header>

                <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 py-10">
                    <div className="flex flex-col gap-3">
                        <p className="text-sm font-semibold text-brand-secondary">Meraki inventory</p>
                        <h1 className="text-display-sm font-semibold text-primary lg:text-display-md">
                            Know what is on every <em>shelf</em>
                        </h1>
                        <p className="text-md text-tertiary">Counts, orders and deliveries for Lynnfield and Newburyport, in one place.</p>
                    </div>

                    <div className="flex flex-col gap-4">
                        {state === "not-invited" && (
                            <div role="alert" className="flex gap-3 rounded-xl bg-error-primary p-4 ring-1 ring-error_subtle ring-inset">
                                <AlertCircle className="mt-0.5 size-5 shrink-0 text-fg-error-primary" aria-hidden="true" />
                                <div className="flex min-w-0 flex-col gap-1">
                                    <p className="text-sm font-semibold text-primary">This Google account has not been invited</p>
                                    <p className="text-sm text-secondary">
                                        You signed in as <span className="font-medium break-all">{attemptedEmail}</span>. Use the Google account your invitation
                                        was sent to.
                                    </p>
                                    <p className="text-sm text-secondary">Ask an admin at your location to send you an invite.</p>
                                </div>
                            </div>
                        )}

                        <Button
                            color="secondary"
                            size="xl"
                            className="min-h-13 w-full"
                            isLoading={loading}
                            showTextWhileLoading
                            iconLeading={<GoogleLogo colorful data-icon className="size-5" aria-hidden="true" />}
                            onClick={() => {
                                setDemoNote(false);
                                setState("loading");
                                onContinue?.();
                            }}
                        >
                            {loading ? "Opening Google" : state === "not-invited" ? "Try a different account" : "Continue with Google"}
                        </Button>

                        <p className="text-center text-sm text-tertiary">
                            Access is limited to invited Meraki staff. There is no password to remember: Google confirms it is you.
                        </p>

                        <p className="text-center text-sm text-quaternary">Have an invite link? Open it to create your account.</p>

                        {demoNote && (
                            <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-center text-xs text-tertiary ring-1 ring-secondary ring-inset">
                                <span className="font-semibold text-secondary">Prototype. </span>
                                Sign-in is not connected yet, so nothing was sent to Google.
                            </p>
                        )}
                    </div>
                </div>

                {hintOpen && (
                    <aside
                        aria-label="Add to Home Screen"
                        className="relative mx-auto mb-2 flex w-full max-w-sm items-start gap-3 rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary"
                    >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-fg-brand-primary ring-1 ring-brand_alt ring-inset">
                            <Share01 className="size-5" aria-hidden="true" />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <p className="text-sm font-semibold text-primary">Add Meraki to your Home Screen</p>
                            <p className="text-sm text-tertiary">
                                In Safari, tap <span className="font-medium text-secondary">Share</span>, then{" "}
                                <span className="font-medium text-secondary">Add to Home Screen</span>. It opens full screen, like an app.
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label="Dismiss"
                            onClick={() => setHintOpen(false)}
                            className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-quaternary outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover hover:text-fg-quaternary_hover focus-visible:outline-2"
                        >
                            <XClose className="size-5" aria-hidden="true" />
                        </button>
                    </aside>
                )}

                <footer className="relative text-center text-xs text-quaternary lg:text-left">Meraki Spa · Lynnfield and Newburyport</footer>
            </main>

            <aside className="relative hidden overflow-hidden bg-brand-50 lg:flex lg:flex-col lg:justify-end lg:p-16">
                <div aria-hidden="true" className="absolute inset-0 bg-linear-to-br from-brand-100 via-brand-50 to-bg-primary" />
                <Swan className="pointer-events-none absolute top-[7%] right-[8%] h-[46%] w-auto opacity-70" />
                <div className="relative flex max-w-md flex-col gap-8">
                    <p className="text-display-xs font-semibold text-primary">Less time counting bottles. More time with clients.</p>
                    <ul className="flex flex-col gap-5">
                        {PROMISES.map((p) => (
                            <li key={p.title} className="flex items-start gap-3">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary shadow-xs ring-1 ring-secondary ring-inset">
                                    <p.icon className="size-5" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-md font-semibold text-primary">{p.title}</p>
                                    <p className="text-sm text-tertiary">{p.body}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </aside>
        </div>
    );
};
