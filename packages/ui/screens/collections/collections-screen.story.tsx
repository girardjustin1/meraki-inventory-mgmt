import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { CollectionsScreen } from "./collections-screen";

const meta: Meta<typeof CollectionsScreen> = { title: "Screens/Stock/Collections", component: CollectionsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof CollectionsScreen>;

const technician = users.find((u) => u.role === "technician") as User;

/** Every collection, with what each holds at Lynnfield. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };

/** The "Service kits" view preselected. */
export const ServiceKits: Story = { args: { initialView: "service-kit" } };

/** The dialog to create one: name, description, what it is for, and how items get in. */
export const NewCollection: Story = { args: { creating: true } };

/** Item counts follow the location. The polish wall is at Lynnfield, so "OPI pinks" is empty here. */
export const Newburyport: Story = { args: { location: "newburyport" } };

/** A search that matches nothing. */
export const NoMatches: Story = { args: { initialQuery: "lash room" } };

/** A technician can open collections but not create them. */
export const AsTechnician: Story = { args: { user: technician } };
