"use client";

import type { FC, ReactNode } from "react";
import { useState } from "react";
import {
    Bell01,
    CalendarCheck01,
    Clock,
    Database01,
    Download01,
    Edit01,
    File06,
    Flag01,
    Lock01,
    Mail01,
    MarkerPin01,
    Printer,
    RefreshCw01,
    Scan,
    Server01,
    ShoppingBag01,
    Truck01,
    UserCheck01,
    Zap,
} from "@untitledui/icons";
import { SlideoutMenu } from "@/components/application/slideout-menus/slideout-menu";
import { Tab, TabList, TabPanel, Tabs } from "@/components/application/tabs/tabs";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { Select } from "@/components/base/select/select";
import { TextArea } from "@/components/base/textarea/textarea";
import { Toggle } from "@/components/base/toggle/toggle";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { RealDataBadge, RoleBadge, SampleBadge } from "@/components/meraki/status-badges";
import { TODAY, getDigest, getItem, items, locations, notificationRules, purchaseOrders, vendors as seedVendors, stock } from "@/data/inventory";
import { ORDER_CHANNEL_LABEL } from "@/data/labels";
import type { LocationId, NotificationRule, OrderChannel, Vendor } from "@/data/types";
import { formatDate } from "@/engine/dates";
import { FLAG_THRESHOLDS } from "@/engine/flags";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { cx } from "@/utils/cx";
import { useUrlSync } from "@/utils/url-sync";

export type SettingsTab = "notifications" | "flag-rules" | "vendors" | "locations" | "security" | "integrations" | "data";

const TABS: { id: SettingsTab; label: string; icon: FC<{ className?: string }> }[] = [
    { id: "notifications", label: "Notifications", icon: Bell01 },
    { id: "flag-rules", label: "Flag rules", icon: Flag01 },
    { id: "vendors", label: "Vendors", icon: Truck01 },
    { id: "locations", label: "Locations and shelves", icon: MarkerPin01 },
    { id: "security", label: "Security", icon: Lock01 },
    { id: "integrations", label: "Integrations", icon: Zap },
    { id: "data", label: "Data", icon: Database01 },
];

const Notice = ({ children }: { children: ReactNode }) => (
    <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-secondary ring-1 ring-brand_alt ring-inset">
        {children}
    </p>
);

const PanelTitle = ({ title, description }: { title: string; description: string }) => (
    <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-primary">{title}</h2>
        <p className="text-sm text-tertiary">{description}</p>
    </div>
);

// ------------------------------------------------------------------------------------ notifications

const RuleRow = ({ rule, enabled, onChange }: { rule: NotificationRule; enabled: boolean; onChange: (on: boolean) => void }) => (
    <li className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-primary">{rule.label}</p>
                <p className="text-sm text-tertiary">{rule.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <Badge type="modern" color="gray" size="sm">
                    {rule.channel === "email" ? "Email" : "In the app"}
                </Badge>
                <span className="text-xs text-tertiary">to</span>
                {rule.roles.map((role) => (
                    <RoleBadge key={role} role={role} />
                ))}
            </div>
        </div>
        <Toggle size="md" aria-label={rule.label} isSelected={enabled} onChange={onChange} className="min-h-11 shrink-0 items-center" />
    </li>
);

const NotificationsPanel = () => {
    const [enabled, setEnabled] = useState<Record<string, boolean>>(Object.fromEntries(notificationRules.map((r) => [r.id, r.enabled])));
    const set = (id: string) => (on: boolean) => setEnabled((current) => ({ ...current, [id]: on }));
    const digests = notificationRules.filter((r) => r.id.endsWith("-digest"));
    const alerts = notificationRules.filter((r) => !r.id.endsWith("-digest"));
    return (
        <div className="flex flex-col gap-5">
            <PanelTitle title="Notifications" description="Alerts say something just happened. Digests are a summary on a schedule." />
            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="Alerts"
                    description="Sent when something happens. Urgent ones go out straight away; the rest are batched so nobody gets a stream of emails."
                />
                <ul className="flex flex-col divide-y divide-border-secondary">
                    {alerts.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} enabled={enabled[rule.id] ?? false} onChange={set(rule.id)} />
                    ))}
                </ul>
            </Card>
            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="Digests"
                    description="One email that covers low stock, open flags and what to order."
                    actions={
                        <Button href={ROUTES.digest} color="link-color" size="sm">
                            Preview and recipients
                        </Button>
                    }
                />
                <ul className="flex flex-col divide-y divide-border-secondary">
                    {digests.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} enabled={enabled[rule.id] ?? false} onChange={set(rule.id)} />
                    ))}
                </ul>
            </Card>
            <p className="text-sm text-tertiary">
                Email is not connected in the prototype, so these switches change nothing yet. They are saved per location once Resend and Supabase are set up.
            </p>
        </div>
    );
};

