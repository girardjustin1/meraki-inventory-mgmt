"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, ChevronRight, MarkerPin01, SwitchHorizontal01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { GoogleLogo } from "@/components/base/buttons/social-logos";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { ROUTES, initials } from "@/components/meraki/app-shell";
import { PinKeypad } from "@/components/meraki/pin-keypad";
import { CURRENT_USER, ROLE_LABEL, locationName, users } from "@/data/inventory";
import type { LocationId, User } from "@/data/types";
import { cx } from "@/utils/cx";

export type PinLockMode = "unlock" | "create" | "confirm" | "step-up";

/** The only PIN the prototype accepts. In production the PIN is checked on the server. */
const PROTOTYPE_PIN = "2580";
const MAX_TRIES = 5;
const LOCK_SECONDS = 60;

const firstName = (name: string) => name.split(" ")[0] ?? name;

/** PINs that are too easy to guess from a glance at the keypad. */
export const isWeakPin = (pin: string) => {
    if (/^(\d)\1+$/.test(pin)) return true;
    const steps = pin.split("").map(Number);
    const ascending = steps.every((d, i) => i === 0 || d === (steps[i - 1] ?? 0) + 1);
    const descending = steps.every((d, i) => i === 0 || d === (steps[i - 1] ?? 0) - 1);
    return ascending || descending;
};

export interface PinLockScreenProps {
    mode?: PinLockMode;
    user?: User;
    location?: LocationId;
    /** Step-up only: the action being confirmed, completing "Enter your PIN to …". */
    action?: string;
    /** Start with this many wrong tries already made (for stories). */
    initialWrongTries?: number;
    /** Start locked with this many seconds left (for stories). */
    initialLockSeconds?: number;
    /** Start with the user list open (for stories). */
    switchUserOpen?: boolean;
    /** Called when the PIN is accepted, or a new PIN is confirmed. */
    onUnlock?: (user: User) => void;
    /** Step-up only: the person backed out. */
    onCancel?: () => void;
}

/**
 * PIN lock. The salon devices are shared, so this screen says who is signed in, lets someone
 * else take over, and doubles as the check before a sensitive action.
 */
