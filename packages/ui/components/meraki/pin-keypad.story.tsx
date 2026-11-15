import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PinKeypad } from "./pin-keypad";

const meta: Meta<typeof PinKeypad> = {
    title: "Meraki/PIN keypad",
    component: PinKeypad,
    tags: ["autodocs"],
    parameters: { layout: "centered" },
    args: { onComplete: () => undefined, hint: "Enter your 4-digit PIN" },
};

export default meta;
type Story = StoryObj<typeof PinKeypad>;

export const Default: Story = {};

export const WrongPin: Story = { args: { error: "That PIN did not match. 3 tries left." } };

export const Locked: Story = { args: { lockedLabel: "Too many tries. Try again in 42 seconds." } };

export const Disabled: Story = { args: { isDisabled: true, hint: "Checking" } };

/** Type 2580 to pass. Anything else shakes and clears. */
export const Interactive: Story = {
    render: () => {
        const Demo = () => {
            const [error, setError] = useState<string>();
            const [done, setDone] = useState(false);
            return (
                <PinKeypad
                    hint={done ? "Unlocked" : "Enter 2580"}
                    error={error}
                    onComplete={(pin) => {
                        const ok = pin === "2580";
                        setDone(ok);
                        setError(ok ? undefined : "That PIN did not match. Try again.");
                    }}
                />
            );
        };
        return <Demo />;
    },
};
