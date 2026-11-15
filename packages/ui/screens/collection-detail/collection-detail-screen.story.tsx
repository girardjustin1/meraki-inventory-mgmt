import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { CollectionDetailScreen } from "./collection-detail-screen";

const meta: Meta<typeof CollectionDetailScreen> = {
    title: "Screens/Stock/Collection detail",
    component: CollectionDetailScreen,
    parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof CollectionDetailScreen>;

const technician = users.find((u) => u.role === "technician") as User;
const newburyportManager = users.find((u) => u.role === "manager" && u.locations.includes("newburyport")) as User;

/** Pedicure station: a hand-picked service kit. Rows can be reordered and removed. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** OPI pinks: two rules choose 35 colours. Each colour shows its finishes as chips. */
export const SmartCollection: Story = { args: { collectionId: "col-opi-pinks" } };

/** The weekly class A count list. */
export const CountList: Story = { args: { collectionId: "col-class-a" } };

/** A manual collection with nothing in it yet. */
export const Empty: Story = { args: { collectionId: "col-empty" } };

/** The add-items dialog: search, tick, and a footer that keeps count. */
export const AddingItems: Story = { args: { addingItems: true } };

/** A rule being added to a smart collection. */
export const EditingRules: Story = { args: { collectionId: "col-opi-pinks", editingRules: true } };

/** Edits made and not yet saved: one bar to discard or save them. */
export const Unsaved: Story = {
    args: {
        initialChanges: { name: "Pedicure station, chairs 1 to 4", description: "What a spa pedicure uses at chairs 1 to 4. Restock before the weekend." },
    },
};
export const UnsavedMobile: Story = { ...Unsaved, globals: { viewport: { value: "mobile", isRotated: false } } };

/** A technician can see the collection but not change it, count it or order from it. */
export const AsTechnician: Story = { args: { user: technician } };

/** The same kit at the other location: quantities and status follow the location. */
export const Newburyport: Story = { args: { location: "newburyport", user: newburyportManager } };

/** A link to a collection that is not there. */
export const NotFound: Story = { args: { collectionId: "col-missing" } };
