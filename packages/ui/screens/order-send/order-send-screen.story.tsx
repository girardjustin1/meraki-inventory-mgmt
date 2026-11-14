import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OrderSendScreen } from "./order-send-screen";

/** The three November orders for Lynnfield in the sample data. */
const NAIL_SUPPLY = "lynnfield-2026-11-supply-nail-supply-store";
const AMAZON = "lynnfield-2026-11-supply-amazon";
const COSTCO = "lynnfield-2026-11-supply-costco-bjs";
/** April's Dazzle Dry order from the 2026 backlog. No Dazzle Dry or FarmHouse Fresh order is waiting in the sample data. */
const DAZZLE_DRY = "lynnfield-2026-04-supply-dazzle-dry";

const meta: Meta<typeof OrderSendScreen> = { title: "Screens/Orders/Send orders", component: OrderSendScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof OrderSendScreen>;

/** Lynnfield's November orders: one still waiting for approval (locked), two that can go out. Opens on the first that can. */
export const Desktop: Story = {};

/** On a phone the list comes first. Tapping an order opens it as its own step. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** The phone step for one order: its lines, the ways to send it and the email draft. */
export const MobileOrder: Story = {
    args: { treatAsApproved: [NAIL_SUPPLY], initialOrderId: NAIL_SUPPLY, initialMethod: "email" },
    globals: { viewport: { value: "mobile", isRotated: false } },
};

/** The nail supply store order, shown as approved, opened on the email draft. The vendor address is a placeholder. */
export const EmailDraft: Story = { args: { treatAsApproved: [NAIL_SUPPLY], initialOrderId: NAIL_SUPPLY, initialMethod: "email" } };

/**
 * Dazzle Dry's store takes cart links, but no store address or product links are saved, so the
 * screen says what is missing and falls back to email. April's order is reopened as approved for this story.
 */
export const CartLinkNotSetUp: Story = { args: { orderIds: [DAZZLE_DRY], treatAsApproved: [DAZZLE_DRY], initialOrderId: DAZZLE_DRY } };

/** Costco / BJ's is bought in person, so the order becomes a pick list to print or tick off on a phone. */
export const PickList: Story = { args: { initialOrderId: COSTCO } };

/** Amazon: the API is listed as not connected, and the order goes by email or is placed by hand. */
export const AmazonNotConnected: Story = { args: { treatAsApproved: [AMAZON], initialOrderId: AMAZON } };

/** Every order marked as sent: the strip turns into the hand-off to receiving. */
export const AllSent: Story = {
    args: {
        treatAsApproved: [NAIL_SUPPLY],
        initialSent: {
            [NAIL_SUPPLY]: { via: "resend", at: "9:12 AM" },
            [AMAZON]: { via: "website", at: "9:20 AM" },
            [COSTCO]: { via: "in-store", at: "1:45 PM" },
        },
    },
};

/** Newburyport has nothing waiting to go out. */
export const Newburyport: Story = { args: { location: "newburyport" } };
