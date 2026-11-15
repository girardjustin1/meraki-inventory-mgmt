import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DEFAULT_PAGE_SIZE, ListPagination } from "./list-pagination";
import type { ListPaginationProps, PageSize } from "./list-pagination";

const Demo = ({ total = 333, noun = "colours", page: startPage = 1, pageSize: startSize = DEFAULT_PAGE_SIZE }: Partial<ListPaginationProps>) => {
    const [page, setPage] = useState(startPage);
    const [pageSize, setPageSize] = useState<PageSize>(startSize);
    return (
        <div className="max-w-4xl p-4">
            <ListPagination
                page={page}
                pageSize={pageSize}
                total={total}
                noun={noun}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />
        </div>
    );
};

const meta: Meta<typeof ListPagination> = {
    title: "Meraki/List pagination",
    component: ListPagination,
    render: (args) => <Demo {...args} />,
};
export default meta;
type Story = StoryObj<typeof ListPagination>;

/** 333 colours, 50 to a page: the size picker, the rows showing, and a step back or forward. */
export const Default: Story = {};

/** Ten to a page, deep into the list. */
export const ManyPages: Story = { args: { pageSize: 10, page: 17 } };

/** Everything fits on one page: both arrows are disabled, the size picker stays. */
export const OnePage: Story = { args: { total: 36, noun: "supplies" } };

/** On a phone the arrows come first and the size picker sits under them, both centred. */
export const Mobile: Story = { args: { page: 2 }, globals: { viewport: { value: "mobile1", isRotated: false } } };
