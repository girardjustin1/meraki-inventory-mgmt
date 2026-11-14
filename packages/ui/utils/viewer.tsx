"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { CURRENT_USER, users } from "@/data/inventory";
import type { User } from "@/data/types";

/**
 * Who is using the app.
 *
 * With Clerk connected this is the signed-in person. In the prototype there is no sign-in, so the
 * app lets you "view as" any of the sample people to see what each role and access level gets.
 * Storybook has no provider, so components fall back to the default sample manager.
 */
interface ViewerContextValue {
    viewer: User;
    /** Present only in the prototype: switch to another sample person. */
    switchViewer?: (userId: string) => void;
}

const ViewerContext = createContext<ViewerContextValue>({ viewer: CURRENT_USER });

export const ViewerProvider = ({ viewerId, onSwitch, children }: { viewerId?: string; onSwitch?: (userId: string) => void; children: ReactNode }) => (
    <ViewerContext.Provider value={{ viewer: users.find((u) => u.id === viewerId) ?? CURRENT_USER, switchViewer: onSwitch }}>{children}</ViewerContext.Provider>
);

export const useViewer = () => useContext(ViewerContext).viewer;
export const useViewerSwitch = () => useContext(ViewerContext).switchViewer;
