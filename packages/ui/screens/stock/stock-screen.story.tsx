import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userById } from "@/data/inventory";
import { StockScreen } from "./stock-screen";

const meta: Meta<typeof StockScreen> = { title: "Screens/Stock/Stock list", component: StockScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof StockScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** A few of the most urgent supplies at Lynnfield, from three vendors. */
const SOME = [
    "sup-chrome-base",
    "sup-clear-trash-bag-rolls-5-gallon",
    "sup-cuticle-oil",
    "sup-nugenesis-activator-liquid-3-blue-bottle",
    "sup-berkley-jensen-toilet-paper-ultra-soft",
];

/** Supplies table, most urgent first. One line per row; the on hand number is a button. */
export const Desktop: Story = {};

/** Compact cards with the same click-to-edit quantity, and filters behind one button. */
export const Mobile: Story = { globals: mobile };

/** The polish wall as swatches. Faded swatches are out of stock. */
export const Polish: Story = { args: { initialTab: "polish" } };

/** The wall filtered to one finish: gel bottles only, each count editable in place. */
export const PolishGel: Story = { args: { initialTab: "polish", initialFinish: "gel" } };

/** Gel-X tips as a shape and length by size matrix, with gaps marked. */
export const Tips: Story = { args: { initialTab: "tips" } };

/** The list a manager orders from: low items that need reordering. */
export const LowStockOnly: Story = { args: { initialStatus: "low", initialReorderOnly: true } };

/** Newburyport, as its manager: sample stock, forecasts borrowed from Lynnfield. */
export const Newburyport: Story = { args: { location: "newburyport", user: userById("u-mgr-nbp") } };

/** Rows selected: the bulk bar takes the place of the column headers. */
export const Selected: Story = { args: { initialSelected: SOME } };

/** The spreadsheet-style grid, opened from "Edit quantities" in the bulk bar. */
export const BulkEditing: Story = { args: { initialSelected: SOME, initialBulkEditing: true } };

/** The quantity editor open on one row: adjust by or new quantity, a reason, and a note for bigger changes. */
export const EditingQuantity: Story = { args: { editingItemId: "sup-nugenesis-base-gel-2-pink-bottle" } };

/** The columns popover. Area, vendor, value and the rest are off until ticked. */
export const ColumnsOpen: Story = { args: { initialColumnsOpen: true } };

/** A technician sees plain numbers and can still select rows to export or print labels. */
export const AsTechnician: Story = { args: { user: userById("u-tech-1") } };

/** Selection on a phone: the bulk bar docks above the tab bar. */
export const MobileSelected: Story = { args: { initialSelected: SOME.slice(0, 3) }, globals: mobile };
