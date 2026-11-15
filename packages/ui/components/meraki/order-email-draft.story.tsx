import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CURRENT_USER, purchaseOrders, vendorById } from "@/data/inventory";
import type { PurchaseOrder } from "@/data/types";
import { OrderEmailDraft } from "./order-email-draft";

const pick = (id: string) => purchaseOrders.find((po) => po.id === id) ?? (purchaseOrders[0] as PurchaseOrder);

const november = pick("lynnfield-2026-11-supply-nail-supply-store");
const amazon = pick("lynnfield-2026-11-supply-amazon");
const longPolish = pick("lynnfield-2026-07-polish-nail-supply-store");

const meta: Meta<typeof OrderEmailDraft> = {
    title: "Meraki/Order email draft",
    component: OrderEmailDraft,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { po: november, vendor: vendorById(november.vendorId), locationName: "Meraki Lynnfield", sender: CURRENT_USER },
};

export default meta;
type Story = StoryObj<typeof OrderEmailDraft>;

/** November supply order to the nail supply store. The address is a placeholder from the sample data. */
export const Default: Story = {};

/** No order email on file: the engine's note shows under "To" and the person types an address. */
export const NoEmailOnFile: Story = { args: { po: amazon, vendor: vendorById(amazon.vendorId) } };

/** A 64-line polish order is too long for a mailto link, so "Open in my mail app" is off and Copy takes its place. */
export const TooLongForMailApp: Story = { args: { po: longPolish, vendor: vendorById(longPolish.vendorId) } };
