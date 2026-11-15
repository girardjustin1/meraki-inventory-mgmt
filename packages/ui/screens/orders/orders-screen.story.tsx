import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userById } from "@/data/inventory";
import { OrdersScreen } from "./orders-screen";

const meta: Meta<typeof OrdersScreen> = { title: "Screens/Orders/Orders", component: OrdersScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof OrdersScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** The three November orders at Lynnfield that still need something: one awaiting approval, one draft, one approved. */
const NOVEMBER = ["lynnfield-2026-11-supply-nail-supply-store", "lynnfield-2026-11-supply-amazon", "lynnfield-2026-11-supply-costco-bjs"];

/** Lynnfield, opening on what needs action. One line per order; the whole row opens it. */
export const Desktop: Story = {};

/** Compact cards, with filters behind one button and "Select" to start picking orders. */
export const Mobile: Story = { globals: mobile };

/** Rows selected by the owner: the bulk bar takes the place of the column headers. Approve skips what is not waiting for approval. */
export const Selected: Story = { args: { user: userById("u-owner"), initialSelected: NOVEMBER } };

/** Selection on a phone: the bulk bar docks above the tab bar. */
export const MobileSelected: Story = { args: { user: userById("u-owner"), initialSelected: NOVEMBER.slice(0, 2) }, globals: mobile };

/** Search and filters that match nothing: the empty state offers the way back. */
export const NoMatches: Story = { args: { tab: "open", initialQuery: "acetone", initialFilters: { vendor: ["costco-bjs"] } } };

/** Orders that were placed and are still waiting on deliveries, most overdue first. */
export const OpenTab: Story = { args: { tab: "open", initialSort: "expected" } };

export const AllOrders: Story = { args: { tab: "all" } };

/** Newburyport, as its manager: one order form on file, so the list is short. */
export const Newburyport: Story = { args: { location: "newburyport", user: userById("u-mgr-nbp") } };

/** Front desk sees orders but not costs: no Total column, and the only bulk action is the export. */
export const AsFrontDesk: Story = { args: { user: userById("u-fd-lyn"), tab: "all", initialSelected: NOVEMBER.slice(0, 2) } };

/** A technician's role does not include purchase orders, so the list is not shown. */
export const AsTechnician: Story = { args: { user: userById("u-tech-1") } };
