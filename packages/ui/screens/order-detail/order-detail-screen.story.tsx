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

/** A draft: quantities are typed in the table, lines removed, and items added from the search row under the lines. */
export const Draft: Story = { args: { orderId: draft?.id } };

/** The same draft with edits not saved yet: one quantity changed and one line removed raise the save bar. */
export const Unsaved: Story = { args: { orderId: draft?.id, pending: { quantities: { l1: 5 }, removed: ["l3"] } } };

/** Everything that is not the next step lives in one menu. */
export const MoreActions: Story = { args: { orderId: draft?.id, moreOpen: true } };

/** Adding to a draft: the picker opens on the order's vendor, with the lines already on it marked. */
export const AddingItems: Story = { args: { orderId: draft?.id, pickerOpen: true } };

/** March supply order from the 2026 backlog, every line received. */
export const ReceivedImported: Story = { args: { orderId: receivedImported?.id } };

/** July polish order from the backlog: 74 lines, most never marked received, with flags attached. */
export const PartiallyReceived: Story = { args: { orderId: partiallyReceived?.id } };

/** The November order once approved (shown as approved for this story): the manager sends it from its own page, here by email. */
export const SendByEmail: Story = { args: { orderId: "lynnfield-2026-11-supply-nail-supply-store", status: "approved", sendMethod: "email" } };
