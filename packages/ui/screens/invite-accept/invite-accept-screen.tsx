"use client";

import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
    ArrowLeft,
    CheckCircle,
    ClipboardCheck,
    Clock,
    Flag01,
    Hourglass01,
    LinkBroken01,
    Lock01,
    LogIn01,
    MarkerPin01,
    QrCode02,
    Share01,
    SlashCircle01,
    SwitchHorizontal01,
    Truck01,
    UserCheck01,
    UserEdit,
    Users01,
} from "@untitledui/icons";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { GoogleLogo } from "@/components/base/buttons/social-logos";
import { Input } from "@/components/base/input/input";
import { MerakiLogo } from "@/components/foundations/logo/meraki-logo";
import { AccessBadge } from "@/components/meraki/access-badge";
import { ROUTES, initials } from "@/components/meraki/app-shell";
import { inviteExpiryLabel, inviteStatus } from "@/components/meraki/invite-link-card";
import { PermissionSummary } from "@/components/meraki/permission-matrix";
import { PinKeypad } from "@/components/meraki/pin-keypad";
import { RoleBadge } from "@/components/meraki/status-badges";
import { ROLE_LABEL, getInvite, invites, locationName, userById, users } from "@/data/inventory";
import type { Invite, Role } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { isAdmin } from "@/engine/permissions";
import { isWeakPin } from "@/screens/pin-lock/pin-lock-screen";
import { asset } from "@/utils/asset";
import { cx } from "@/utils/cx";

export type InviteAcceptStep = "invite" | "profile" | "pin" | "done";

/** Why an invite link cannot be used. Each one has its own screen with a next step. */
export type InviteProblem = "not-found" | "expired" | "revoked" | "used" | "already-member" | "wrong-account";

/** The first pending, email-bound sample invite. */
const DEFAULT_TOKEN = invites.find((i) => i.status === "pending" && i.email)?.token ?? "";

/** Stands in for the Google account when an open link is used in the prototype, where nobody really signs in. */
const PLACEHOLDER_EMAIL = "your.account@example.com";

const STEPS: { id: InviteAcceptStep; label: string }[] = [
    { id: "invite", label: "Your invite" },
    { id: "profile", label: "Your name" },
    { id: "pin", label: "Your PIN" },
    { id: "done", label: "Done" },
];

const sameEmail = (a?: string, b?: string) => Boolean(a && b) && a?.trim().toLowerCase() === b?.trim().toLowerCase();

const placesLabel = (invite: Invite) => (invite.access === "admin" ? "every location" : invite.locations.map((id) => locationName(id)).join(" and "));

interface FirstThing {
    icon: FC<{ className?: string }>;
    title: string;
    body: string;
}

/** Where each role should go first, so the app does not open on a blank feeling. */
const FIRST_THINGS: Record<Role, FirstThing[]> = {
    owner: [],
    manager: [
        { icon: Flag01, title: "Start with the review queue", body: "Flags that need a decision are on the Flags tab, each with the numbers behind it." },
        {
            icon: ClipboardCheck,
            title: "Approve the counts that are waiting",
            body: "Submitted counts are on the Counts tab. You review everyone's but your own.",
        },
    ],
    "front-desk": [
        { icon: Truck01, title: "Receive what has arrived", body: "Deliveries waiting are on the Receive tab. Check each line against the box." },
        { icon: ClipboardCheck, title: "Counts assigned to you", body: "They appear on the Counts tab when a manager schedules one." },
    ],
    technician: [
        { icon: ClipboardCheck, title: "Your first count is assigned on the Counts tab", body: "Go shelf by shelf, on the phone in your hand." },
        { icon: QrCode02, title: "Log what you use", body: "Tap Scan and point the camera at the bottle or box." },
    ],
};

const ADMIN_FIRST_THING: FirstThing = { icon: Users01, title: "Invite the rest of the team", body: "Open Team from Settings, then choose Invite someone." };

/** The swan mark. Hidden if the asset is not served, so the panel never shows a broken image. */
const Swan = ({ className }: { className?: string }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    // Static brand asset from public/brand. Plain <img> so it works in Storybook and Next.
    return <img src={asset("/brand/meraki-swan-teal.svg")} alt="" aria-hidden="true" onError={() => setFailed(true)} className={className} />;
};

