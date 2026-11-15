import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/base/buttons/button";
import { TaskCard } from "@/components/meraki/task-card";
import { CURRENT_USER, purchaseOrders, users, vendorById } from "@/data/inventory";
import type { PurchaseOrder, Task, User } from "@/data/types";
import { AssignPickupDialog } from "./assign-pickup-dialog";
import type { AssignPickupDialogProps } from "./assign-pickup-dialog";

const forVendor = (vendorId: string) => {
    const orders = purchaseOrders.filter((po) => po.vendorId === vendorId && po.locationId === "lynnfield");
    const ready = orders.filter((po) => po.status === "draft" || po.status === "approved");
    return (ready.length > 0 ? ready : orders).slice(0, 1);
};
const costco = forVendor("costco-bjs");
const supply = forVendor("nail-supply-store");
const owner = users.find((u) => u.role === "owner") as User;

/** Opens the dialog and lists the tasks it produced. */
const Demo = ({ startOpen = true, ...props }: Partial<AssignPickupDialogProps> & { startOpen?: boolean }) => {
    const [isOpen, setOpen] = useState(startOpen);
    const [created, setCreated] = useState<Task[]>([]);
    const orders = props.orders ?? costco;
    return (
        <div className="flex max-w-xl flex-col items-start gap-4">
            <Button color="primary" size="md" onClick={() => setOpen(true)}>
                Send someone
            </Button>
            {created.map((t) => (
                <TaskCard key={t.id} task={t} variant="full" href={null} className="w-full" />
            ))}
            <AssignPickupDialog
                orders={orders}
                vendor={props.vendor ?? vendorById((orders[0] as PurchaseOrder).vendorId)}
                location={props.location ?? "lynnfield"}
                user={props.user ?? CURRENT_USER}
                isOpen={isOpen}
                onOpenChange={setOpen}
                onAssign={(task) => setCreated((prev) => [...prev, task])}
            />
        </div>
    );
};

const meta: Meta<typeof AssignPickupDialog> = {
    title: "Meraki/Assign pickup dialog",
    component: AssignPickupDialog,
    parameters: { layout: "padded" },
    render: (args) => <Demo {...args} />,
};

export default meta;
type Story = StoryObj<typeof AssignPickupDialog>;

/** The Lynnfield manager sends someone to Costco for a draft order. Sample order and fictional names. */
export const Desktop: Story = {};

/** A longer pick list from the nail supply store order. */
export const LongPickList: Story = { args: { orders: supply } };

/** Asked by the owner, so choosing the manager who built the order shows the separation-of-duties note. */
export const AsOwner: Story = { args: { user: owner } };

/** Full-screen sheet on a phone. */
export const Mobile: Story = { globals: { viewport: { value: "mobile", isRotated: false } } };
