import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SignInScreen } from "./sign-in-screen";

const meta: Meta<typeof SignInScreen> = { title: "Screens/Auth/Sign in", component: SignInScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof SignInScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

export const Desktop: Story = {};
export const Mobile: Story = { globals: mobile };
export const Loading: Story = { args: { state: "loading" } };
export const NotInvited: Story = { args: { state: "not-invited" } };
export const NotInvitedMobile: Story = { args: { state: "not-invited" }, globals: mobile };
/** First visit in iPhone Safari, before the app is on the Home Screen. */
export const AddToHomeScreenHint: Story = { args: { showInstallHint: true }, globals: mobile };