export const PinLockScreen = ({
    mode = "unlock",
    user = CURRENT_USER,
    location = user.locations[0] ?? "lynnfield",
    action = "resolve this flag",
    initialWrongTries = 0,
    initialLockSeconds = 0,
    switchUserOpen = false,
    onUnlock,
    onCancel,
}: PinLockScreenProps) => {
    const [activeUser, setActiveUser] = useState<User>(user);
    // First-time setup runs create then confirm. Someone picked from the list without a PIN starts at create.
    const [step, setStep] = useState<PinLockMode>(mode);
    const [firstPin, setFirstPin] = useState<string | undefined>(mode === "confirm" ? PROTOTYPE_PIN : undefined);
    const [wrongTries, setWrongTries] = useState(initialWrongTries);
    const [lockSeconds, setLockSeconds] = useState(initialLockSeconds);
    const [error, setError] = useState<string | undefined>(
        initialWrongTries > 0 && initialLockSeconds === 0 ? `That PIN did not match. ${MAX_TRIES - initialWrongTries} tries left.` : undefined,
    );
    const [done, setDone] = useState(false);
    const [switching, setSwitching] = useState(switchUserOpen);
    const [forgot, setForgot] = useState(false);

    const locked = lockSeconds > 0;

    useEffect(() => {
        if (!locked) return;
        const timer = setInterval(() => {
            setLockSeconds((s) => {
                if (s <= 1) {
                    setWrongTries(0);
                    setError(undefined);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [locked]);

    const others = users.filter((u) => u.id !== activeUser.id && u.locations.includes(location));

    const succeed = () => {
        setError(undefined);
        setDone(true);
        onUnlock?.(activeUser);
    };

    const handlePin = (pin: string) => {
        if (step === "create") {
            if (isWeakPin(pin)) {
                setError("Choose something harder to guess. Repeated digits and runs like 1234 are not allowed.");
                return;
            }
            setError(undefined);
            setFirstPin(pin);
            setStep("confirm");
            return;
        }
        if (step === "confirm") {
            if (pin === firstPin) return succeed();
            setFirstPin(undefined);
            setStep("create");
            setError("Those two did not match. Choose your PIN again.");
            return;
        }
        if (pin === PROTOTYPE_PIN) return succeed();
        const tries = wrongTries + 1;
        setWrongTries(tries);
        if (tries >= MAX_TRIES) {
            setError(undefined);
            setLockSeconds(LOCK_SECONDS);
        } else {
            const left = MAX_TRIES - tries;
            setError(`That PIN did not match. ${left} ${left === 1 ? "try" : "tries"} left.`);
        }
    };

    const pickUser = (next: User) => {
        setActiveUser(next);
        setStep(next.hasPin ? "unlock" : "create");
        setFirstPin(undefined);
        setWrongTries(0);
        setLockSeconds(0);
        setError(undefined);
        setDone(false);
        setSwitching(false);
    };

    const setup = step === "create" || step === "confirm";
    const stepUp = step === "step-up";

    const heading = done
        ? setup
            ? "Your PIN is set"
            : stepUp
              ? "Confirmed"
              : `Welcome back, ${firstName(activeUser.name)}`
        : step === "create"
          ? "Choose a 4-digit PIN"
          : step === "confirm"
            ? "Enter it again to confirm"
            : stepUp
              ? `Enter your PIN to ${action}`
              : activeUser.id === user.id
                ? "Enter your PIN"
                : `Enter ${firstName(activeUser.name)}'s PIN`;

    const hint =
        step === "create"
            ? "For unlocking the app on shared devices. Avoid repeated digits and runs like 1234."
            : step === "confirm"
              ? "The same four digits, once more."
              : stepUp
                ? "This records that it was you."
                : undefined;

    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-secondary_alt">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-linear-to-b from-brand-50 to-transparent" />

            <header className="relative flex h-14 items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)] lg:px-8">
                {stepUp && !done ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg pr-3 text-sm font-semibold text-secondary outline-focus-ring hover:text-secondary_hover focus-visible:outline-2"
                    >
                        <ArrowLeft className="size-5" aria-hidden="true" />
                        Cancel
                    </button>
                ) : (
                    <MerakiLogo className="h-6" />
                )}
                <p className="flex items-center gap-1.5 text-sm font-medium text-tertiary">
                    <MarkerPin01 className="size-4 text-fg-quaternary" aria-hidden="true" />
                    {locationName(location)}
                </p>
            </header>

            <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-between gap-6 px-6 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:justify-center lg:gap-8">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                        <Avatar size="xl" initials={initials(activeUser.name)} />
                        <div>
                            <p className="text-md font-semibold text-primary">{activeUser.name}</p>
                            <p className="text-sm text-tertiary">{ROLE_LABEL[activeUser.role]}</p>
                        </div>
                    </div>
                    <h1 className="text-xl font-semibold text-primary">{heading}</h1>
                </div>

                {done ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center lg:flex-none">
                        <CheckCircle className="size-14 text-fg-success-primary" aria-hidden="true" />
                        <p className="max-w-xs text-md text-tertiary">
                            {setup
                                ? "Use it whenever the app locks. If you forget it, sign in with Google again to choose a new one."
                                : stepUp
                                  ? "The action is recorded under your name."
                                  : `You are signed in at ${locationName(location)}.`}
                        </p>
                        <Button href={ROUTES.home} color="primary" size="xl" className="min-h-12 w-full max-w-xs">
                            {stepUp ? "Back to the app" : "Continue"}
                        </Button>
                    </div>
                ) : (
                    <>
                        <PinKeypad
                            key={`${activeUser.id}-${step}`}
                            onComplete={handlePin}
                            error={error}
                            hint={hint}
                            lockedLabel={locked ? `Too many tries. Try again in ${lockSeconds} ${lockSeconds === 1 ? "second" : "seconds"}.` : undefined}
                            label={`${firstName(activeUser.name)}'s PIN`}
                            captureKeyboard={!switching && !forgot}
                        />

                        <div className="flex w-full flex-col items-center gap-1">
                            {!setup && (
                                <div className="flex w-full items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSwitching(true)}
                                        className={cx(
                                            "flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-secondary outline-focus-ring hover:text-brand-secondary_hover focus-visible:outline-2",
                                            stepUp && "hidden",
                                        )}
                                    >
                                        <SwitchHorizontal01 className="size-4" aria-hidden="true" />
                                        Not you? Switch user
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setForgot(true)}
                                        className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-tertiary outline-focus-ring hover:text-tertiary_hover focus-visible:outline-2"
                                    >
                                        Forgot PIN
                                    </button>
                                </div>
                            )}
                            {!setup && (
                                <p className="rounded-md bg-secondary px-2.5 py-1 text-xs text-tertiary ring-1 ring-secondary ring-inset">
                                    <span className="font-semibold text-secondary">Prototype. </span>
                                    The PIN is {PROTOTYPE_PIN}.
                                </p>
                            )}
                        </div>
                    </>
                )}
            </main>

            <ModalOverlay isOpen={switching} onOpenChange={setSwitching} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Switch user">
                        <div className="flex flex-col gap-4 p-5 sm:p-6">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">Who is using this device?</h2>
                                <p className="text-sm text-tertiary">Staff at {locationName(location)}. You will be asked for that person's PIN.</p>
                            </div>
                            <ul className="-mx-2 flex flex-col">
                                {others.map((u) => (
                                    <li key={u.id}>
                                        <button
                                            type="button"
                                            onClick={() => pickUser(u)}
                                            className="flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2"
                                        >
                                            <Avatar size="md" initials={initials(u.name)} />
                                            <span className="flex min-w-0 flex-1 flex-col">
                                                <span className="text-sm font-semibold text-primary">{u.name}</span>
                                                <span className="text-sm text-tertiary">
                                                    {ROLE_LABEL[u.role]}
                                                    {u.hasPin ? "" : " · no PIN yet, will set one now"}
                                                </span>
                                            </span>
                                            <ChevronRight className="size-5 shrink-0 text-fg-quaternary" aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <Button color="secondary" size="lg" className="min-h-11" onClick={() => setSwitching(false)}>
                                Cancel
                            </Button>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>

            <ModalOverlay isOpen={forgot} onOpenChange={setForgot} isDismissable>
                <Modal className="max-w-md">
                    <Dialog aria-label="Forgot PIN">
                        <div className="flex flex-col gap-5 p-5 sm:p-6">
                            <div className="flex flex-col gap-1">
                                <h2 className="text-lg font-semibold text-primary">Forgot your PIN?</h2>
                                <p className="text-sm text-tertiary">
                                    Sign in with Google again as {activeUser.email} and you can choose a new PIN. The old one stops working straight away, and
                                    the reset is recorded in Activity.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Button
                                    color="secondary"
                                    size="lg"
                                    className="min-h-11"
                                    iconLeading={<GoogleLogo colorful data-icon className="size-5" aria-hidden="true" />}
                                    onClick={() => setForgot(false)}
                                >
                                    Continue with Google
                                </Button>
                                <Button color="tertiary" size="lg" className="min-h-11" onClick={() => setForgot(false)}>
                                    Back to the keypad
                                </Button>
                            </div>
                        </div>
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </div>
    );
};
