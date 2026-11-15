import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { purchaseOrders, vendorById } from "@/data/inventory";
import type { PurchaseOrder } from "@/data/types";
import { PickList } from "./pick-list";

const pick = (id: string) => purchaseOrders.find((po) => po.id === id) ?? (purchaseOrders[0] as PurchaseOrder);

const costco = pick("lynnfield-2026-11-supply-costco-bjs");
const nailSupply = pick("lynnfield-2026-11-supply-nail-supply-store");

const meta: Meta<typeof PickList> = {
    title: "Meraki/Pick list",
    component: PickList,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { po: costco, vendor: vendorById(costco.vendorId) },
};

export default meta;
type Story = StoryObj<typeof PickList>;

/** The November Costco / BJ's run. Print hides everything else on the page. */
export const Costco: Story = {};

/** Fourteen lines for the local nail supply store, with the shelf each item is kept on. */
export const NailSupplyStore: Story = { args: { po: nailSupply, vendor: vendorById(nailSupply.vendorId) } };
