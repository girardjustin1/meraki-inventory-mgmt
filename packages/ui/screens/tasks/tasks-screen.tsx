"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CheckCircle, ClipboardCheck, Plus, ShoppingBag01 } from "@untitledui/icons";
import { Dialog, Modal, ModalOverlay } from "@/components/application/modals/modal";
import { Button } from "@/components/base/buttons/button";
import { NativeSelect } from "@/components/base/select/select-native";
import { AppShell, Card, CardHeader, PageContent, PageHeader, ROUTES, SampleDataNote } from "@/components/meraki/app-shell";
import { AssignPickupDialog, pickupLinesFor } from "@/components/meraki/assign-pickup-dialog";
import { NOTHING_SENT, NOTIFY_HOW } from "@/components/meraki/note-body";
import { TASK_TYPE, TaskCard, canAssignTasks, isOpenTask } from "@/components/meraki/task-card";
import { CURRENT_USER, tasks as allTasks, locationName, purchaseOrders, userById, vendorById } from "@/data/inventory";
import type { LocationId, PurchaseOrder, Task, TaskType, User, Vendor } from "@/data/types";
import { cx } from "@/utils/cx";

type StatusFilter = "open" | "done" | "closed" | "all";

const STATUS_FILTERS: { id: StatusFilter; label: string; match: (t: Task) => boolean }[] = [
    { id: "open", label: "To do", match: (t) => isOpenTask(t.status) },
    { id: "done", label: "Done", match: (t) => t.status === "done" },
    { id: "closed", label: "Declined or cancelled", match: (t) => t.status === "declined" || t.status === "cancelled" },
    { id: "all", label: "All", match: () => true },
];

/** Orders that someone could be sent for now: drafts and approved orders for vendors bought from in person. */
export const pickupGroups = (location: LocationId, orders: PurchaseOrder[] = purchaseOrders) => {
    const groups = new Map<string, { vendor: Vendor; orders: PurchaseOrder[] }>();
    for (const po of orders) {
        if (po.locationId !== location || (po.status !== "draft" && po.status !== "approved")) continue;
        const vendor = vendorById(po.vendorId);
        if (vendor.channel !== "in-store") continue;
        const group = groups.get(vendor.id) ?? { vendor, orders: [] };
        group.orders.push(po);
        groups.set(vendor.id, group);
    }
    return [...groups.values()];
};

const Chip = ({ isSelected, onPress, children }: { isSelected: boolean; onPress: () => void; children: ReactNode }) => (
    <button
        type="button"
        aria-pressed={isSelected}
        onClick={onPress}
        className={cx(
            "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap ring-1 outline-focus-ring transition duration-100 ease-linear ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 lg:min-h-9 lg:px-3",
            isSelected ? "bg-brand-primary_alt text-brand-secondary ring-brand" : "bg-primary text-secondary ring-primary hover:bg-primary_hover",
        )}
    >
        {children}
    </button>
);

const byDue = (a: Task, b: Task) => Number(isOpenTask(b.status)) - Number(isOpenTask(a.status)) || a.dueAt.localeCompare(b.dueAt);

interface SectionProps {
    title: string;
    description: string;
    tasks: Task[];
    viewerId: string;
    variant?: "compact" | "full";
    empty: string;
}

const TaskSection = ({ title, description, tasks, viewerId, variant = "compact", empty }: SectionProps) => (
    <section aria-label={title} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 text-md font-semibold text-primary">
                {title}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary tabular-nums ring-1 ring-secondary ring-inset">
                    {tasks.length}
                </span>
            </h2>
            <p className="text-sm text-tertiary">{description}</p>
        </div>
        {tasks.length > 0 ? (
            <ul className="flex flex-col gap-2">
                {tasks.map((t) => (
                    <li key={t.id}>
                        <TaskCard task={t} variant={variant} viewerId={viewerId} />
                    </li>
                ))}
            </ul>
        ) : (
            <p className="rounded-xl bg-primary px-4 py-5 text-sm text-tertiary ring-1 ring-secondary ring-inset">{empty}</p>
        )}
    </section>
);

interface TasksScreenProps {
    location?: LocationId;
    user?: User;
}

