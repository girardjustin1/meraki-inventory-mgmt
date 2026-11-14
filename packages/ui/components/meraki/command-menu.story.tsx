import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { users } from "@/data/inventory";
import type { User } from "@/data/types";
import { CommandMenu, CommandMenuTrigger } from "./command-menu";

const meta: Meta<typeof CommandMenu> = {
    title: "Meraki/Command menu",
    component: CommandMenu,
    parameters: { layout: "fullscreen" },
    args: { isOpen: true, location: "lynnfield" },
    render: function Render(args) {
        const [open, setOpen] = useState(args.isOpen);
        return (
            <div className="min-h-dvh bg-secondary_alt p-6">
                <div className="max-w-60">
                    <CommandMenuTrigger onPress={() => setOpen(true)} />
                </div>
                <p className="mt-3 text-sm text-tertiary">Press the search field, or Cmd+K inside the app shell.</p>
                <CommandMenu {...args} isOpen={open} onOpenChange={setOpen} />
            </div>
        );
    },
};

export default meta;
type Story = StoryObj<typeof CommandMenu>;

/** Nothing typed: quick actions and what is running low. */
export const Open: Story = {};
/** A product by name. */
export const ProductSearch: Story = { args: { initialQuery: "nugenesis" } };
/** A polish by its colour code. */
export const ColourCode: Story = { args: { initialQuery: "PK01" } };
/** A word that matches many colours: the "see all" row links to Stock with the search applied. */
export const ManyMatches: Story = { args: { initialQuery: "pink" } };
/** An order by its number. */
export const OrderNumber: Story = { args: { initialQuery: "PO-LYN-2611" } };
export const NoResults: Story = { args: { initialQuery: "zzzz" } };
/** A technician sees no orders, flags or admin pages. */
export const AsTechnician: Story = { args: { initialQuery: "order", user: users.find((u) => u.role === "technician") as User } };
export const Mobile: Story = { args: { initialQuery: "top coat" }, globals: { viewport: { value: "mobile", isRotated: false } } };
export const Closed: Story = { args: { isOpen: false } };
