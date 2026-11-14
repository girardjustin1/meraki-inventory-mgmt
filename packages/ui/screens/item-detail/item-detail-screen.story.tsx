import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ItemDetailScreen } from "./item-detail-screen";

const meta: Meta<typeof ItemDetailScreen> = { title: "Screens/Stock/Item detail", component: ItemDetailScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ItemDetailScreen>;

/** A counted supply with four order cycles of history, a barcode and a product photo. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** A bucket tracked by fill level: four-segment meter, reorder at half, no usage forecast. */
export const FillLevelItem: Story = { args: { itemId: "sup-kds-orange-sugar-scrub" } };

/** A polish colour: swatch, colour code and SKU. Polish has no usage forecast yet. */
export const PolishItem: Story = { args: { itemId: "pol-opi-wh02" } };

/** A supply that has never been on an order, so the forecast falls back to the par level. */
export const NoHistory: Story = { args: { itemId: "sup-seche-vite-top-coat-refill" } };

/** The adjust dialog: adjust by or set to, a required reason, and the result shown before saving. */
export const Adjusting: Story = { args: { adjusting: true } };

/** Every 2026 order line for this item, with what was received and when. */
export const OrdersTab: Story = { args: { initialTab: "orders" } };

/** Par level, par rule, vendor, unit and the reorder pause. */
export const SettingsTab: Story = { args: { initialTab: "settings" } };

/** Flags raised for this item. */
export const FlagsTab: Story = { args: { initialTab: "flags" } };
