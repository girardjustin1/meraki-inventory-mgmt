import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { itemLedger } from "@/data/inventory";
import type { StockMovement } from "@/data/types";
import { LedgerList } from "./ledger-list";

const every: StockMovement[] = [
    {
        id: "m1",
        itemId: "x",
        locationId: "lynnfield",
        type: "adjust",
        delta: -3,
        balance: 4,
        reason: "suspected-theft",
        userId: "u-mgr-lyn",
        at: "2026-11-13T16:30:00Z",
        note: "Three missing after Saturday close. Camera footage requested.",
        isSample: true,
    },
    {
        id: "m2",
        itemId: "x",
        locationId: "lynnfield",
        type: "transfer-out",
        delta: -2,
        balance: 7,
        reason: "transfer",
        userId: "u-mgr-lyn",
        at: "2026-11-11T12:00:00Z",
        note: "Sent to Newburyport for the weekend.",
        isSample: true,
    },
    {
        id: "m3",
        itemId: "x",
        locationId: "lynnfield",
        type: "count",
        delta: 0,
        balance: 9,
        reason: "cycle-count",
        userId: "u-fd-lyn",
        at: "2026-11-08T09:10:00Z",
        isSample: true,
    },
    {
        id: "m4",
        itemId: "x",
        locationId: "lynnfield",
        type: "use",
        delta: -1,
        balance: 9,
        reason: "used-in-service",
        userId: "u-tech-1",
        at: "2026-11-06T19:30:00Z",
        isSample: true,
    },
    {
        id: "m5",
        itemId: "x",
        locationId: "lynnfield",
        type: "receive",
        delta: 6,
        balance: 10,
        reason: "received-order",
        userId: "u-fd-lyn",
        at: "2026-10-28T15:00:00Z",
        purchaseOrderId: "lynnfield-2026-07-supply-nail-supply-store",
        isSample: false,
    },
    {
        id: "m6",
        itemId: "x",
        locationId: "lynnfield",
        type: "transfer-in",
        delta: 2,
        balance: 4,
        reason: "transfer",
        userId: "u-mgr-nbp",
        at: "2026-10-20T10:15:00Z",
        isSample: true,
    },
];

const meta: Meta<typeof LedgerList> = {
    title: "Meraki/Ledger list",
    component: LedgerList,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    decorators: [
        (Story) => (
            <div className="max-w-2xl rounded-xl bg-primary p-5 ring-1 ring-secondary ring-inset">
                <Story />
            </div>
        ),
    ],
    args: { movements: itemLedger("sup-igel-beauty-non-cleansing-gel-top-coat", "lynnfield"), unit: "Bottle" },
};

export default meta;
type Story = StoryObj<typeof LedgerList>;

export const ItemHistory: Story = {};
export const EveryType: Story = { args: { movements: every } };
export const FillLevel: Story = {
    args: {
        fillLevel: true,
        movements: [
            {
                id: "f1",
                itemId: "x",
                locationId: "lynnfield",
                type: "adjust",
                delta: -0.25,
                balance: 0.25,
                reason: "used-in-service",
                userId: "u-tech-1",
                at: "2026-11-12T18:00:00Z",
                isSample: true,
            },
            {
                id: "f2",
                itemId: "x",
                locationId: "lynnfield",
                type: "count",
                delta: 0,
                balance: 0.5,
                reason: "cycle-count",
                userId: "u-fd-lyn",
                at: "2026-11-08T09:10:00Z",
                isSample: true,
            },
        ],
    },
};
export const Empty: Story = { args: { movements: [] } };