const JOINING = [
    { icon: LogIn01, title: "Sign in with Google", body: "There is no password to create or forget." },
    { icon: UserEdit, title: "Confirm your name", body: "It goes next to the counts and deliveries you record." },
    { icon: Lock01, title: "Choose a 4-digit PIN", body: "It unlocks the app as you on the shared salon devices." },
];

const StepIndicator = ({ step }: { step: InviteAcceptStep }) => {
    const index = STEPS.findIndex((s) => s.id === step);
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-tertiary">
                Step {index + 1} of {STEPS.length}: <span className="text-secondary">{STEPS[index]?.label}</span>
            </p>
            <ol aria-hidden="true" className="flex gap-1.5">
                {STEPS.map((s, i) => (
                    <li
                        key={s.id}
                        className={cx("h-1 flex-1 rounded-full transition duration-100 ease-linear", i <= index ? "bg-fg-brand-primary" : "bg-quaternary")}
                    />
                ))}
            </ol>
        </div>
    );
};

const PrototypeNote = ({ children }: { children: ReactNode }) => (
    <p role="status" className="rounded-lg bg-secondary px-3 py-2 text-xs text-tertiary ring-1 ring-secondary ring-inset">
        <span className="font-semibold text-secondary">Prototype. </span>
        {children}
    </p>
);

const ProblemView = ({
    icon: Icon,
    tone = "gray",
    title,
    children,
    actions,
}: {
    icon: FC<{ className?: string }>;
    tone?: "gray" | "warning";
    title: string;
    children: ReactNode;
    actions: ReactNode;
}) => (
    <div className="flex flex-col gap-6">
        <span
            className={cx(
                "flex size-12 items-center justify-center rounded-xl ring-1 ring-inset",
                tone === "gray" ? "bg-secondary text-fg-quaternary ring-secondary" : "bg-warning-primary text-fg-warning-primary ring-utility-yellow-200",
            )}
        >
            <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="flex flex-col gap-3">
            <h1 className="text-display-xs font-semibold text-primary lg:text-display-sm">{title}</h1>
            <div className="flex flex-col gap-3 text-md text-tertiary">{children}</div>
        </div>
        <div className="flex flex-col gap-3">{actions}</div>
    </div>
);

export interface InviteAcceptScreenProps {
    /** The token from the link, `/invite/<token>`. Defaults to the first pending email invite in the sample data. */
    token?: string;
    /** Step to open on (for stories and for returning from Google). */
    step?: InviteAcceptStep;
    /** The Google account already signed in on this device, if any. Used to show the wrong-account and already-a-member states. */
    signedInEmail?: string;
    /** Start Google sign-in. Without it the prototype moves to the next step by itself. */
    onContinueWithGoogle?: (invite: Invite) => void;
    /** Called from "Open the app". Without it the button links to the home screen. */
    onDone?: () => void;
}

/**
 * Sign-up from an invite link. Four short steps: read the invite, sign in with Google, confirm
 * a name, choose a PIN. Every way a link can fail has its own screen that says what to do next.
 */
