import type { Meta } from "@storybook/nextjs-vite";
import { MerakiLogo } from "./meraki-logo";

export default {
    title: "Meraki/Foundations/Logo",
    parameters: { layout: "padded" },
} satisfies Meta;

export const Wordmark = () => (
    <div className="flex flex-col gap-8">
        <MerakiLogo className="h-10" />
        <MerakiLogo className="h-10 text-brand-700" />
        <div className="rounded-xl bg-brand-solid p-6">
            <MerakiLogo className="h-10 text-white" />
        </div>
    </div>
);
