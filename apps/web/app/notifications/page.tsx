"use client";

import { NotificationsScreen } from "@/screens/notifications/notifications-screen";
import { useView } from "~/lib/use-view";

export default function Page() {
    const { user, location } = useView();
    return <NotificationsScreen location={location} user={user} />;
}
