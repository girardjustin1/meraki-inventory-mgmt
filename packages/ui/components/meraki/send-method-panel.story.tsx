import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CURRENT_USER, purchaseOrders, vendorById } from "@/data/inventory";
import type { PurchaseOrder, PurchaseOrderLine, Vendor } from "@/data/types";
import type { SendMethod } from "@/engine/order-send";
import type { SentVia } from "./send-method-panel";
import { SENT_VIA_LABEL, SendMethodPanel } from "./send-method-panel";
import { bestSendOption } from "./send-option-list";

const pick = (id: string) => purchaseOrders.find((po) => po.id === id) ?? (purchaseOrders[0] as PurchaseOrder);

const nailSupply = pick("lynnfield-2026-11-supply-nail-supply-store");
const amazon = pick("lynnfield-2026-11-supply-amazon");
const costco = pick("lynnfield-2026-11-supply-costco-bjs");
const dazzleDry = pick("lynnfield-2026-04-supply-dazzle-dry");
const warehouse = pick("newburyport-2026-08-supply-warehouse");

interface DemoProps {
    po: PurchaseOrder;
    vendor: Vendor;
    initialMethod?: SendMethod;
    variantIdFor?: (line: PurchaseOrderLine) => string | undefined;
}

/** Holds the chosen method and shows what `onSent` reported. */
const Demo = ({ po, vendor, initialMethod, variantIdFor }: DemoProps) => {
    const [method, setMethod] = useState<SendMethod>(initialMethod ?? bestSendOption(vendor).method);
    const [via, setVia] = useState<SentVia | null>(null);
    return (
        <div className="flex flex-col gap-4">
            <SendMethodPanel
                po={po}
                vendor={vendor}
                sender={CURRENT_USER}
                method={method}
                onMethodChange={setMethod}
                onSent={setVia}
                variantIdFor={variantIdFor}
            />
            {via && <p className="text-sm text-tertiary">onSent: {SENT_VIA_LABEL[via]}</p>}
        </div>
    );
};

const meta: Meta<typeof Demo> = {
    title: "Meraki/Send method panel",
    component: Demo,
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset lg:p-5">
                <Story />
            </div>
        ),
    ],
    args: { po: nailSupply, vendor: vendorById(nailSupply.vendorId), initialMethod: "email" },
};

export default meta;
type Story = StoryObj<typeof Demo>;

/** Emailed purchase order to the nail supply store. */
export const Email: Story = {};

/** Costco / BJ's: a pick list for the store run. */
export const InStorePickList: Story = { args: { po: costco, vendor: vendorById(costco.vendorId), initialMethod: undefined } };

/** Amazon: the API is not connected, so the order goes by email or is placed by hand. */
export const AmazonNotConnected: Story = { args: { po: amazon, vendor: vendorById(amazon.vendorId), initialMethod: undefined } };

/** Dazzle Dry: the cart link is not set up, with what it would take and which lines it would miss. */
export const CartLinkNotSetUp: Story = { args: { po: dazzleDry, vendor: vendorById(dazzleDry.vendorId), initialMethod: undefined } };

/**
 * What the cart link looks like once a store address and product links exist. The address and the
 * product ids here are made up for the story: one line is left without a link to show the "add by hand" list.
 */
export const CartLinkReady: Story = {
    args: {
        po: dazzleDry,
        vendor: { ...vendorById(dazzleDry.vendorId), storeUrl: "https://pro.example.com" },
        initialMethod: undefined,
        variantIdFor: (line) => (line.id === dazzleDry.lines[0]?.id ? undefined : `4000000000${line.id.replace(/\D/g, "")}`),
    },
};

/** Internal transfer from the Meraki warehouse to Newburyport. */
export const Transfer: Story = { args: { po: warehouse, vendor: vendorById(warehouse.vendorId), initialMethod: undefined } };
