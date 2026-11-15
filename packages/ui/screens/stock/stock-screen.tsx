"use client";

import { useState } from "react";
import { DotsHorizontal, Download01, Printer, ShoppingCart01, Upload01 } from "@untitledui/icons";
import { Tab, TabList, TabPanel, Tabs } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import { AppShell, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import type { PageSize } from "@/components/meraki/list-pagination";
import { DEFAULT_PAGE_SIZE } from "@/components/meraki/list-pagination";
import { locationName, stockRows, summary } from "@/data/inventory";
import type { LocationId, PolishLine, User, VariantId } from "@/data/types";
import { can } from "@/engine/permissions";
import { useUrlSync } from "@/utils/url-sync";
import { useViewer } from "@/utils/viewer";
import { PolishTab } from "./polish-tab";
import type { Notice } from "./stock-shared";
import { NoticeBar, plural } from "./stock-shared";
import type { StatusFilter } from "./supplies-tab";
import { SuppliesTab } from "./supplies-tab";
import { TipsTab } from "./tips-tab";

type TabId = "supplies" | "polish" | "tips";

interface StockScreenProps {
    location?: LocationId;
    /** Who is looking. Defaults to the person using the app; stories pass a sample person. */
    user?: User;
    initialTab?: TabId;
    /** Start on one status (deep link `?status=`). Low, out and no par are views; overstocked is a filter chip. */
    initialStatus?: StatusFilter;
    /** Start on the "Needs reorder" view (deep link `?reorder=1`). */
    initialReorderOnly?: boolean;
    /** Search text to start with (deep link `?q=`). */
    initialQuery?: string;
    /** Polish line to start on (deep link `?line=`). */
    initialLine?: PolishLine | "all";
    /** Open the polish wall on one finish: regular, gel or dip. */
    initialFinish?: VariantId;
    /** Page of the list to open on, counting from 1 (deep link `?page=`). Applies to the tab the screen opens on. */
    initialPage?: number;
    /** Rows per page: 10, 25, 50 or 100 (deep link `?per=`). */
    initialPageSize?: PageSize;
    /** Item ids selected on first render, which brings up the bulk bar. */
    initialSelected?: string[];
    /** Open the quantity editor on this item's row. */
    editingItemId?: string;
    /** Open the bulk quantity grid for the initial selection. */
    initialBulkEditing?: boolean;
    /** Open the columns popover. */
    initialColumnsOpen?: boolean;
}

/** Everything on the shelves at one location: supplies, the polish wall and Gel-X tips. */
export const StockScreen = ({
    location: initialLocation = "lynnfield",
    user: userProp,
    initialTab = "supplies",
    initialStatus = "all",
    initialReorderOnly = false,
    initialQuery = "",
    initialLine = "opi",
    initialFinish,
    initialPage = 1,
    initialPageSize = DEFAULT_PAGE_SIZE,
    initialSelected,
    editingItemId,
    initialBulkEditing,
    initialColumnsOpen,
}: StockScreenProps) => {
    const viewer = useViewer();
    const user = userProp ?? viewer;
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [tab, setTab] = useState<TabId>(initialTab);
    // One page size for every stock tab. The page number belongs to the list the link opened:
    // another tab, or another salon, starts at its first page.
    const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
    const [movedOn, setMovedOn] = useState(false);
    const startPage = movedOn ? 1 : initialPage;
    const [notice, setNotice] = useState<Notice | null>(null);
    useUrlSync({
        tab: tab === "supplies" ? null : tab,
        per: pageSize === DEFAULT_PAGE_SIZE ? null : pageSize,
        ...(tab === "polish" ? {} : { line: null, finish: null }),
        // The tips matrix is one page.
        ...(tab === "tips" ? { page: null } : {}),
    });
    const s = summary(location);
    const tips = stockRows(location, "tips").length;
    const canOrder = can(user, "orders.create", location);
    const canCount = can(user, "stock.count", location);
    const canImport = can(user, "stock.adjust", location);

    const more: { id: string; label: string; icon: typeof Upload01; text: string }[] = [
        ...(canImport
            ? [
                  {
                      id: "import",
                      label: "Import from spreadsheet",
                      icon: Upload01,
                      text: "Import would ask for a spreadsheet and show every change before applying it. Nothing is imported in the prototype.",
                  },
              ]
            : []),
        {
            id: "export",
            label: "Export CSV",
            icon: Download01,
            text: `${plural(s.supplies, "supply", "supplies")} at ${locationName(location)} would be exported as a CSV file. Nothing is downloaded in the prototype.`,
        },
        {
            id: "labels",
            label: "Print shelf labels",
            icon: Printer,
            text: `Shelf labels for ${locationName(location)} would go to the label printer. Nothing is printed in the prototype.`,
        },
    ];

    return (
        <AppShell
            activeUrl={ROUTES.stock}
            location={location}
            onLocationChange={(next) => {
                setLocation(next);
                setMovedOn(true);
            }}
            user={userProp}
        >
            <PageContent className="gap-4 lg:gap-5">
                <div className="flex flex-col gap-2.5">
                    <PageHeader
                        title={
                            <>
                                Stock at <em>{locationName(location)}</em>
                            </>
                        }
                        description={`${s.out} out and ${s.low} low across ${plural(s.supplies, "supply", "supplies")}. ${s.reorderLines} suggested for the next order.`}
                        actions={
                            <>
                                {canCount && (
                                    <Button href={ROUTES.counts} color="secondary" size="md" className="max-lg:min-h-11 max-lg:flex-1">
                                        Count stock
                                    </Button>
                                )}
                                {canOrder && (
                                    <Button href={ROUTES.newOrder} size="md" iconLeading={ShoppingCart01} className="max-lg:min-h-11 max-lg:flex-1">
                                        Build order
                                    </Button>
                                )}
                                <Dropdown.Root>
                                    <Button
                                        color="secondary"
                                        size="md"
                                        iconLeading={DotsHorizontal}
                                        aria-label="More actions"
                                        data-testid="more-actions"
                                        className="max-lg:min-h-11"
                                    />
                                    <Dropdown.Popover className="w-60">
                                        <Dropdown.Menu
                                            aria-label="More actions"
                                            selectionMode="none"
                                            onAction={(key) => setNotice({ text: more.find((m) => m.id === key)?.text })}
                                        >
                                            {more.map((m) => (
                                                <Dropdown.Item key={m.id} id={m.id} textValue={m.label} label={m.label} icon={m.icon} />
                                            ))}
                                        </Dropdown.Menu>
                                    </Dropdown.Popover>
                                </Dropdown.Root>
                            </>
                        }
                    />
                    <SampleDataNote>
                        Items, shelves, par levels, the polish wall and tip counts come from Meraki's spreadsheets. Most supply on-hand numbers (marked with a
                        faint dot), all Newburyport stock, count dates and usage are sample values.
                    </SampleDataNote>
                </div>

                <Tabs
                    selectedKey={tab}
                    onSelectionChange={(key) => {
                        setTab(key as TabId);
                        setMovedOn(true);
                        setNotice(null);
                    }}
                    className="gap-4"
                >
                    <TabList type="underline" size="md" aria-label="Stock type" className="scrollbar-hide overflow-x-auto">
                        <Tab id="supplies" label="Supplies" badge={s.supplies} />
                        <Tab id="polish" label="Polish" badge={s.polishes ? s.polishes.toLocaleString("en-US") : undefined} />
                        <Tab id="tips" label="Gel-X tips" badge={tips || undefined} />
                    </TabList>
                    <TabPanel id="supplies">
                        {/* Keyed by location so filters, edits and the selection start fresh when the salon changes. */}
                        <SuppliesTab
                            key={location}
                            location={location}
                            user={user}
                            initialStatus={initialStatus}
                            initialReorderOnly={initialReorderOnly}
                            initialQuery={initialQuery}
                            initialPage={startPage}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                            initialSelected={initialSelected}
                            editingItemId={editingItemId}
                            initialBulkEditing={initialBulkEditing}
                            initialColumnsOpen={initialColumnsOpen}
                            notify={setNotice}
                        />
                    </TabPanel>
                    <TabPanel id="polish">
                        <PolishTab
                            key={location}
                            location={location}
                            user={user}
                            onViewLynnfield={() => setLocation("lynnfield")}
                            initialLine={initialLine}
                            initialFinish={initialFinish}
                            initialQuery={initialQuery}
                            initialPage={startPage}
                            pageSize={pageSize}
                            onPageSizeChange={setPageSize}
                        />
                    </TabPanel>
                    <TabPanel id="tips">
                        <TipsTab location={location} onViewLynnfield={() => setLocation("lynnfield")} />
                    </TabPanel>
                </Tabs>

                <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
            </PageContent>
        </AppShell>
    );
};
