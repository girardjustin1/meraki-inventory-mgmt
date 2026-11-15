import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { items } from "@/data/inventory";
import { OrderNewScreen } from "./order-new-screen";

const softener = items.find((i) => i.name === "Divina Cuticle Softener");

const meta: Meta<typeof OrderNewScreen> = { title: "Screens/Orders/New order", component: OrderNewScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof OrderNewScreen>;

/** Lynnfield reorder builder. Items already on a November draft are listed but left unticked. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** Newburyport has no orders in progress, so every suggestion starts ticked. */
export const Newburyport: Story = { args: { location: "newburyport" } };

/** After "Create draft orders": one draft per vendor. */
export const Created: Story = { args: { created: true } };

/** A quantity well above what is usually ordered: the line warns before the order is created, using the same rule as the flag engine. */
export const UnusualQuantity: Story = { args: { quantities: softener ? { [softener.id]: 9 } : {} } };
