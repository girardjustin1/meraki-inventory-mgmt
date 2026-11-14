import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PinLockScreen } from "./pin-lock-screen";

const meta: Meta<typeof PinLockScreen> = { title: "Screens/Auth/PIN lock", component: PinLockScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof PinLockScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Type 2580 to unlock. Five wrong tries locks the keypad for 60 seconds. */
export const Mobile: Story = { globals: mobile };
export const Desktop: Story = {};
/** First-time setup: choose a PIN, then enter it again. 1234 and 1111 are refused. */
export const Create: Story = { args: { mode: "create" }, globals: mobile };
export const Confirm: Story = { args: { mode: "confirm" }, globals: mobile };
export const WrongPin: Story = { args: { initialWrongTries: 2 }, globals: mobile };
export const Locked: Story = { args: { initialWrongTries: 5, initialLockSeconds: 42 }, globals: mobile };
/** The shared-device case: pick who is using the phone, then enter that person's PIN. */
export const SwitchUser: Story = { args: { switchUserOpen: true }, globals: mobile };
export const StepUp: Story = { args: { mode: "step-up", action: "resolve this flag" }, globals: mobile };