// ------------------------------------------------------------------------------------ flag rules

type ThresholdKey = keyof typeof FLAG_THRESHOLDS;

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 || h === 24 ? "AM" : "PM"}`;

const FlagRulesPanel = () => {
    const [values, setValues] = useState<Record<ThresholdKey, number>>({ ...FLAG_THRESHOLDS });
    const [saved, setSaved] = useState(false);
    const dirty = (Object.keys(FLAG_THRESHOLDS) as ThresholdKey[]).some((k) => values[k] !== FLAG_THRESHOLDS[k]);

    /** Inline number field inside a sentence. Percentages are stored as fractions and edited as whole numbers. */
    const field = (key: ThresholdKey, label: string, options: { percent?: boolean; step?: number; min?: number; max?: number } = {}) => {
        const { percent, step = 1, min = 0, max } = options;
        const shown = percent ? Math.round(values[key] * 100) : values[key];
        return (
            <input
                type="number"
                inputMode="decimal"
                aria-label={label}
                value={Number.isFinite(shown) ? shown : ""}
                min={min}
                max={max}
                step={step}
                onChange={(event) => {
                    const n = Number(event.target.value);
                    if (event.target.value === "" || Number.isNaN(n)) return;
                    setSaved(false);
                    setValues((current) => ({ ...current, [key]: percent ? n / 100 : n }));
                }}
                className={cx(
                    "mx-1 inline-block h-11 w-16 rounded-lg bg-primary px-2 text-center text-md font-semibold text-primary tabular-nums shadow-xs ring-1 ring-primary outline-hidden transition duration-100 ease-linear ring-inset focus-visible:ring-2 focus-visible:ring-brand lg:h-9",
                    values[key] !== FLAG_THRESHOLDS[key] && "ring-2 ring-brand",
                )}
            />
        );
    };

    const sample = { expected: 10, counted: Math.max(0, 10 - Math.max(values.countVarianceMinUnits, Math.ceil(10 * values.countVariancePct))) };
    const usual = 4;
    const spike = Math.max(Math.ceil(usual * values.orderSpikeMultiple), usual + values.orderSpikeMinExtraUnits);

    const rules: { id: string; title: string; sentence: ReactNode; example: string }[] = [
        {
            id: "count",
            title: "Count variance",
            sentence: (
                <>
                    Flag a count when it is off by {field("countVariancePct", "Count variance, percent", { percent: true, step: 5, max: 100 })}% or more and at
                    least {field("countVarianceMinUnits", "Count variance, minimum units")} units. Mark it high severity at{" "}
                    {field("countVarianceHighPct", "High severity count variance, percent", { percent: true, step: 5, max: 100 })}% or more.
                </>
            ),
            example: `Expected ${sample.expected}, counted ${sample.counted}: flagged. A count that is one unit out on a shelf of three is not.`,
        },
        {
            id: "spike",
            title: "Unusual order size",
            sentence: (
                <>
                    Flag an order line when it is {field("orderSpikeMultiple", "Order spike multiple", { step: 0.5, min: 1 })} times the usual quantity or more,
                    and at least {field("orderSpikeMinExtraUnits", "Order spike, extra units")} units above it.
                </>
            ),
            example: `An item usually ordered ${usual} at a time is flagged at ${spike} or more.`,
        },
        {
            id: "over",
            title: "Overstock",
            sentence: (
                <>
                    Flag an item when the shelf holds more than {field("overParMultiple", "Overstock multiple of par", { step: 0.25, min: 1 })} times its par
                    level.
                </>
            ),
            example: `With a par of 4, more than ${Math.round(4 * values.overParMultiple * 10) / 10} on the shelf is flagged.`,
        },
        {
            id: "overdue",
            title: "Order not received",
            sentence: (
                <>
                    Flag an order when lines are still open {field("overdueReceiptDays", "Days before an open order is overdue", { min: 1 })} days after it was
                    sent.
                </>
            ),
            example: "Or twice the vendor's lead time, whichever is longer, so slow vendors are not flagged early.",
        },
        {
            id: "adjust",
            title: "Stock adjustments",
            sentence: (
                <>
                    Ask for a note when an adjustment is {field("adjustmentNoteUnits", "Adjustment size that needs a note", { min: 1 })} units or more.
                    Highlight adjustments made before {field("openHour", "Opening hour, 24-hour clock", { max: 23 })} or after{" "}
                    {field("closeHour", "Closing hour, 24-hour clock", { max: 24 })} on the 24-hour clock.
                </>
            ),
            example: `Business hours are ${hourLabel(values.openHour)} to ${hourLabel(values.closeHour)}. An adjustment outside them is shown, not blocked.`,
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <PanelTitle title="Flag rules" description="A flag says what was observed and shows the numbers. These thresholds decide when one is raised." />
            <div className="flex flex-col gap-3">
                {rules.map((rule) => (
                    <Card key={rule.id} className="flex flex-col gap-2">
                        <h3 className="text-sm font-semibold text-tertiary">{rule.title}</h3>
                        <p className="text-md leading-[3.25rem] text-primary lg:leading-[2.75rem]">{rule.sentence}</p>
                        <p className="text-sm text-tertiary">{rule.example}</p>
                    </Card>
                ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button color="primary" size="lg" isDisabled={!dirty} onClick={() => setSaved(true)}>
                    Save rules
                </Button>
                <Button
                    color="secondary"
                    size="lg"
                    isDisabled={!dirty}
                    onClick={() => {
                        setValues({ ...FLAG_THRESHOLDS });
                        setSaved(false);
                    }}
                >
                    Reset to defaults
                </Button>
            </div>
            {saved && (
                <Notice>
                    Kept for this session. In the live app the rules are saved per location and every change is recorded in Activity. Existing flags are not
                    re-run.
                </Notice>
            )}
        </div>
    );
};

// ------------------------------------------------------------------------------------ vendors

const measuredLead = new Map(getDigest("monthly", "all").vendorPerformance.map((v) => [v.vendor, v.avgLeadDays]));

const LeadTime = ({ vendor }: { vendor: Vendor }) => {
    const measured = measuredLead.get(vendor.name);
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-primary tabular-nums">{vendor.leadTimeDays} days</span>
                {vendor.leadTimeIsEstimate ? (
                    <SampleBadge label="Estimate" />
                ) : (
                    <Badge type="color" color="success" size="sm">
                        Confirmed
                    </Badge>
                )}
            </div>
            {measured !== undefined && <p className="text-xs text-tertiary">2026 orders took {measured} days from form to shelf</p>}
        </div>
    );
};

const VendorDrawer = ({ vendor, onClose, onSave }: { vendor: Vendor; onClose: () => void; onSave: (vendor: Vendor) => void }) => {
    const [draft, setDraft] = useState<Vendor>(vendor);
    const measured = measuredLead.get(vendor.name);
    return (
        <>
            <SlideoutMenu.Header onClose={onClose}>
                <h2 className="text-lg font-semibold text-primary">Edit {vendor.name}</h2>
                <p className="text-sm text-tertiary">Lead time feeds every reorder point for this vendor's items.</p>
            </SlideoutMenu.Header>
            <SlideoutMenu.Content className="pt-6">
                <Input label="Name" value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />
                <Select
                    label="How orders are placed"
                    items={(Object.keys(ORDER_CHANNEL_LABEL) as OrderChannel[]).map((id) => ({ id, label: ORDER_CHANNEL_LABEL[id] }))}
                    value={draft.channel}
                    onChange={(key) => {
                        if (key) setDraft((d) => ({ ...d, channel: key as OrderChannel }));
                    }}
                >
                    {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                </Select>
                <div className="flex flex-col gap-2">
                    <Input
                        label="Lead time, in days"
                        type="number"
                        inputMode="numeric"
                        value={String(draft.leadTimeDays)}
                        onChange={(value) => setDraft((d) => ({ ...d, leadTimeDays: Math.max(0, Number(value) || 0) }))}
                        hint={
                            measured !== undefined
                                ? `Measured from your 2026 orders: about ${measured} days from order form to shelf.`
                                : "No received orders on file to measure this from yet."
                        }
                    />
                    <Checkbox
                        size="md"
                        className="min-h-11 items-center"
                        label="I have confirmed this lead time"
                        isSelected={!draft.leadTimeIsEstimate}
                        onChange={(on) => setDraft((d) => ({ ...d, leadTimeIsEstimate: !on }))}
                    />
                </div>
                <Input
                    label="Contact"
                    placeholder="Rep name, phone or email"
                    value={draft.contact ?? ""}
                    onChange={(contact) => setDraft((d) => ({ ...d, contact }))}
                />
                <TextArea label="Note" rows={3} value={draft.note ?? ""} onChange={(note) => setDraft((d) => ({ ...d, note }))} />
            </SlideoutMenu.Content>
            <SlideoutMenu.Footer className="flex justify-end gap-3">
                <Button color="secondary" size="lg" onClick={onClose}>
                    Cancel
                </Button>
                <Button color="primary" size="lg" onClick={() => onSave(draft)}>
                    Save vendor
                </Button>
            </SlideoutMenu.Footer>
        </>
    );
};

const VendorsPanel = () => {
    const [list, setList] = useState<Vendor[]>(seedVendors);
    const [editing, setEditing] = useState<Vendor>();
    const [notice, setNotice] = useState<string>();
    const itemCount = (id: string) => items.filter((i) => i.vendorId === id).length;
    return (
        <div className="flex flex-col gap-5">
            <PanelTitle title="Vendors" description="Where each order goes and how long it takes to arrive." />
            {notice && <Notice>{notice}</Notice>}
            <Card padded={false} className="overflow-hidden">
                <table className="hidden w-full border-collapse lg:table">
                    <thead className="border-b border-secondary bg-secondary">
                        <tr className="text-left text-xs font-semibold text-tertiary">
                            <th scope="col" className="px-5 py-2.5">
                                Vendor
                            </th>
                            <th scope="col" className="px-4 py-2.5">
                                Orders go by
                            </th>
                            <th scope="col" className="px-4 py-2.5">
                                Lead time
                            </th>
                            <th scope="col" className="px-4 py-2.5">
                                <span className="sr-only">Edit</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-secondary">
                        {list.map((v) => (
                            <tr key={v.id}>
                                <td className="max-w-xs px-5 py-3 align-top">
                                    <p className="text-sm font-semibold text-primary">{v.name}</p>
                                    <p className="text-xs text-tertiary">{itemCount(v.id).toLocaleString()} items</p>
                                    {v.note && <p className="mt-1 text-sm text-tertiary">{v.note}</p>}
                                </td>
                                <td className="px-4 py-3 align-top text-sm whitespace-nowrap text-secondary">{ORDER_CHANNEL_LABEL[v.channel]}</td>
                                <td className="px-4 py-3 align-top">
                                    <LeadTime vendor={v} />
                                </td>
                                <td className="px-4 py-3 text-right align-top">
                                    <Button color="secondary" size="sm" iconLeading={Edit01} onClick={() => setEditing(v)}>
                                        Edit
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <ul className="divide-y divide-border-secondary lg:hidden">
                    {list.map((v) => (
                        <li key={v.id} className="flex flex-col gap-2.5 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-primary">{v.name}</p>
                                    <p className="text-xs text-tertiary">
                                        {ORDER_CHANNEL_LABEL[v.channel]} · {itemCount(v.id).toLocaleString()} items
                                    </p>
                                </div>
                                <Button
                                    color="secondary"
                                    size="sm"
                                    className="min-h-11 shrink-0"
                                    aria-label={`Edit ${v.name}`}
                                    iconLeading={Edit01}
                                    onClick={() => setEditing(v)}
                                >
                                    Edit
                                </Button>
                            </div>
                            <LeadTime vendor={v} />
                            {v.note && <p className="text-sm text-tertiary">{v.note}</p>}
                        </li>
                    ))}
                </ul>
            </Card>
            <p className="text-sm text-tertiary">
                A lead time marked Estimate has not been confirmed by anyone. Where 2026 orders were received, the time they really took is shown underneath,
                measured from your sheets.
            </p>

            <SlideoutMenu isOpen={Boolean(editing)} onOpenChange={(open) => !open && setEditing(undefined)} isDismissable>
                {({ close }) =>
                    editing && (
                        <VendorDrawer
                            key={editing.id}
                            vendor={editing}
                            onClose={close}
                            onSave={(next) => {
                                setList((current) => current.map((v) => (v.id === next.id ? next : v)));
                                setNotice(`${next.name} updated for this session. Reorder points are recalculated when the change is saved in the live app.`);
                                close();
                            }}
                        />
                    )
                }
            </SlideoutMenu>
        </div>
    );
};

// ------------------------------------------------------------------------------------ locations and shelves

const shelvesFor = (loc: LocationId) => {
    const areas = new Map<string, { items: number; shelves: Map<string, number> }>();
    for (const s of stock) {
        if (s.locationId !== loc) continue;
        const area = areas.get(s.area) ?? { items: 0, shelves: new Map<string, number>() };
        area.items += 1;
        area.shelves.set(s.shelf, (area.shelves.get(s.shelf) ?? 0) + 1);
        areas.set(s.area, area);
    }
    return [...areas.entries()].map(([name, a]) => ({ name, items: a.items, shelves: [...a.shelves.entries()].sort((x, y) => x[0].localeCompare(y[0])) }));
};

const LocationsPanel = ({ current }: { current: LocationId }) => {
    const [notice, setNotice] = useState<string>();
    const ordered = [...locations].sort((a, b) => Number(b.id === current) - Number(a.id === current));
    return (
        <div className="flex flex-col gap-5">
            <PanelTitle
                title="Locations and shelves"
                description="Areas and shelf codes come straight from the supply list. Counts follow this order, shelf by shelf."
            />
            {notice && <Notice>{notice}</Notice>}
            {ordered.map((l) => {
                const areas = shelvesFor(l.id);
                const total = areas.reduce((n, a) => n + a.items, 0);
                return (
                    <Card key={l.id} className="flex flex-col gap-4">
                        <CardHeader
                            title={l.name}
                            description={`${areas.length} areas, ${total.toLocaleString()} items${l.id === "newburyport" ? ". Shelf layout copied from Lynnfield until Newburyport's is recorded." : "."}`}
                            actions={
                                <Button
                                    color="secondary"
                                    size="sm"
                                    className="max-lg:min-h-11"
                                    iconLeading={Printer}
                                    onClick={() =>
                                        setNotice(
                                            `Label printing is not wired up in the prototype. The live app makes a sheet of QR shelf labels for ${l.shortName}, one per shelf code.`,
                                        )
                                    }
                                >
                                    Print shelf labels
                                </Button>
                            }
                        />
                        <ul className="flex flex-col divide-y divide-border-secondary">
                            {areas.map((area) => {
                                const coded = area.shelves.filter(([code]) => code);
                                const uncoded = area.shelves.find(([code]) => !code)?.[1] ?? 0;
                                const tooMany = coded.length > 24;
                                return (
                                    <li key={area.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <p className="text-sm font-semibold text-primary">{area.name}</p>
                                            <p className="shrink-0 text-xs text-tertiary">{area.items.toLocaleString()} items</p>
                                        </div>
                                        {tooMany ? (
                                            <p className="text-sm text-tertiary">{coded.length.toLocaleString()} positions, labelled by colour code.</p>
                                        ) : coded.length ? (
                                            <ul className="flex flex-wrap gap-1.5">
                                                {coded.map(([code, n]) => (
                                                    <li
                                                        key={code}
                                                        className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary ring-1 ring-secondary ring-inset"
                                                    >
                                                        {code} <span className="font-normal text-tertiary">· {n}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : null}
                                        {uncoded > 0 && (
                                            <p className="text-xs text-tertiary">
                                                {coded.length
                                                    ? `${uncoded} more items here have no shelf code.`
                                                    : "No shelf codes yet. Items are counted in list order."}
                                            </p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </Card>
                );
            })}
        </div>
    );
};

// ------------------------------------------------------------------------------------ security

const STEP_UP_ACTIONS = [
    { id: "approve-count", label: "Approving a count", on: true },
    { id: "approve-order", label: "Approving an order", on: true },
    { id: "resolve-flag", label: "Resolving or dismissing a flag", on: true },
    { id: "adjust-loss", label: "Adjusting stock as lost, damaged or suspected theft", on: true },
    { id: "edit-par", label: "Changing a par level", on: false },
    { id: "receive", label: "Receiving a delivery", on: false },
];

const SecurityPanel = ({ onOpenIntegrations }: { onOpenIntegrations: () => void }) => {
    const [pinLock, setPinLock] = useState(true);
    const [autoLock, setAutoLock] = useState("2");
    const [stepUp, setStepUp] = useState<Record<string, boolean>>(Object.fromEntries(STEP_UP_ACTIONS.map((a) => [a.id, a.on])));
    return (
        <div className="flex flex-col gap-5">
            <PanelTitle title="Security" description="The salon devices are shared, so the PIN says who did what as well as keeping the app locked." />
            <Card className="flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                        <h3 className="text-sm font-semibold text-primary">PIN lock</h3>
                        <p className="text-sm text-tertiary">
                            Each person unlocks the app with their own 4-digit PIN. Five wrong tries locks the keypad for 60 seconds.
                        </p>
                    </div>
                    <Toggle size="md" aria-label="PIN lock" isSelected={pinLock} onChange={setPinLock} className="min-h-11 shrink-0 items-center" />
                </div>
                <div className={cx("flex flex-col gap-5 border-t border-secondary pt-5", !pinLock && "opacity-50")}>
                    <Select
                        label="Lock automatically after"
                        className="max-w-xs"
                        isDisabled={!pinLock}
                        items={[
                            { id: "1", label: "1 minute without use" },
                            { id: "2", label: "2 minutes without use" },
                            { id: "5", label: "5 minutes without use" },
                            { id: "15", label: "15 minutes without use" },
                        ]}
                        value={autoLock}
                        onChange={(key) => {
                            if (key) setAutoLock(String(key));
                        }}
                        hint="It also locks whenever the app is sent to the background."
                    >
                        {(item) => <Select.Item id={item.id}>{item.label}</Select.Item>}
                    </Select>
                    <fieldset className="flex flex-col gap-1">
                        <legend className="text-sm font-medium text-secondary">Ask for the PIN again before</legend>
                        <p className="mb-2 text-sm text-tertiary">Even when the app is already unlocked, so the action is tied to the person doing it.</p>
                        {STEP_UP_ACTIONS.map((action) => (
                            <Checkbox
                                key={action.id}
                                size="md"
                                className="min-h-11 items-center lg:min-h-9"
                                isDisabled={!pinLock}
                                label={action.label}
                                isSelected={stepUp[action.id] ?? false}
                                onChange={(on) => setStepUp((current) => ({ ...current, [action.id]: on }))}
                            />
                        ))}
                    </fieldset>
                </div>
            </Card>
            <Card className="flex flex-col gap-3">
                <CardHeader title="Sign-in" description="Only invited staff can sign in. There are no passwords to manage." />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-3 ring-1 ring-secondary ring-inset">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-quaternary ring-1 ring-secondary ring-inset">
                            <UserCheck01 className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-primary">Google, through Clerk</p>
                            <p className="text-sm text-tertiary">A forgotten PIN is reset by signing in with Google again.</p>
                        </div>
                    </div>
                    <Badge type="color" color="gray" size="sm">
                        Not connected yet
                    </Badge>
                </div>
                <Button color="link-color" size="sm" className="w-max" onClick={onOpenIntegrations}>
                    See integrations
                </Button>
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ integrations

const INTEGRATIONS: { name: string; icon: FC<{ className?: string }>; does: string; needs: string }[] = [
    {
        name: "Clerk",
        icon: UserCheck01,
        does: "Sign-in with Google and the list of invited staff. Roles and locations are stored against each account.",
        needs: "A Clerk application and its keys.",
    },
    {
        name: "Supabase",
        icon: Server01,
        does: "The database: stock, counts, orders and the audit trail, with row-level rules so each role only sees what it should.",
        needs: "A Supabase project and the migrations in this repo.",
    },
    {
        name: "Resend",
        icon: Mail01,
        does: "Sends the weekly and monthly digests and the urgent alerts by email.",
        needs: "A Resend API key and a verified sending domain.",
    },
    {
        name: "Vercel cron",
        icon: CalendarCheck01,
        does: "Runs the digest on schedule and re-checks the flag rules each night.",
        needs: "The app deployed to Vercel with the cron schedule enabled.",
    },
    {
        name: "Barcode lookup",
        icon: Scan,
        does: "Fills in the product name and photo when an unknown barcode is scanned.",
        needs: "A product-data API key. Scanning known shelf labels works without it.",
    },
    {
        name: "Amazon Business",
        icon: ShoppingBag01,
        does: "Sends approved Amazon orders straight to the account instead of re-typing them.",
        needs: "Amazon Business API approval, which Amazon grants per account.",
    },
    {
        name: "Meevo",
        icon: Clock,
        does: "Reads how many services were booked, so product usage can be forecast from appointments instead of from past orders.",
        needs: "Meevo API access for both salons.",
    },
];

const IntegrationsPanel = () => (
    <div className="flex flex-col gap-5">
        <PanelTitle title="Integrations" description="The services the live app will rely on." />
        <p className="rounded-lg bg-secondary px-3 py-2.5 text-sm text-tertiary ring-1 ring-secondary ring-inset">
            <span className="font-semibold text-secondary">None of these are connected in the prototype. </span>
            Everything on screen runs from the imported spreadsheets and sample data. Nothing is sent, stored or ordered.
        </p>
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {INTEGRATIONS.map((integration) => (
                <li key={integration.name} className="flex flex-col gap-3 rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary ring-inset">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-fg-quaternary ring-1 ring-secondary ring-inset">
                                <integration.icon className="size-5" aria-hidden="true" />
                            </span>
                            <h3 className="text-md font-semibold text-primary">{integration.name}</h3>
                        </div>
                        <Badge type="color" color="gray" size="sm">
                            Not connected yet
                        </Badge>
                    </div>
                    <p className="text-sm text-secondary">{integration.does}</p>
                    <p className="text-xs text-tertiary">
                        <span className="font-semibold">Needs: </span>
                        {integration.needs}
                    </p>
                </li>
            ))}
        </ul>
    </div>
);

// ------------------------------------------------------------------------------------ data

const DataPanel = () => {
    const [notice, setNotice] = useState<string>();
    const count = (kind: "supply" | "polish" | "tips") => items.filter((i) => i.kind === kind).length;
    const imported = purchaseOrders.filter((po) => po.imported);
    const cycles = (loc: LocationId) => new Set(imported.filter((po) => po.locationId === loc).map((po) => `${po.kind}|${po.cycle}`)).size;
    const lines = (loc: LocationId) => imported.filter((po) => po.locationId === loc).reduce((n, po) => n + po.lines.length, 0);
    const polishStocked = stock.filter((s) => getItem(s.itemId)?.kind === "polish").length;

    const workbooks = [
        {
            name: "Lynnfield Inventory List 2026 (Master)",
            brought: [`${count("supply")} supplies`, `${count("polish").toLocaleString()} polish colours`, `${count("tips")} Gel-X tip sets`],
            detail: `Shelves, vendors, par levels and the "Order?" ticks. On-hand for ${polishStocked.toLocaleString()} polish colours.`,
        },
        {
            name: "Lynnfield Inventory Monthly Backlog 2026 (Master)",
            brought: [`${cycles("lynnfield")} order cycles`, `${lines("lynnfield")} order lines`],
            detail: "What was ordered each cycle, what was received and on which date.",
        },
        {
            name: "Newburyport Inventory Order Form 2026 (Master)",
            brought: [`${cycles("newburyport")} order cycles`, `${lines("newburyport")} order lines`],
            detail: "One order form, supplies and polish. Nothing marked received yet.",
        },
    ];

    return (
        <div className="flex flex-col gap-5">
            <PanelTitle title="Data" description="What was brought in from the spreadsheets, and how to get it back out." />
            {notice && <Notice>{notice}</Notice>}
            <Card className="flex flex-col gap-4">
                <CardHeader
                    title="Imported from spreadsheets"
                    description={`Last import ${formatDate(TODAY, true)}. Staff names were removed on the way in.`}
                    actions={<RealDataBadge />}
                />
                <ul className="flex flex-col divide-y divide-border-secondary">
                    {workbooks.map((wb) => (
                        <li key={wb.name} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-fg-brand-primary ring-1 ring-brand_alt ring-inset">
                                <File06 className="size-5" aria-hidden="true" />
                            </span>
                            <div className="flex min-w-0 flex-col gap-1.5">
                                <p className="text-sm font-semibold text-primary">{wb.name}</p>
                                <ul className="flex flex-wrap gap-1.5">
                                    {wb.brought.map((b) => (
                                        <li key={b}>
                                            <Badge type="modern" color="gray" size="sm">
                                                {b}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-sm text-tertiary">{wb.detail}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-col gap-3 border-t border-secondary pt-4 sm:flex-row">
                    <Button
                        color="secondary"
                        size="md"
                        className="max-lg:min-h-11"
                        iconLeading={RefreshCw01}
                        onClick={() =>
                            setNotice(
                                "Re-import is not wired up in the prototype. In the live app it re-reads the three workbooks and shows what would change before anything is overwritten.",
                            )
                        }
                    >
                        Re-import
                    </Button>
                    <Button
                        color="secondary"
                        size="md"
                        className="max-lg:min-h-11"
                        iconLeading={Download01}
                        onClick={() =>
                            setNotice(
                                "Export is not wired up in the prototype. In the live app it downloads items, stock, orders, counts and the full activity log as spreadsheets.",
                            )
                        }
                    >
                        Export all
                    </Button>
                </div>
            </Card>
            <Card className="flex flex-col gap-3">
                <CardHeader
                    title="What is still sample"
                    description="Generated so the screens have something to show. Each one is replaced the first time real data is entered."
                    actions={<SampleBadge />}
                />
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-secondary">
                    <li>Unit costs. The workbooks hold no prices, so every dollar figure is a placeholder until invoices are loaded.</li>
                    <li>On-hand numbers for supplies where the sheet was blank, and all of Newburyport's stock.</li>
                    <li>Staff, counts, usage and stock adjustments.</li>
                </ul>
            </Card>
        </div>
    );
};

// ------------------------------------------------------------------------------------ screen

export interface SettingsScreenProps {
    location?: LocationId;
    /** Which section opens first. */
    tab?: SettingsTab;
}

/** Settings: one section at a time, a vertical list on desktop and scrolling tabs on phones. */
export const SettingsScreen = ({ location: initialLocation = "lynnfield", tab: initialTab = "notifications" }: SettingsScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [tab, setTab] = useState<SettingsTab>(initialTab);
    useUrlSync({ tab: tab === "notifications" ? undefined : tab });
    const isDesktop = useBreakpoint("lg");

    return (
        <AppShell activeUrl={ROUTES.settings} location={location} onLocationChange={setLocation}>
            <PageContent>
                <PageHeader
                    title="Settings"
                    description="How the app alerts, flags, orders and locks."
                    actions={
                        <Button href={ROUTES.team} color="secondary" size="md" className="max-lg:min-h-11">
                            Manage team
                        </Button>
                    }
                />

                <Tabs
                    orientation={isDesktop ? "vertical" : "horizontal"}
                    selectedKey={tab}
                    onSelectionChange={(key) => setTab(key as SettingsTab)}
                    className="gap-5 lg:flex-row lg:items-start lg:gap-10"
                >
                    <div className="-mx-4 scrollbar-hide overflow-x-auto px-4 md:-mx-8 md:px-8 lg:sticky lg:top-8 lg:mx-0 lg:w-56 lg:shrink-0 lg:overflow-visible lg:px-0">
                        <TabList aria-label="Settings sections" type="button-gray" size="sm" className="lg:w-full">
                            {TABS.map((t) => (
                                <Tab key={t.id} id={t.id} icon={t.icon} className="min-h-11 lg:min-h-10 lg:w-full">
                                    {t.label}
                                </Tab>
                            ))}
                        </TabList>
                    </div>

                    <div className="min-w-0 flex-1 lg:max-w-3xl">
                        <TabPanel id="notifications">
                            <NotificationsPanel />
                        </TabPanel>
                        <TabPanel id="flag-rules">
                            <FlagRulesPanel />
                        </TabPanel>
                        <TabPanel id="vendors">
                            <VendorsPanel />
                        </TabPanel>
                        <TabPanel id="locations">
                            <LocationsPanel current={location} />
                        </TabPanel>
                        <TabPanel id="security">
                            <SecurityPanel onOpenIntegrations={() => setTab("integrations")} />
                        </TabPanel>
                        <TabPanel id="integrations">
                            <IntegrationsPanel />
                        </TabPanel>
                        <TabPanel id="data">
                            <DataPanel />
                        </TabPanel>
                    </div>
                </Tabs>

                {(tab === "vendors" || tab === "locations" || tab === "data") && <SampleDataNote />}
            </PageContent>
        </AppShell>
    );
};
