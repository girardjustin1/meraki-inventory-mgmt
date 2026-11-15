import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CURRENT_USER } from "@/data/inventory";
import { ReceiveScreen } from "./receive-screen";

const meta: Meta<typeof ReceiveScreen> = { title: "Screens/Receiving/Receive delivery", component: ReceiveScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ReceiveScreen>;

/** An open supply order from Nail Supply Store: 15 lines, nothing received yet. */
const SUPPLY_ORDER = "lynnfield-2026-07-supply-nail-supply-store";
/** An OPI order where 5 of 64 colours have arrived, some as a different type than ordered. */
const POLISH_ORDER = "lynnfield-2026-07-polish-nail-supply-store";

export const Desktop: Story = { args: { orderId: SUPPLY_ORDER } };
export const Mobile: Story = { args: { orderId: SUPPLY_ORDER }, globals: { viewport: { value: "mobile", isRotated: false } } };
/** No order picked yet: the deliveries this location is waiting for. */
export const OrderList: Story = {};
export const OrderListMobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
/** Part of the box entered: full lines, one short with a damaged unit, one over, and a polish that arrived as a different type. */
export const PartialReceipt: Story = { args: { orderId: POLISH_ORDER, prefill: "partial" } };
/** The signed-in manager placed this order, so the screen is read only for them. */
export const BlockedSameUser: Story = { args: { orderId: SUPPLY_ORDER, user: CURRENT_USER } };
