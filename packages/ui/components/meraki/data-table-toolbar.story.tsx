import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DataTableToolbar } from "./data-table-toolbar";
import type { ActiveFilters, DataTableToolbarProps } from "./data-table-toolbar";

const VIEWS = [
    { id: "all", label: "All", count: 145 },
    { id: "low", label: "Low", count: 36 },
    { id: "out", label: "Out", count: 4 },
    { id: "reorder", label: "Needs reorder", count: 39 },
    { id: "no-par", label: "No par", count: 28 },
];

const FILTERS = [
    {
        id: "area",
        label: "Area",
        options: [
            { id: "Nail Area", label: "Nail Area", count: 41 },
            { id: "Supply Closet", label: "Supply Closet", count: 62 },
            { id: "Cleaning Closet", label: "Cleaning Closet", count: 42 },
        ],
    },
    {
        id: "vendor",
        label: "Vendor",
        options: [
            { id: "nail-supply-store", label: "Nail Supply Store", count: 98 },
            { id: "amazon", label: "Amazon", count: 27 },
            { id: "costco-bjs", label: "Costco / BJ's", count: 20 },
        ],
    },
    {
        id: "abc",
        label: "ABC class",
        options: [
            { id: "A", label: "A: count weekly" },
            { id: "B", label: "B: count monthly" },
            { id: "C", label: "C: count quarterly" },
        ],
    },
];

const SORTS = [
    { id: "urgent", label: "Most urgent first" },
    { id: "name", label: "Name, A to Z" },
    { id: "on-hand", label: "On hand, low to high" },
];

const COLUMNS = [
    { id: "item", label: "Item", locked: true },
    { id: "status", label: "Status" },
    { id: "on-hand", label: "On hand", locked: true },
    { id: "incoming", label: "Incoming" },
    { id: "par", label: "Par" },
    { id: "vendor", label: "Vendor" },
    { id: "counted", label: "Last counted" },
];

const Controlled = (props: Partial<DataTableToolbarProps>) => {
    const [view, setView] = useState(props.view ?? "all");
    const [query, setQuery] = useState(props.query ?? "");
    const [activeFilters, setActiveFilters] = useState<ActiveFilters>(props.activeFilters ?? {});
    const [sort, setSort] = useState("urgent");
    const [visible, setVisible] = useState(["status", "incoming", "par"]);
    return (
        <DataTableToolbar
            label="supplies"
            views={VIEWS}
            filters={FILTERS}
            sorts={SORTS}
            columns={COLUMNS}
            {...props}
            view={view}
            onViewChange={setView}
            query={query}
            onQueryChange={setQuery}
            activeFilters={activeFilters}
            onFiltersChange={setActiveFilters}
            sort={sort}
            onSortChange={setSort}
            visibleColumns={visible}
            onColumnsChange={setVisible}
        />
    );
};

const meta: Meta<typeof DataTableToolbar> = {
    title: "Meraki/Data table toolbar",
    component: DataTableToolbar,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
    render: (args) => <Controlled {...args} />,
};

export default meta;
type Story = StoryObj<typeof DataTableToolbar>;

/** View picker, search, Add filter, sort and columns in one bar. */
export const Default: Story = {};

/** Active filters sit under the bar as removable chips. */
export const WithFilters: Story = {
    args: { view: "low", query: "gel", activeFilters: { area: ["Nail Area", "Supply Closet"], vendor: ["amazon"] }, summary: "7 of 145 supplies" },
};

/** The columns popover: tick to show a column. Locked columns cannot be hidden. */
export const ColumnsOpen: Story = { args: { defaultColumnsOpen: true } };

/** A list with only search and views. */
export const SearchOnly: Story = { args: { filters: [], sorts: [], columns: [] } };

/** On a phone: view picker, search and one Filters button that opens a sheet. */
export const Mobile: Story = {
    args: { activeFilters: { area: ["Nail Area"] } },
    globals: { viewport: { value: "mobile", isRotated: false } },
};
