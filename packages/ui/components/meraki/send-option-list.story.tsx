import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { vendorById } from "@/data/inventory";
import type { Vendor } from "@/data/types";
import type { SendMethod } from "@/engine/order-send";
import { SendOptionList, bestSendOption } from "./send-option-list";

/** Holds the choice so the cards can be clicked in Storybook. */
const Controlled = ({ vendor, isDisabled }: { vendor: Vendor; isDisabled?: boolean }) => {
    const [method, setMethod] = useState<SendMethod>(bestSendOption(vendor).method);
    return <SendOptionList vendor={vendor} value={method} onChange={setMethod} isDisabled={isDisabled} />;
};

const meta: Meta<typeof SendOptionList> = {
    title: "Meraki/Send option list",
    component: SendOptionList,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl">
                <Story />
            </div>
        ),
    ],
    args: { vendor: vendorById("nail-supply-store") },
    render: (args) => <Controlled key={args.vendor.id} vendor={args.vendor} isDisabled={args.isDisabled} />,
};

export default meta;
type Story = StoryObj<typeof SendOptionList>;

/** Local nail supply store: bought in person, so the pick list is suggested and email is the fallback. */
export const InStoreVendor: Story = {};

/** Amazon: the API option is listed but cannot be chosen until Amazon approves access. */
export const ApiNotConnected: Story = { args: { vendor: vendorById("amazon") } };

/** Dazzle Dry: the store takes cart links, but no store address is saved yet. */
export const CartLinkNotSetUp: Story = { args: { vendor: vendorById("dazzle-dry") } };

/** With a store address saved, the cart link becomes the suggested option. The address here is a placeholder. */
export const CartLinkReady: Story = { args: { vendor: { ...vendorById("dazzle-dry"), storeUrl: "https://pro.example.com" } } };

/** Internal transfer from the Meraki warehouse. */
export const Transfer: Story = { args: { vendor: vendorById("warehouse") } };

/** A vendor with no order email on file: email is still offered, with a note. */
export const EmailOnly: Story = { args: { vendor: vendorById("other") } };

/** Read-only, for an order that is not approved yet. */
export const Disabled: Story = { args: { isDisabled: true } };
