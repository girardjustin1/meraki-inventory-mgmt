import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { stock, stockRows, userById } from "@/data/inventory";
import { ItemDetailScreen } from "./item-detail-screen";

const meta: Meta<typeof ItemDetailScreen> = { title: "Screens/Stock/Item detail", component: ItemDetailScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof ItemDetailScreen>;

/** A counted supply with four order cycles of history, a barcode and a product photo. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** A bucket tracked by fill level: par is "Full", reorder at half, no usage to project. */
export const FillLevelItem: Story = { args: { itemId: "sup-kds-orange-sugar-scrub" } };

/** An OPI colour stocked in three finishes: swatch and finish chips by the title, a row per finish, and the per-colour forecast. */
export const PolishItem: Story = { args: { itemId: "pol-opi-wh02" } };

/** Adjusting one finish: the number is its backstock, the open bottle is a switch, and the colour total follows. */
export const PolishVariantAdjusting: Story = { args: { itemId: "pol-opi-wh02", adjusting: "gel" } };

/** Dip powder is its own item, with a link back to the lacquer colour that shares its code. */
export const DipPowderItem: Story = { args: { itemId: "pol-opi-dip-wh02" } };

/** An OPI colour that is not offered in gel: one finish row, no dip link. */
export const PolishNoGel: Story = {
    args: { itemId: stock.find((s) => s.variants?.length === 1 && s.variants[0]?.id === "regular")?.itemId },
};

/** A supply that has never been on an order, so there is no usage to project yet. */
export const NoHistory: Story = { args: { itemId: "sup-seche-vite-top-coat-refill" } };

/** The adjust dialog: adjust by or set to, a required reason, and the result shown before saving. */
export const Adjusting: Story = { args: { adjusting: true } };

/** Opened from a link to the item's orders (`?tab=orders`): the page lands on the Orders card. */
export const OrdersTab: Story = { args: { initialTab: "orders" } };

/** Opened from a link to the item's settings: par, vendor and shelf are edited in the right rail. */
export const SettingsTab: Story = { args: { initialTab: "settings" } };

/** Opened from a link to the item's flags: the page lands on the Flags card. */
export const FlagsTab: Story = { args: { initialTab: "flags" } };

/** Two rail edits pending: the save bar shows the count, and stepping to another item waits for save or discard. */
export const Unsaved: Story = { args: { initialEdits: { par: "18", vendorId: "amazon" } } };
export const UnsavedMobile: Story = {
    args: { initialEdits: { par: "18", vendorId: "amazon" } },
    globals: { viewport: { value: "mobile", isRotated: false } },
};

/** The "More actions" menu. */
export const MoreActions: Story = { args: { moreOpen: true } };

/** A technician reads the page: no adjusting, no costs, no edit controls. */
export const AsTechnician: Story = { args: { user: userById("u-tech-1") } };

/** The owner works at both locations: either on-hand number can be adjusted, and the location name switches the view. */
export const AsOwner: Story = { args: { user: userById("u-owner") } };

/** An item with stock on a recent open order. */
export const WithIncoming: Story = { args: { itemId: stockRows("lynnfield").find((r) => r.incoming > 0)?.item.id } };

/** An open order line from long ago that was never marked received: shown muted and left out of incoming. */
export const WithUnconfirmed: Story = { args: { itemId: "sup-nugenesis-base-gel-2-pink-bottle" } };