export const InviteAcceptScreen = ({
    token = DEFAULT_TOKEN,
    step: initialStep = "invite",
    signedInEmail,
    onContinueWithGoogle,
    onDone,
}: InviteAcceptScreenProps) => {
    const invite = getInvite(token);
    const inviter = userById(invite?.invitedBy);

    const [step, setStep] = useState<InviteAcceptStep>(initialStep);
    const [accountEmail, setAccountEmail] = useState(signedInEmail);
    const [name, setName] = useState(invite?.name ?? "");
    const [nameTried, setNameTried] = useState(false);
    const [loading, setLoading] = useState(false);
    const [simulated, setSimulated] = useState(false);
    const [switched, setSwitched] = useState(false);
    const [pinStage, setPinStage] = useState<"create" | "confirm">("create");
    const [firstPin, setFirstPin] = useState<string>();
    const [pinError, setPinError] = useState<string>();

    // Prototype only: with no Google to hand off to, "Continue with Google" moves on after a moment.
    useEffect(() => {
        if (!loading || onContinueWithGoogle) return;
        const timer = setTimeout(() => {
            setLoading(false);
            setSimulated(true);
            setStep("profile");
        }, 700);
        return () => clearTimeout(timer);
    }, [loading, onContinueWithGoogle]);

    const status = invite ? inviteStatus(invite) : undefined;
    const member = accountEmail ? users.find((u) => sameEmail(u.email, accountEmail)) : undefined;

    const problem: InviteProblem | undefined = !invite
        ? "not-found"
        : status === "accepted"
          ? "used"
          : status === "revoked"
            ? "revoked"
            : status === "expired"
              ? "expired"
              : member
                ? "already-member"
                : accountEmail && invite.email && !sameEmail(accountEmail, invite.email)
                  ? "wrong-account"
                  : undefined;

    const inviterName = inviter?.name ?? "the person who invited you";
    const googleEmail = accountEmail ?? invite?.email ?? PLACEHOLDER_EMAIL;
    const nameOk = name.trim().length >= 2;
    const first = name.trim().split(" ")[0] ?? "";

    const continueWithGoogle = () => {
        if (!invite) return;
        setLoading(true);
        onContinueWithGoogle?.(invite);
    };

    const submitName = () => {
        setNameTried(true);
        if (nameOk) setStep("pin");
    };

    const switchAccount = () => {
        if (invite && onContinueWithGoogle) return onContinueWithGoogle(invite);
        setAccountEmail(undefined);
        setSwitched(true);
        setStep("invite");
    };

    const handlePin = (pin: string) => {
        if (pinStage === "create") {
            if (isWeakPin(pin)) {
                setPinError("Choose something harder to guess. Repeated digits and runs like 1234 are not allowed.");
                return;
            }
            setPinError(undefined);
            setFirstPin(pin);
            setPinStage("confirm");
            return;
        }
        if (pin === firstPin) {
            setPinError(undefined);
            setStep("done");
            return;
        }
        setFirstPin(undefined);
        setPinStage("create");
        setPinError("Those two did not match. Choose your PIN again.");
    };

    const signInInstead = (
        <Button href={ROUTES.signIn} color="primary" size="xl" className="min-h-12 w-full">
            Sign in instead
        </Button>
    );

    const firstThings = invite ? [...FIRST_THINGS[invite.role], ...(isAdmin(invite) ? [ADMIN_FIRST_THING] : [])] : [];

    return (
        <div className="grid min-h-dvh bg-primary lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-10 lg:px-16 lg:py-10">
                {/* Phone only: a soft tint and the swan, standing in for the brand panel. */}
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-brand-50 to-transparent lg:hidden" />
                <Swan className="pointer-events-none absolute -top-6 -right-10 h-64 w-auto opacity-25 lg:hidden" />

                <header className="relative">
                    <MerakiLogo className="h-8" />
                </header>

                <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 py-8 lg:py-10">
                    {/* ------------------------------------------------ links that cannot be used */}
                    {problem === "not-found" && (
                        <ProblemView
                            icon={LinkBroken01}
                            title="This invite link does not work"
                            actions={
                                <Button href={ROUTES.signIn} color="secondary" size="xl" className="min-h-12 w-full">
                                    Go to sign in
                                </Button>
                            }
                        >
                            <p>The link may be incomplete, or it was typed by hand. Open it again from the message it came in, without changing it.</p>
                            <p>If it still does not work, ask the person who invited you to send a new one.</p>
                        </ProblemView>
                    )}

                    {problem === "expired" && invite && (
                        <ProblemView
                            icon={Hourglass01}
                            tone="warning"
                            title="This invite link has expired"
                            actions={
                                <Button href={ROUTES.signIn} color="secondary" size="xl" className="min-h-12 w-full">
                                    I already have an account
                                </Button>
                            }
                        >
                            <p>
                                It stopped working on {formatDate(invite.expiresAt, true)}. Invite links only last a few days, so an old message cannot be used
                                to get in later.
                            </p>
                            <p className="font-medium text-secondary">Ask {inviterName} for a new link.</p>
                        </ProblemView>
                    )}

                    {problem === "revoked" && invite && (
                        <ProblemView
                            icon={SlashCircle01}
                            title="This invite was cancelled"
                            actions={
                                <Button href={ROUTES.signIn} color="secondary" size="xl" className="min-h-12 w-full">
                                    I already have an account
                                </Button>
                            }
                        >
                            <p>The link was switched off by an admin, so it can no longer be used. That is often because it was sent to the wrong address.</p>
                            <p className="font-medium text-secondary">If you were expecting access, ask {inviterName} to send a new invite.</p>
                        </ProblemView>
                    )}

                    {problem === "used" && invite && (
                        <ProblemView icon={UserCheck01} title="This invite has already been used" actions={signInInstead}>
                            <p>
                                Each link works once
                                {invite.acceptedAt ? `, and this one was used on ${formatDate(invite.acceptedAt, true)}` : ""}. If that was you, your account is
                                ready: sign in with the same Google account.
                            </p>
                            <p>If it was not you, tell {inviterName} so they can check who joined.</p>
                        </ProblemView>
                    )}

                    {problem === "already-member" && member && (
                        <ProblemView
                            icon={UserCheck01}
                            title="You already have an account"
                            actions={
                                <>
                                    {signInInstead}
                                    <Button color="secondary" size="xl" className="min-h-12 w-full" iconLeading={SwitchHorizontal01} onClick={switchAccount}>
                                        Use a different Google account
                                    </Button>
                                </>
                            }
                        >
                            <p>
                                You are signed in to Google as <span className="font-medium break-all text-secondary">{member.email}</span>, which is already on
                                the team as {member.name}. There is nothing to set up: sign in as usual.
                            </p>
                            <p>If this invite was meant for someone else, hand them the device or send them the link.</p>
                        </ProblemView>
                    )}

                    {problem === "wrong-account" && invite && (
                        <ProblemView
                            icon={SwitchHorizontal01}
                            tone="warning"
                            title="This invite is for a different Google account"
                            actions={
                                <>
                                    <Button
                                        color="secondary"
                                        size="xl"
                                        className="min-h-12 w-full"
                                        iconLeading={<GoogleLogo colorful data-icon className="size-5" aria-hidden="true" />}
                                        onClick={switchAccount}
                                    >
                                        Switch Google account
                                    </Button>
                                    <p className="text-center text-sm text-tertiary">
                                        Do not have that account? Ask {inviterName} to send the invite to the address you use.
                                    </p>
                                </>
                            }
                        >
                            <dl className="divide-y divide-border-secondary rounded-xl bg-primary text-sm ring-1 ring-secondary ring-inset">
                                <div className="flex flex-col gap-0.5 px-4 py-3">
                                    <dt className="text-tertiary">You are signed in as</dt>
                                    <dd className="font-semibold break-all text-primary">{accountEmail}</dd>
                                </div>
                                <div className="flex flex-col gap-0.5 px-4 py-3">
                                    <dt className="text-tertiary">The invite was sent to</dt>
                                    <dd className="font-semibold break-all text-primary">{invite.email}</dd>
                                </div>
                            </dl>
                            <p>Only the account it was sent to can accept it. Switch to that account and the invite will open straight away.</p>
                        </ProblemView>
                    )}

                    {/* ------------------------------------------------ step 1: the invite */}
                    {!problem && invite && step === "invite" && (
                        <>
                            <StepIndicator step="invite" />

                            <div className="flex flex-col gap-3">
                                <p className="text-sm font-semibold text-brand-secondary">{invite.name ? `Hi ${invite.name}` : "Welcome"}</p>
                                <h1 className="text-display-sm font-semibold text-primary lg:text-display-md">
                                    You&apos;re <em>invited</em> to Meraki Inventory
                                </h1>
                                <p className="text-md text-tertiary">
                                    {inviter ? `${inviter.name} invited you` : "You have been invited"} to count stock, log deliveries and keep the shelves
                                    right at {placesLabel(invite)}.
                                </p>
                            </div>

                            <section aria-label="Your invite" className="flex flex-col rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset">
                                {inviter && (
                                    <div className="flex items-center gap-3 border-b border-secondary p-4">
                                        <Avatar size="md" initials={initials(inviter.name)} />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-primary">{inviter.name}</p>
                                            <p className="text-sm text-tertiary">{ROLE_LABEL[inviter.role]} · invited you</p>
                                        </div>
                                    </div>
                                )}
                                <dl className="flex flex-col gap-3 p-4 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="text-tertiary">Your role</dt>
                                        <dd className="flex items-center gap-1.5">
                                            <RoleBadge role={invite.role} />
                                            <AccessBadge access={invite.access} />
                                        </dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="flex items-center gap-1.5 text-tertiary">
                                            <MarkerPin01 className="size-4 text-fg-quaternary" aria-hidden="true" />
                                            Where
                                        </dt>
                                        <dd className="text-right font-medium text-secondary">{placesLabel(invite).replace(/^./, (c) => c.toUpperCase())}</dd>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="flex items-center gap-1.5 text-tertiary">
                                            <Clock className="size-4 text-fg-quaternary" aria-hidden="true" />
                                            This link
                                        </dt>
                                        <dd className="text-right font-medium text-secondary">
                                            {inviteExpiryLabel(invite)}, {formatDate(invite.expiresAt)}
                                        </dd>
                                    </div>
                                </dl>
                                {invite.note && (
                                    <blockquote className="border-t border-secondary p-4 text-sm text-secondary">
                                        <p>&ldquo;{invite.note}&rdquo;</p>
                                        {inviter && <footer className="mt-1 text-tertiary">{inviter.name}</footer>}
                                    </blockquote>
                                )}
                            </section>

                            {/* The button comes before the detail so it is on screen without scrolling on a phone. */}
                            <div className="flex flex-col gap-3">
                                <Button
                                    color="secondary"
                                    size="xl"
                                    className="min-h-13 w-full"
                                    isLoading={loading}
                                    showTextWhileLoading
                                    iconLeading={<GoogleLogo colorful data-icon className="size-5" aria-hidden="true" />}
                                    onClick={continueWithGoogle}
                                >
                                    {loading ? "Opening Google" : "Continue with Google"}
                                </Button>
                                <p className="text-center text-sm text-tertiary">
                                    {invite.email ? (
                                        <>
                                            Use the Google account for <span className="font-medium break-all text-secondary">{invite.email}</span>. There is no
                                            password to create.
                                        </>
                                    ) : (
                                        "Use your own Google account. There is no password to create."
                                    )}
                                </p>
                                {switched && <PrototypeNote>In the live app this opens the Google account chooser. Nothing was sent to Google.</PrototypeNote>}
                            </div>

                            <PermissionSummary
                                access={invite.access}
                                role={invite.role}
                                locations={invite.locations}
                                title="What you'll be able to do"
                                highlightLabel="You"
                            />
                        </>
                    )}

                    {/* ------------------------------------------------ step 2: profile */}
                    {!problem && invite && step === "profile" && (
                        <>
                            <StepIndicator step="profile" />

                            <div className="flex flex-col gap-3">
                                <h1 className="text-display-xs font-semibold text-primary lg:text-display-sm">Confirm your name</h1>
                                <p className="text-md text-tertiary">This is the name the team sees next to the counts, orders and deliveries you record.</p>
                            </div>

                            <div className="flex items-center gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary ring-1 ring-secondary ring-inset">
                                    <GoogleLogo colorful className="size-5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-tertiary">Signed in with Google as</p>
                                    <p className="text-sm font-semibold break-all text-primary">{googleEmail}</p>
                                </div>
                                <CheckCircle className="size-5 shrink-0 text-fg-success-primary" aria-hidden="true" />
                            </div>

                            <div className="flex flex-col gap-6">
                                <Input
                                    label="Your name"
                                    size="lg"
                                    placeholder="First and last name"
                                    autoComplete="name"
                                    value={name}
                                    onChange={setName}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") submitName();
                                    }}
                                    isRequired
                                    isInvalid={nameTried && !nameOk}
                                    hint={nameTried && !nameOk ? "Enter the name your team knows you by." : "You can change it later from the More tab."}
                                />
                                <Button color="primary" size="xl" className="min-h-12 w-full" onClick={submitName}>
                                    Continue
                                </Button>
                            </div>

                            {simulated && (
                                <PrototypeNote>Sign-in is not connected yet, so nothing was sent to Google. The address above is a stand-in.</PrototypeNote>
                            )}
                        </>
                    )}

                    {/* ------------------------------------------------ step 3: PIN */}
                    {!problem && invite && step === "pin" && (
                        <>
                            <StepIndicator step="pin" />

                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPinError(undefined);
                                        if (pinStage === "confirm") {
                                            setFirstPin(undefined);
                                            setPinStage("create");
                                        } else {
                                            setStep("profile");
                                        }
                                    }}
                                    className="-ml-1 flex min-h-11 items-center gap-1.5 self-start rounded-lg pr-3 pl-1 text-sm font-semibold text-secondary outline-focus-ring hover:text-secondary_hover focus-visible:outline-2"
                                >
                                    <ArrowLeft className="size-5" aria-hidden="true" />
                                    {pinStage === "confirm" ? "Choose a different PIN" : "Back to your name"}
                                </button>
                                <h1 className="text-display-xs font-semibold text-primary lg:text-display-sm">
                                    {pinStage === "create" ? "Choose a 4-digit PIN" : "Enter it again to confirm"}
                                </h1>
                                <p className="text-md text-tertiary">
                                    The salon devices are shared. Your PIN unlocks the app as you, so your work is recorded under your name.
                                </p>
                            </div>

                            <PinKeypad
                                key={pinStage}
                                onComplete={handlePin}
                                error={pinError}
                                hint={pinStage === "create" ? "Avoid repeated digits and runs like 1234." : "The same four digits, once more."}
                                label="Your new PIN"
                            />
                        </>
                    )}

                    {/* ------------------------------------------------ step 4: done */}
                    {!problem && invite && step === "done" && (
                        <>
                            <StepIndicator step="done" />

                            <div className="flex flex-col gap-3">
                                <CheckCircle className="size-12 text-fg-success-primary" aria-hidden="true" />
                                <h1 className="text-display-sm font-semibold text-primary lg:text-display-md">
                                    You&apos;re <em>in</em>
                                </h1>
                                <p className="text-md text-tertiary">
                                    {first ? `${first}, your` : "Your"} account is ready. You are{" "}
                                    {isAdmin(invite) ? "an admin" : `a ${ROLE_LABEL[invite.role].toLowerCase()}`} at {placesLabel(invite)}, and your PIN is set.
                                </p>
                            </div>

                            <section
                                aria-labelledby="first-things"
                                className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset"
                            >
                                <h2 id="first-things" className="text-sm font-semibold text-primary">
                                    What to do first
                                </h2>
                                <ul className="flex flex-col gap-4">
                                    {firstThings.map((thing) => (
                                        <li key={thing.title} className="flex items-start gap-3">
                                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-fg-brand-primary ring-1 ring-brand_alt ring-inset">
                                                <thing.icon className="size-5" aria-hidden="true" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-primary">{thing.title}</p>
                                                <p className="text-sm text-tertiary">{thing.body}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            <aside
                                aria-label="Add to Home Screen"
                                className="flex items-start gap-3 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset"
                            >
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary ring-1 ring-secondary ring-inset">
                                    <Share01 className="size-5" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-primary">On an iPhone? Add Meraki to your Home Screen</p>
                                    <p className="text-sm text-tertiary">
                                        In Safari, tap <span className="font-medium text-secondary">Share</span>, then{" "}
                                        <span className="font-medium text-secondary">Add to Home Screen</span>. It opens full screen, like an app.
                                    </p>
                                </div>
                            </aside>

                            {onDone ? (
                                <Button color="primary" size="xl" className="min-h-12 w-full" onClick={onDone}>
                                    Open the app
                                </Button>
                            ) : (
                                <Button href={ROUTES.home} color="primary" size="xl" className="min-h-12 w-full">
                                    Open the app
                                </Button>
                            )}
                        </>
                    )}
                </div>

                <footer className="relative text-center text-xs text-quaternary lg:text-left">Meraki Spa · Lynnfield and Newburyport</footer>
            </main>

            <aside className="relative hidden overflow-hidden bg-brand-50 lg:flex lg:flex-col lg:justify-end lg:p-16">
                <div aria-hidden="true" className="absolute inset-0 bg-linear-to-br from-brand-100 via-brand-50 to-bg-primary" />
                <Swan className="pointer-events-none absolute top-[7%] right-[8%] h-[46%] w-auto opacity-70" />
                <div className="relative flex max-w-md flex-col gap-8">
                    <p className="text-display-xs font-semibold text-primary">
                        {problem ? "Less time counting bottles. More time with clients." : "Three short steps and you are in."}
                    </p>
                    {!problem && (
                        <ol className="flex flex-col gap-5">
                            {JOINING.map((item) => (
                                <li key={item.title} className="flex items-start gap-3">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary shadow-xs ring-1 ring-secondary ring-inset">
                                        <item.icon className="size-5" aria-hidden="true" />
                                    </span>
                                    <div>
                                        <p className="text-md font-semibold text-primary">{item.title}</p>
                                        <p className="text-sm text-tertiary">{item.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </aside>
        </div>
    );
};
