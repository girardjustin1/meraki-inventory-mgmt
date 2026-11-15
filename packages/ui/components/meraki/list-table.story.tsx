import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Download01, UserCheck01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { countSessions, userById } from "@/data/inventory";
import type { CountSession } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { BulkActionBar } from "./bulk-action-bar";
import type { ListColumn, ListNoticeContent } from "./list-table";
import { BULK_BAR_OVER_HEADER, ListCards, ListEmpty, ListNotice, ListTable, RowLink, SelectModeRow, plural, useListSelection } from "./list-table";
import { CountStatusBadge } from "./status-badges";

const COLUMNS: ListColumn<CountSession>[] = [
    { id: "count", label: "Count", primary: true, cell: (c) => <RowLink href={`#${c.id}`}>{c.name}</RowLink> },
    { id: "status", label: "Status", cell: (c) => <CountStatusBadge status={c.status} /> },
    { id: "assignee", label: "Assigned to", cell: (c) => userById(c.assignedTo)?.name },
    { id: "due", label: "Due", cell: (c) => formatDate(c.dueAt) },
    { id: "lines", label: "Lines", align: "right", tooltip: "Items on the count sheet.", cell: (c) => c.lines.length },
];

interface DemoProps {
    /** Rows ticked on first render. */
    selected?: string[];
    /** Show the empty state instead of rows. */
    empty?: boolean;
}

const Demo = ({ selected = [], empty }: DemoProps) => {
    const isDesktop = useBreakpoint("lg");
    const rows = empty ? [] : countSessions;
    const selection = useListSelection(
        rows.map((c) => c.id),
        selected,
    );
    const [selectMode, setSelectMode] = useState(selected.length > 0);
    const [notice, setNotice] = useState<ListNoticeContent | null>(null);
    const say = (what: string) => () => setNotice({ text: `${what}: ${plural(selection.count, "count")}.`, onUndo: () => setNotice(null) });
    const bar = (className?: string) => (
        <BulkActionBar
            count={selection.count}
            noun="count"
            totalMatching={rows.length}
            onSelectAll={selection.selectAll}
            onClear={() => {
                selection.clear();
                setSelectMode(false);
            }}
            onToggleAll={isDesktop ? selection.toggleAll : undefined}
            actions={[
                { id: "assign", label: "Assign to…", icon: UserCheck01, onAction: say("Assigned") },
                { id: "export", label: "Export CSV", icon: Download01, onAction: say("Exported") },
            ]}
            className={className}
        />
    );

    if (rows.length === 0) {
        return (
            <ListEmpty title="No counts match" action={<Button color="secondary">Clear search and filters</Button>}>
                Nothing fits this search and these filters.
            </ListEmpty>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {isDesktop ? (
                <ListTable
                    label="Counts"
                    noun="counts"
                    rows={rows}
                    rowId={(c) => c.id}
                    rowName={(c) => c.name}
                    columns={COLUMNS}
                    selection={selection}
                    bulkBar={bar(BULK_BAR_OVER_HEADER)}
                />
            ) : (
                <>
                    <SelectModeRow
                        summary={plural(rows.length, "count")}
                        selectMode={selectMode}
                        onToggle={() => {
                            if (selectMode) selection.clear();
                            setSelectMode(!selectMode);
                        }}
                    />
                    <ListCards
                        label="Counts"
                        rows={rows}
                        rowId={(c) => c.id}
                        href={(c) => `#${c.id}`}
                        selection={selection}
                        selectMode={selectMode}
                        onSelectMode={setSelectMode}
                        card={(c) => (
                            <span className="flex flex-col gap-1">
                                <span className="truncate text-sm font-semibold text-primary">{c.name}</span>
                                <span className="flex items-center gap-2 text-xs text-tertiary">
                                    <CountStatusBadge status={c.status} />
                                    {userById(c.assignedTo)?.name} · {formatDate(c.dueAt)}
                                </span>
                            </span>
                        )}
                    />
                    {bar()}
                </>
            )}
            <ListNotice notice={notice} onDismiss={() => setNotice(null)} />
        </div>
    );
};

const meta: Meta<typeof Demo> = {
    title: "Meraki/List table",
    component: Demo,
    tags: ["autodocs"],
    parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Demo>;

/** One line per row. A click anywhere on a row follows its link; Shift-click a checkbox to select a range. */
export const Default: Story = {};

/** With rows selected the bulk bar lies over the column headers. */
export const Selected: Story = { args: { selected: ["cs-lyn-cleaning", "cs-lyn-wax"] } };

/** Nothing to list: why, and the way back. */
export const Empty: Story = { args: { empty: true } };

/** On a phone the rows are compact cards. "Select", or a long press, starts selecting. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