/** Things people have been asked to do: pickup runs, counts and reviews. */
export const TasksScreen = ({ location: initialLocation = "lynnfield", user = CURRENT_USER }: TasksScreenProps) => {
    const [location, setLocation] = useState<LocationId>(initialLocation);
    const [status, setStatus] = useState<StatusFilter>("open");
    const [type, setType] = useState<TaskType | "all">("all");
    const [created, setCreated] = useState<Task[]>([]);
    const [choosing, setChoosing] = useState(false);
    const [pickupFor, setPickupFor] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const canAssign = canAssignTasks(user);
    const groups = pickupGroups(location);
    const activeGroup = groups.find((g) => g.vendor.id === pickupFor);

    const here = [...created, ...allTasks].filter((t) => t.locationId === location);
    const statusFilter = STATUS_FILTERS.find((f) => f.id === status) ?? (STATUS_FILTERS[0] as (typeof STATUS_FILTERS)[number]);
    const matches = (t: Task) => statusFilter.match(t) && (type === "all" || t.type === type);
    const shown = here.filter(matches).sort(byDue);

    const mine = shown.filter((t) => t.assigneeId === user.id);
    const byMe = shown.filter((t) => t.createdBy === user.id && t.assigneeId !== user.id);
    const filtered = status !== "open" || type !== "all";
    const nothingHere = here.length === 0;

    const startPickup = () => {
        if (groups.length === 1) setPickupFor((groups[0] as (typeof groups)[number]).vendor.id);
        else setChoosing(true);
    };

    const filters = (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
                role="group"
                aria-label="Filter by status"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
            >
                {STATUS_FILTERS.map((f) => (
                    <Chip key={f.id} isSelected={status === f.id} onPress={() => setStatus(f.id)}>
                        {f.label}
                        <span className="text-xs tabular-nums opacity-80">{here.filter((t) => f.match(t) && (type === "all" || t.type === type)).length}</span>
                    </Chip>
                ))}
            </div>
            <NativeSelect
                aria-label="Filter by type"
                size="md"
                className="lg:w-56"
                selectClassName="min-h-11 lg:min-h-0"
                value={type}
                onChange={(e) => setType(e.target.value as TaskType | "all")}
                options={[
                    { label: "All types", value: "all" },
                    ...(Object.keys(TASK_TYPE) as TaskType[]).map((t) => ({ label: TASK_TYPE[t].plural, value: t })),
                ]}
            />
        </div>
    );

    const readyCard = canAssign && (
        <Card className="flex flex-col gap-4">
            <CardHeader title="Ready to pick up" description="Orders for stores you buy from in person. Send someone with the pick list." />
            {groups.length > 0 ? (
                <ul className="flex flex-col gap-3">
                    {groups.map((g) => {
                        const lines = pickupLinesFor(g.orders);
                        // Someone may already be on their way for these orders.
                        const running = here.find(
                            (t) => t.type === "pickup-run" && isOpenTask(t.status) && t.orderIds?.some((id) => g.orders.some((o) => o.id === id)),
                        );
                        const runner = userById(running?.assigneeId);
                        return (
                            <li key={g.vendor.id} className="flex flex-col gap-3 rounded-lg bg-secondary p-3 ring-1 ring-secondary ring-inset">
                                <div className="flex items-start gap-3">
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-fg-brand-primary ring-1 ring-secondary ring-inset">
                                        <ShoppingBag01 className="size-5" aria-hidden="true" />
                                    </span>
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <p className="text-sm font-semibold text-primary">{g.vendor.name}</p>
                                        <p className="text-sm text-tertiary">
                                            {g.orders.map((o) => o.number).join(", ")} · {lines.length} {lines.length === 1 ? "line" : "lines"}
                                        </p>
                                    </div>
                                </div>
                                {running && (
                                    <p className="text-sm text-secondary">
                                        {runner?.id === user.id ? "You are" : `${runner?.name ?? "Someone"} is`} already assigned to{" "}
                                        <a
                                            href={ROUTES.task(running.id)}
                                            className="font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                                        >
                                            a run for this order
                                        </a>
                                        .
                                    </p>
                                )}
                                <Button color="secondary" size="md" className="min-h-11 w-full" onClick={() => setPickupFor(g.vendor.id)}>
                                    {running ? "Send someone else as well" : "Send someone"}
                                </Button>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <p className="text-sm text-tertiary">
                    No draft or approved orders for in-store vendors at {locationName(location)} right now. Build one from{" "}
                    <a
                        href={ROUTES.newOrder}
                        className="font-semibold text-brand-secondary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2"
                    >
                        a new order
                    </a>
                    .
                </p>
            )}
            <p className="text-xs text-tertiary">A pickup run does not change stock. Stock changes when the delivery is received.</p>
        </Card>
    );

    return (
        <AppShell activeUrl={ROUTES.tasks} location={location} onLocationChange={setLocation} user={user}>
            <PageContent>
                <PageHeader
                    title={
                        <>
                            Your <em>tasks</em>
                        </>
                    }
                    description={
                        canAssign
                            ? `What you have been asked to do, and what you have asked of others at ${locationName(location)}.`
                            : `What you have been asked to do at ${locationName(location)}.`
                    }
                    actions={
                        canAssign ? (
                            <Button
                                color="primary"
                                size="md"
                                iconLeading={Plus}
                                isDisabled={groups.length === 0}
                                onClick={startPickup}
                                className="max-lg:hidden"
                            >
                                New pickup run
                            </Button>
                        ) : undefined
                    }
                />

                {filters}

                {message && (
                    <p role="status" data-testid="tasks-message" className="flex items-start gap-1.5 text-sm font-medium text-success-primary">
                        <CheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        {message}
                    </p>
                )}

                {nothingHere ? (
                    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-fg-quaternary ring-1 ring-secondary ring-inset">
                            <ClipboardCheck className="size-6" aria-hidden="true" />
                        </span>
                        <div className="flex max-w-sm flex-col gap-1">
                            <p className="text-md font-semibold text-primary">No tasks at {locationName(location)} yet</p>
                            <p className="text-sm text-tertiary">
                                {canAssign
                                    ? "When you send someone for an order, or someone asks you to do something, it is listed here."
                                    : "When someone asks you to do something, such as a pickup run or a count, it is listed here."}
                            </p>
                        </div>
                    </Card>
                ) : (
                    <div className={cx("flex flex-col gap-6", canAssign && "lg:grid lg:grid-cols-3 lg:items-start lg:gap-8")}>
                        <div className={cx("flex min-w-0 flex-col gap-8", canAssign && "lg:col-span-2")}>
                            <TaskSection
                                title="Assigned to me"
                                description="Open one to accept it and get started."
                                tasks={mine}
                                viewerId={user.id}
                                variant="full"
                                empty={filtered ? "Nothing assigned to you matches these filters." : "Nothing is waiting on you."}
                            />
                            {canAssign && (
                                <>
                                    <TaskSection
                                        title="Assigned by me"
                                        description="What you have asked other people to do."
                                        tasks={byMe}
                                        viewerId={user.id}
                                        empty={filtered ? "Nothing you assigned matches these filters." : "You have not asked anyone to do anything yet."}
                                    />
                                    <TaskSection
                                        title="Everyone at this location"
                                        description={`Every task at ${locationName(location)}, whoever asked.`}
                                        tasks={shown}
                                        viewerId={user.id}
                                        empty="No tasks match these filters."
                                    />
                                </>
                            )}
                        </div>
                        {canAssign && <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">{readyCard}</aside>}
                    </div>
                )}

                {nothingHere && readyCard && <div className="lg:max-w-md">{readyCard}</div>}

                <SampleDataNote>Tasks, notes and names here are sample values. Nothing is emailed or pushed from the prototype.</SampleDataNote>

                {canAssign && (
                    <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex rounded-xl bg-primary/95 p-2 shadow-lg ring-1 ring-secondary backdrop-blur lg:hidden">
                        <Button color="primary" size="md" iconLeading={Plus} isDisabled={groups.length === 0} onClick={startPickup} className="min-h-11 flex-1">
                            New pickup run
                        </Button>
                    </div>
                )}

                {choosing && (
                    <ModalOverlay isOpen isDismissable onOpenChange={(open) => !open && setChoosing(false)}>
                        <Modal className="sm:max-w-md">
                            <Dialog aria-label="Choose a store">
                                <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-lg font-semibold text-primary">Which store?</h2>
                                        <p className="text-sm text-tertiary">One run covers one store. These have orders ready.</p>
                                    </div>
                                    <ul className="flex flex-col gap-2">
                                        {groups.map((g) => (
                                            <li key={g.vendor.id}>
                                                <Button
                                                    color="secondary"
                                                    size="lg"
                                                    className="w-full justify-start"
                                                    iconLeading={ShoppingBag01}
                                                    onClick={() => {
                                                        setChoosing(false);
                                                        setPickupFor(g.vendor.id);
                                                    }}
                                                >
                                                    {g.vendor.name} · {g.orders.map((o) => o.number).join(", ")}
                                                </Button>
                                            </li>
                                        ))}
                                    </ul>
                                    <Button color="tertiary" size="md" onClick={() => setChoosing(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </Dialog>
                        </Modal>
                    </ModalOverlay>
                )}

                {activeGroup && (
                    <AssignPickupDialog
                        isOpen
                        onOpenChange={(open) => !open && setPickupFor(null)}
                        orders={activeGroup.orders}
                        vendor={activeGroup.vendor}
                        location={location}
                        user={user}
                        onAssign={(task) => {
                            setCreated((prev) => [task, ...prev]);
                            setStatus("open");
                            setType("all");
                            const who = userById(task.assigneeId);
                            setMessage(
                                who && who.id !== user.id
                                    ? `Pickup run assigned. ${who.name} will be notified ${NOTIFY_HOW}. ${NOTHING_SENT}`
                                    : "Pickup run added to your tasks.",
                            );
                        }}
                    />
                )}
            </PageContent>
        </AppShell>
    );
};
