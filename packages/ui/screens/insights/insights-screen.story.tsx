import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InsightsScreen } from "./insights-screen";

const meta: Meta<typeof InsightsScreen> = { title: "Screens/Insights/Insights", component: InsightsScreen, parameters: { layout: "fullscreen" } };
export default meta;
type Story = StoryObj<typeof InsightsScreen>;

const mobile = { viewport: { value: "mobile", isRotated: false } };

/** Overview: the six strongest findings, then what data they rest on. */
export const Desktop: Story = {};
export const Mobile: Story = { globals: mobile };

/** Forecast per product. Select a row on desktop to open the chart and the reorder maths. */
export const Products: Story = { args: { initialTab: "products" } };
export const ProductsMobile: Story = { args: { initialTab: "products" }, globals: mobile };

/** Demand and forecast per colour, the family mix by order cycle, and colours left off recent orders. */
export const Colours: Story = { args: { initialTab: "colours" } };
export const ColoursMobile: Story = { args: { initialTab: "colours" }, globals: mobile };

/** Seasonality cannot be measured from five order cycles, and the tab says so. */
export const Seasonality: Story = { args: { initialTab: "seasonality" } };

/** Cost-per-service calculator on example recipes and sample costs. */
export const Profitability: Story = { args: { initialTab: "profitability" } };

/** The 90-day reorder timeline, with the quoted lead time against the measured order cycle. */
export const Planning: Story = { args: { initialTab: "planning" } };
export const PlanningMobile: Story = { args: { initialTab: "planning" }, globals: mobile };

/** Newburyport has one order form on file: forecasts are borrowed from Lynnfield and most colour insights explain what is missing. */
export const Newburyport: Story = { args: { location: "newburyport" } };
