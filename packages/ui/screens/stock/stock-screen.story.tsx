import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StockScreen } from "./stock-screen";

const meta: Meta<typeof StockScreen> = { title: "Screens/Stock/Stock list", component: StockScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof StockScreen>;

/** Supplies table, most urgent first. */
export const Desktop: Story = {};

/** Card rows grouped by area, with filters behind one button. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** The polish wall as swatches. Faded swatches are out of stock. */
export const Polish: Story = { args: { initialTab: "polish" } };

/** Gel-X tips as a shape and length by size matrix, with gaps marked. */
export const Tips: Story = { args: { initialTab: "tips" } };

/** The list a manager orders from: low items that need reordering. */
export const LowStockOnly: Story = { args: { initialStatus: "low", initialReorderOnly: true } };

/** Newburyport: sample stock, forecasts borrowed from Lynnfield. */
export const Newburyport: Story = { args: { location: "newburyport" } };
