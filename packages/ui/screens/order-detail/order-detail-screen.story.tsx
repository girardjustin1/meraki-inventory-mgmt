import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { purchaseOrders, users } from "@/data/inventory";
import type { User } from "@/data/types";
import { OrderDetailScreen } from "./order-detail-screen";

const owner = users.find((u) => u.role === "owner") as User;
const draft = purchaseOrders.find((po) => po.status === "draft");
const receivedImported =
    purchaseOrders.find((po) => po.id === "lynnfield-2026-03-supply-nail-supply-store") ?? purchaseOrders.find((po) => po.imported && po.status === "received");
const partiallyReceived =
    purchaseOrders.find((po) => po.id === "lynnfield-2026-07-polish-nail-supply-store") ?? purchaseOrders.find((po) => po.status === "partially-received");

const meta: Meta<typeof OrderDetailScreen> = { title: "Screens/Orders/Order detail", component: OrderDetailScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof OrderDetailScreen>;

/** The November supply order, seen by the manager who created it: waiting for owner approval. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** The same order as the owner, who can approve it or send it back with a note. */
export const OwnerApproval: Story = { args: { user: owner } };

/** A draft: quantities can be stepped and lines removed before it is submitted. */
export const Draft: Story = { args: { orderId: draft?.id } };

/** March supply order from the 2026 backlog, every line received. */
export const ReceivedImported: Story = { args: { orderId: receivedImported?.id } };

/** July polish order from the backlog: 74 lines, most never marked received, with flags attached. */
export const PartiallyReceived: Story = { args: { orderId: partiallyReceived?.id } };
